import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { exit } from "@tauri-apps/plugin-process";
import { useProjectsStore } from "./stores/projectsStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useUiStore } from "./stores/uiStore";
import { flushAll } from "./lib/persistence";
import { isTauri } from "./lib/ids";
import { startBackupSchedule } from "./lib/backup";
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

    // Cmd+K opens the palette anywhere
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useUiStore.getState().setPaletteOpen(!useUiStore.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);

    // never lose the last few seconds of work on quit
    if (!isTauri()) return () => window.removeEventListener("keydown", onKey);
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
