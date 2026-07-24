import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectFolder, ProjectTab } from "../../types";
import { useProjectsStore } from "../../stores/projectsStore";
import { useUiStore } from "../../stores/uiStore";

function useMenu() {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuPos) return;
    const onDown = (e: MouseEvent) => {
      if (menuButtonRef.current?.contains(e.target as Node)) return;
      if (!menuRef.current?.contains(e.target as Node)) setMenuPos(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuPos]);

  const openAt = (x: number, y: number) =>
    setMenuPos({
      x: Math.min(x, window.innerWidth - 210),
      y: Math.min(y, window.innerHeight - 240),
    });

  return { menuPos, setMenuPos, menuRef, menuButtonRef, openAt };
}

function ProjectRow({
  tab,
  isActive,
  inFolder,
}: {
  tab: ProjectTab;
  isActive: boolean;
  inFolder: boolean;
}) {
  const { setActiveTab, renameTab, closeTab, restoreTab, groupProjects, moveTabToFolder, tabs } =
    useProjectsStore();
  const { showToast, setActiveView } = useUiStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.name);
  const { menuPos, setMenuPos, menuRef, menuButtonRef, openAt } = useMenu();
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tab.id, disabled: editing || inFolder });

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    renameTab(tab.id, draft);
    setEditing(false);
  };

  const close = () => {
    const index = useProjectsStore.getState().tabs.findIndex((t) => t.id === tab.id);
    closeTab(tab.id);
    showToast(`"${tab.name}" gesloten`, "Herstel", () => restoreTab(tab, index));
    setMenuPos(null);
  };

  const others = tabs.filter((t) => t.id !== tab.id);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      {...attributes}
      {...listeners}
      onClick={() => {
        setActiveTab(tab.id);
        setActiveView("canvas");
      }}
      onDoubleClick={() => {
        setDraft(tab.name);
        setEditing(true);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        openAt(e.clientX, e.clientY);
      }}
      className={`group flex cursor-pointer items-center gap-2 rounded-themed-sm py-1.5 pr-2.5 text-[13px] transition-colors ${
        inFolder ? "pl-7" : "pl-2.5"
      } ${isActive ? "bg-accent font-semibold text-accent-ink" : "text-ink hover:bg-surface-raised"}`}
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
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full bg-transparent text-[13px] outline-none"
        />
      ) : (
        <span className="heading min-w-0 flex-1 truncate">{tab.name}</span>
      )}
      <button
        ref={menuButtonRef}
        onMouseUp={(e) => {
          // mouseup instead of click: WebKit can swallow click after a
          // propagation-stopped pointerdown inside a dnd-kit sortable
          e.stopPropagation();
          if (menuPos) {
            setMenuPos(null);
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          openAt(rect.right + 4, rect.top);
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={`h-5 w-5 shrink-0 items-center justify-center rounded text-[12px] opacity-70 hover:opacity-100 ${
          isActive ? "flex" : "hidden group-hover:flex"
        }`}
        title="Opties"
      >
        ⋯
      </button>
      {menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="panel pop-in fixed z-50 p-1.5"
            style={{ left: menuPos.x, top: menuPos.y, width: 200 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setMenuPos(null);
                setDraft(tab.name);
                setEditing(true);
              }}
              className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
            >
              ✎ Hernoemen
            </button>
            {inFolder && (
              <button
                onClick={() => {
                  moveTabToFolder(tab.id, null);
                  setMenuPos(null);
                }}
                className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
              >
                ⇱ Uit map halen
              </button>
            )}
            {others.length > 0 && (
              <>
                <p className="mb-0.5 mt-1.5 px-2 text-[11px] text-ink-soft">Groepeer met…</p>
                {others.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      groupProjects(tab.id, t.id);
                      showToast(`"${tab.name}" en "${t.name}" staan nu in een map`);
                      setMenuPos(null);
                    }}
                    className="w-full truncate rounded-themed-sm px-2 py-1 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
                  >
                    🗂 {t.name}
                  </button>
                ))}
              </>
            )}
            <button
              onClick={close}
              className="mt-1 w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] text-[#ff3b30] hover:bg-[#ff3b30] hover:text-white"
            >
              ✕ Sluiten
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

function FolderRow({ folder, children }: { folder: ProjectFolder; children: React.ReactNode }) {
  const { renameFolder, toggleFolder, dissolveFolder } = useProjectsStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const { menuPos, setMenuPos, menuRef, menuButtonRef, openAt } = useMenu();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    renameFolder(folder.id, draft);
    setEditing(false);
  };

  return (
    <div>
      <div
        onClick={() => toggleFolder(folder.id)}
        onDoubleClick={() => {
          setDraft(folder.name);
          setEditing(true);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openAt(e.clientX, e.clientY);
        }}
        className="group flex cursor-pointer items-center gap-1.5 rounded-themed-sm px-2.5 py-1.5 text-[13px] text-ink-soft transition-colors hover:bg-surface-raised hover:text-ink"
      >
        <span
          className="text-[10px] transition-transform"
          style={{ rotate: folder.collapsed ? "0deg" : "90deg" }}
        >
          ▶
        </span>
        <span className="text-[13px]">🗂</span>
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
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent text-[13px] outline-none"
          />
        ) : (
          <span className="heading min-w-0 flex-1 truncate">{folder.name}</span>
        )}
        <button
          ref={menuButtonRef}
          onMouseUp={(e) => {
            e.stopPropagation();
            if (menuPos) {
              setMenuPos(null);
              return;
            }
            const rect = e.currentTarget.getBoundingClientRect();
            openAt(rect.right + 4, rect.top);
          }}
          onClick={(e) => e.stopPropagation()}
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-[12px] opacity-70 hover:opacity-100 group-hover:flex"
          title="Map-opties"
        >
          ⋯
        </button>
      </div>
      {!folder.collapsed && <div className="space-y-0.5">{children}</div>}
      {menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="panel pop-in fixed z-50 p-1.5"
            style={{ left: menuPos.x, top: menuPos.y, width: 200 }}
          >
            <button
              onClick={() => {
                setMenuPos(null);
                setDraft(folder.name);
                setEditing(true);
              }}
              className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
            >
              ✎ Hernoemen
            </button>
            <button
              onClick={() => {
                dissolveFolder(folder.id);
                setMenuPos(null);
              }}
              className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
            >
              ⇱ Map opheffen (projecten blijven)
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function ProjectList() {
  const { tabs, folders, activeTabId, reorderTabs } = useProjectsStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) {
      reorderTabs(String(e.active.id), String(e.over.id));
    }
  };

  const loose = tabs.filter((t) => !t.folderId || !folders.some((f) => f.id === t.folderId));

  return (
    <div className="space-y-0.5">
      {folders.map((folder) => (
        <FolderRow key={folder.id} folder={folder}>
          {tabs
            .filter((t) => t.folderId === folder.id)
            .map((tab) => (
              <ProjectRow key={tab.id} tab={tab} isActive={tab.id === activeTabId} inFolder />
            ))}
        </FolderRow>
      ))}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={loose.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {loose.map((tab) => (
            <ProjectRow key={tab.id} tab={tab} isActive={tab.id === activeTabId} inFolder={false} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
