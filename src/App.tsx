import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { exit } from "@tauri-apps/plugin-process";
import { useProjectsStore } from "./stores/projectsStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useUiStore } from "./stores/uiStore";
import { flushAll } from "./lib/persistence";
import { isTauri } from "./lib/ids";
import { isTypingTarget, matches } from "./lib/shortcuts";
import { runExportFull } from "./lib/exportActions";
import { startBackupSchedule } from "./lib/backup";
import { startUpdateWatch } from "./lib/updater";
import { sweepUnusedImages } from "./lib/moodboard";
import { syncCaptureHotkey } from "./lib/quickCapture";
import { sweepUnusedFavicons } from "./lib/links";
import { hasPasteContent, pasteToCanvas, readClipboard } from "./lib/pasteToCanvas";
import { useFileDrop } from "./hooks/useFileDrop";
import { Sidebar } from "./components/layout/Sidebar";
import { CanvasBoard } from "./components/layout/CanvasBoard";
import { SettingsView } from "./components/settings/SettingsView";
import { CommandPalette } from "./components/ui/CommandPalette";
import { Toasts } from "./components/ui/Toasts";

export default function App() {
  const projectsLoaded = useProjectsStore((s) => s.loaded);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const activeView = useUiStore((s) => s.activeView);
  const hoverBlockId = useFileDrop();

  // Registered by macOS rather than the webview, so it has to be handed to Rust
  // on load and on every change instead of living in the keydown chain.
  const captureBinding = useSettingsStore((s) => s.shortcuts.quickCapture);
  const settingsReady = useSettingsStore((s) => s.loaded);
  useEffect(() => {
    if (!settingsReady) return;
    void syncCaptureHotkey(captureBinding).then((error) => {
      if (error) useUiStore.getState().showToast(error, undefined, undefined, { persist: true });
    });
  }, [captureBinding, settingsReady]);

  useEffect(() => {
    void useSettingsStore.getState().load();
    void useProjectsStore
      .getState()
      .load()
      .then(() => {
        startBackupSchedule();
        // Deleting a board or an image is undoable, so their files stay put and
        // the orphans are collected here instead, once undo history is gone.
        //
        // Never after a failed load: the store seeds an empty project then, and
        // sweeping against that would delete every image while the real data is
        // still sitting in data.json.bak waiting to be recovered.
        const state = useProjectsStore.getState();
        if (state.loadFailed) return;
        const files = state.tabs.flatMap((tab) =>
          tab.blocks.flatMap((b) => (b.type === "moodboard" ? b.images.map((i) => i.file) : [])),
        );
        void sweepUnusedImages(files);
        // Favicons live in their own folder precisely so the image sweep above
        // does not eat them: every favicon has an image extension and no block
        // claims it as an image.
        const icons = state.tabs.flatMap((tab) =>
          tab.blocks.flatMap((b) => (b.type === "link" && b.favicon ? [b.favicon] : [])),
        );
        void sweepUnusedFavicons(icons);
      });

    // stil op de achtergrond: alleen een melding als er echt iets nieuws is
    const stopUpdateWatch = startUpdateWatch();

    // user-configurable shortcuts (Instellingen -> Sneltoetsen)
    const onKey = (e: KeyboardEvent) => {
      const ui = useUiStore.getState();
      if (ui.recordingShortcut) return; // the recorder owns the keyboard
      const { shortcuts } = useSettingsStore.getState();
      const typing = isTypingTarget(e.target);

      // Fixed rather than configurable: cmd+plus, cmd+minus and cmd+0 mean zoom
      // in every app, and a user who rebound them would only surprise themselves.
      const ui2 = useUiStore.getState();
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        ui2.setZoom(ui2.zoom + 0.15);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "-") {
        e.preventDefault();
        ui2.setZoom(ui2.zoom - 0.15);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        ui2.setZoom(1);
        return;
      }

      if (matches(shortcuts.palette, e)) {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
      } else if (matches(shortcuts.newBlock, e)) {
        e.preventDefault();
        ui.setActiveView("canvas");
        useProjectsStore.getState().addBlock();
      } else if (matches(shortcuts.toggleSidebar, e)) {
        e.preventDefault();
        const s = useSettingsStore.getState();
        s.update({ sidebarCollapsed: !s.sidebarCollapsed });
      } else if (matches(shortcuts.settings, e)) {
        e.preventDefault();
        ui.setActiveView(ui.activeView === "settings" ? "canvas" : "settings");
      } else if (matches(shortcuts.undo, e) && !typing) {
        // Only outside a text field: inside one, ProseMirror's own history owns
        // these keys, and app-level undo would throw away the sentence instead.
        e.preventDefault();
        useProjectsStore.getState().undo();
      } else if (matches(shortcuts.redo, e) && !typing) {
        e.preventDefault();
        useProjectsStore.getState().redo();
      } else if (matches(shortcuts.exportProject, e) && !typing) {
        e.preventDefault();
        const p = useProjectsStore.getState();
        const tab = p.tabs.find((t) => t.id === p.activeTabId);
        if (tab) void runExportFull(tab);
      }
    };
    window.addEventListener("keydown", onKey);

    // Last in line: an editor, an input or a hovered moodboard all claim a
    // paste before this does, so what arrives here was aimed at the canvas.
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (useUiStore.getState().activeView !== "canvas") return;
      if (useUiStore.getState().paletteOpen) return;
      if (!e.clipboardData || e.defaultPrevented) return;
      // Read and decide now: the DataTransfer dies with this handler, and a
      // preventDefault after an await would come too late to mean anything.
      const pasted = readClipboard(e.clipboardData);
      if (!hasPasteContent(pasted)) return;
      e.preventDefault();
      void pasteToCanvas(pasted);
    };
    window.addEventListener("paste", onPaste);

    // never lose the last few seconds of work on quit
    if (!isTauri())
      return () => {
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("paste", onPaste);
        stopUpdateWatch();
      };
    // Quick capture lives in its own window with no disk access, so it hands
    // the text over and this window, the only writer, files it away.
    const unlistenCapture = listen<{ text: string }>("quick-capture", (event) => {
      const text = event.payload?.text ?? "";
      if (!text.trim()) return;
      useProjectsStore.getState().addToInbox(text);
      useUiStore.getState().showToast("Toegevoegd aan Inbox");
    });

    const win = getCurrentWindow();
    const unlistenClose = win.onCloseRequested(async () => {
      await flushAll();
    });
    // Cmd+Q skips close-requested; Rust prevents the exit once and emits this
    const unlistenExit = listen("exit-requested", async () => {
      try {
        await flushAll();
      } finally {
        await exit(0);
      }
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
      stopUpdateWatch();
      void unlistenCapture.then((fn) => fn());
      void unlistenClose.then((fn) => fn());
      void unlistenExit.then((fn) => fn());
    };
  }, []);

  // highlight the block under the cursor during a Finder drag
  useEffect(() => {
    document.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
      const active = el.dataset.blockId === hoverBlockId;
      el.style.outline = active ? "2.5px solid var(--color-accent)" : "";
      el.style.outlineOffset = active ? "3px" : "";
    });
  }, [hoverBlockId]);

  if (!projectsLoaded || !settingsLoaded) {
    return <div className="flex h-full items-center justify-center" />;
  }

  return (
    <div className="flex h-full flex-row">
      <div className="bg-wash" />
      <div className="noise-overlay" />
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        {activeView === "settings" ? <SettingsView /> : <CanvasBoard />}
      </main>
      <CommandPalette />
      <Toasts />
    </div>
  );
}
