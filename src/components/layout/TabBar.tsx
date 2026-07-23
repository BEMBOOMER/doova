import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useProjectsStore } from "../../stores/projectsStore";
import { useUiStore } from "../../stores/uiStore";
import type { ProjectTab } from "../../types";

function Tab({ tab, isActive }: { tab: ProjectTab; isActive: boolean }) {
  const { setActiveTab, renameTab, closeTab, restoreTab } = useProjectsStore();
  const showToast = useUiStore((s) => s.showToast);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tab.id, disabled: editing });

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    renameTab(tab.id, draft);
    setEditing(false);
  };

  const close = (e: React.MouseEvent) => {
    e.stopPropagation();
    const index = useProjectsStore.getState().tabs.findIndex((t) => t.id === tab.id);
    closeTab(tab.id);
    showToast(`"${tab.name}" gesloten`, "Herstel", () => restoreTab(tab, index));
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      {...attributes}
      {...listeners}
      onClick={() => setActiveTab(tab.id)}
      onDoubleClick={() => { setDraft(tab.name); setEditing(true); }}
      className={`group relative flex h-8 max-w-48 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-themed-sm px-3 text-[13px] transition-colors ${
        isActive
          ? "bg-accent text-accent-ink font-semibold shadow-themed-sm"
          : "bg-surface text-ink hover:bg-surface-raised"
      }`}
      data-tab-chrome
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-28 bg-transparent text-[13px] outline-none"
        />
      ) : (
        <span className="heading truncate">{tab.name}</span>
      )}
      <button
        onClick={close}
        className="ml-0.5 hidden h-4 w-4 shrink-0 items-center justify-center rounded-full text-[11px] leading-none opacity-70 hover:opacity-100 group-hover:flex"
        title="Project sluiten"
      >
        ✕
      </button>
    </div>
  );
}

export function TabBar() {
  const { tabs, activeTabId, addTab, reorderTabs } = useProjectsStore();
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) {
      reorderTabs(String(e.active.id), String(e.over.id));
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center gap-2 pl-[86px] pr-3"
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
            {tabs.map((tab) => (
              <Tab key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        onClick={addTab}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-themed-sm bg-surface text-base text-ink-soft transition-colors hover:bg-surface-raised hover:text-ink"
        title="Nieuw project"
      >
        +
      </button>
      <div data-tauri-drag-region className="h-full min-w-4 flex-1" />
      <button
        onClick={() => setSettingsOpen(true)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-themed-sm bg-surface text-[15px] text-ink-soft transition-colors hover:bg-surface-raised hover:text-ink"
        title="Instellingen"
      >
        ⚙
      </button>
    </div>
  );
}
