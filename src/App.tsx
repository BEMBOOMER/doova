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

  useEffect(() => {
    void useSettingsStore.getState().load();
    void useProjectsStore.getState().load().then(() => startBackupSchedule());

    // stil op de achtergrond: alleen een melding als er echt iets nieuws is
    const stopUpdateWatch = startUpdateWatch();

    // user-configurable shortcuts (Instellingen -> Sneltoetsen)
    const onKey = (e: KeyboardEvent) => {
      const ui = useUiStore.getState();
      if (ui.recordingShortcut) return; // the recorder owns the keyboard
      const { shortcuts } = useSettingsStore.getState();
      const typing = isTypingTarget(e.target);

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
      } else if (matches(shortcuts.exportProject, e) && !typing) {
        e.preventDefault();
        const p = useProjectsStore.getState();
        const tab = p.tabs.find((t) => t.id === p.activeTabId);
        if (tab) void runExportFull(tab);
      }
    };
    window.addEventListener("keydown", onKey);

    // never lose the last few seconds of work on quit
    if (!isTauri())
      return () => {
        window.removeEventListener("keydown", onKey);
        stopUpdateWatch();
      };
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
      stopUpdateWatch();
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
