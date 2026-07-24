import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { useProjectsStore } from "../../stores/projectsStore";
import { ProjectList } from "./ProjectList";

export function Sidebar() {
  const collapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const update = useSettingsStore((s) => s.update);
  const { activeView, setActiveView, setPaletteOpen } = useUiStore();
  const addTab = useProjectsStore((s) => s.addTab);

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center">
        <div data-tauri-drag-region className="h-[38px] w-full shrink-0" />
        <button
          onClick={() => update({ sidebarCollapsed: false })}
          className="mt-2 flex h-8 w-8 items-center justify-center rounded-themed-sm text-ink-soft hover:bg-surface-raised hover:text-ink"
          title="Zijbalk openen"
        >
          ⇥
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar-glass flex w-60 shrink-0 flex-col">
      {/* traffic lights float here; also the window-drag strip */}
      <div data-tauri-drag-region className="flex h-[38px] shrink-0 items-end justify-end px-2">
        <button
          onClick={() => update({ sidebarCollapsed: true })}
          className="flex h-6 w-6 items-center justify-center rounded text-[13px] text-ink-soft hover:text-ink"
          title="Zijbalk inklappen"
        >
          ⇤
        </button>
      </div>

      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <span className="heading text-[12px] uppercase tracking-wide text-ink-soft">Projecten</span>
        <button
          onClick={addTab}
          className="flex h-5 w-5 items-center justify-center rounded text-[14px] text-ink-soft hover:text-ink"
          title="Nieuw project"
        >
          +
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        <ProjectList />
      </div>

      <div className="shrink-0 space-y-0.5 border-t border-border-themed/40 p-2">
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex w-full items-center gap-2 rounded-themed-sm px-2.5 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:bg-surface-raised hover:text-ink"
        >
          <span>⌘K</span> Zoeken & acties
        </button>
        <button
          onClick={() => setActiveView(activeView === "settings" ? "canvas" : "settings")}
          className={`flex w-full items-center gap-2 rounded-themed-sm px-2.5 py-1.5 text-[12.5px] transition-colors ${
            activeView === "settings"
              ? "bg-accent text-accent-ink"
              : "text-ink-soft hover:bg-surface-raised hover:text-ink"
          }`}
        >
          <span>☼</span> Instellingen
        </button>
      </div>
    </aside>
  );
}
