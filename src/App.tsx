import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useProjectsStore } from "./stores/projectsStore";
import { useSettingsStore } from "./stores/settingsStore";
import { flushAll } from "./lib/persistence";
import { isTauri } from "./lib/ids";
import { useFileDrop } from "./hooks/useFileDrop";
import { TabBar } from "./components/layout/TabBar";
import { ProjectBoard } from "./components/layout/ProjectBoard";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { Toasts } from "./components/ui/Toasts";

export default function App() {
  const projectsLoaded = useProjectsStore((s) => s.loaded);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const hoverBlockId = useFileDrop();

  useEffect(() => {
    void useSettingsStore.getState().load();
    void useProjectsStore.getState().load();

    // never lose the last few seconds of work on quit
    if (!isTauri()) return;
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async () => {
      await flushAll();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // highlight the file-organizer block under the cursor during a Finder drag
  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>("[data-block-type='file-organizer']")
      .forEach((el) => {
        const active = el.dataset.blockId === hoverBlockId;
        el.style.outline = active ? "2.5px solid var(--color-accent)" : "";
        el.style.outlineOffset = active ? "3px" : "";
      });
  }, [hoverBlockId]);

  if (!projectsLoaded || !settingsLoaded) {
    return <div className="flex h-full items-center justify-center" />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="bg-wash" />
      <div className="noise-overlay" />
      <TabBar />
      <ProjectBoard />
      <SettingsPanel />
      <Toasts />
    </div>
  );
}
