import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
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

/** Visual hint while another project is dragged over this row. */
export type DropHint = "group" | "before" | "after" | null;

function ProjectRow({
  tab,
  isActive,
  inFolder,
  dropHint = null,
  sortable = true,
}: {
  tab: ProjectTab;
  isActive: boolean;
  inFolder: boolean;
  dropHint?: DropHint;
  /** pinned rows live outside the sortable list, so they do not reorder */
  sortable?: boolean;
}) {
  const {
    setActiveTab,
    renameTab,
    closeTab,
    restoreTab,
    groupProjects,
    moveTabToFolder,
    toggleTabPinned,
    tabs,
  } = useProjectsStore();
  const { showToast, setActiveView } = useUiStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.name);
  const { menuPos, setMenuPos, menuRef, menuButtonRef, openAt } = useMenu();
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: tab.id,
    disabled: editing || inFolder || !sortable,
  });

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
      style={{
        opacity: isDragging ? 0.45 : 1,
        // rows stay put during a drag; the hint says what a drop will do:
        // accent ring = group into a folder, edge line = reorder
        boxShadow:
          dropHint === "group"
            ? "0 0 0 2px var(--color-accent)"
            : dropHint === "before"
              ? "0 -2px 0 0 var(--color-accent)"
              : dropHint === "after"
                ? "0 2px 0 0 var(--color-accent)"
                : undefined,
        background:
          dropHint === "group"
            ? "color-mix(in srgb, var(--color-accent) 18%, transparent)"
            : undefined,
      }}
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
      {tab.pinned && !editing && (
        <span className="shrink-0 text-[10px] opacity-60" title="Vastgezet">
          📌
        </span>
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
            <button
              onClick={() => {
                toggleTabPinned(tab.id);
                setMenuPos(null);
              }}
              className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
            >
              {tab.pinned ? "📌 Losmaken" : "📌 Vastzetten bovenaan"}
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

function FolderRow({
  folder,
  children,
  dropHint = null,
}: {
  folder: ProjectFolder;
  children: React.ReactNode;
  dropHint?: "before" | "after" | null;
}) {
  const { renameFolder, toggleFolder, dissolveFolder } = useProjectsStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const { menuPos, setMenuPos, menuRef, menuButtonRef, openAt } = useMenu();
  const inputRef = useRef<HTMLInputElement>(null);
  // the pointer sensor only starts a drag after 6px, so a plain click still
  // reaches the collapse toggle underneath
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: folder.id,
    disabled: editing,
  });

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    renameFolder(folder.id, draft);
    setEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0.45 : 1,
        // rows stay put while dragging, so an edge line is the only thing
        // telling you where the folder will land
        boxShadow:
          dropHint === "before"
            ? "0 -2px 0 0 var(--color-accent)"
            : dropHint === "after"
              ? "0 2px 0 0 var(--color-accent)"
              : undefined,
      }}
    >
      <div
        {...attributes}
        {...listeners}
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
            onPointerDown={(e) => e.stopPropagation()}
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
          onPointerDown={(e) => e.stopPropagation()}
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

/** No-displacement strategy: rows never shift away while dragging. */
const stayPut = () => null;

export function ProjectList() {
  const { tabs, folders, activeTabId, reorderTabs, reorderFolders, groupProjects } =
    useProjectsStore();
  const showToast = useUiStore((s) => s.showToast);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [drag, setDrag] = useState<{
    activeId: string | null;
    overId: string | null;
    zone: DropHint;
  }>({ activeId: null, overId: null, zone: null });
  const [folderDrag, setFolderDrag] = useState<string | null>(null);
  const [folderOver, setFolderOver] = useState<{ id: string; side: "before" | "after" } | null>(
    null,
  );

  const folderSide = (e: DragMoveEvent | DragEndEvent): "before" | "after" | null => {
    if (!e.over || e.active.id === e.over.id) return null;
    const activeRect = e.active.rect.current.translated;
    if (!activeRect) return null;
    return activeRect.top + activeRect.height / 2 <
      e.over.rect.top + e.over.rect.height / 2
      ? "before"
      : "after";
  };

  // on top of a row = group into a folder, near an edge = reorder
  const zoneFor = (e: DragMoveEvent | DragEndEvent): DropHint => {
    if (!e.over || e.active.id === e.over.id) return null;
    const activeRect = e.active.rect.current.translated;
    if (!activeRect) return null;
    const overRect = e.over.rect;
    const diff =
      activeRect.top + activeRect.height / 2 - (overRect.top + overRect.height / 2);
    if (Math.abs(diff) < overRect.height * 0.4) return "group";
    return diff < 0 ? "before" : "after";
  };

  const onDragEnd = (e: DragEndEvent) => {
    const zone = zoneFor(e);
    setDrag({ activeId: null, overId: null, zone: null });
    if (!e.over || e.active.id === e.over.id) return;
    if (zone === "group") {
      const a = tabs.find((t) => t.id === e.active.id);
      const b = tabs.find((t) => t.id === e.over!.id);
      groupProjects(String(e.active.id), String(e.over.id));
      if (a && b) showToast(`"${a.name}" en "${b.name}" staan nu in een map`);
    } else if (zone) {
      reorderTabs(String(e.active.id), String(e.over.id));
    }
  };

  // pinned projects are lifted out of their folder and out of the loose list, so
  // each one shows up exactly once
  const pinned = tabs.filter((t) => t.pinned);
  const rest = tabs.filter((t) => !t.pinned);
  const loose = rest.filter((t) => !t.folderId || !folders.some((f) => f.id === t.folderId));
  const activeTab = drag.activeId ? tabs.find((t) => t.id === drag.activeId) : null;
  const activeFolder = folderDrag ? folders.find((f) => f.id === folderDrag) : null;

  return (
    <div className="space-y-0.5">
      {pinned.length > 0 && (
        <>
          <p className="px-2.5 pb-0.5 pt-1 text-[10.5px] uppercase tracking-wide text-ink-soft">
            Vastgezet
          </p>
          {pinned.map((tab) => (
            <ProjectRow
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              inFolder={false}
              sortable={false}
            />
          ))}
          <div className="my-1 h-px bg-border-themed/30" />
        </>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setFolderDrag(String(e.active.id))}
        onDragMove={(e) => {
          const side = folderSide(e);
          setFolderOver(side && e.over ? { id: String(e.over.id), side } : null);
        }}
        onDragCancel={() => {
          setFolderDrag(null);
          setFolderOver(null);
        }}
        onDragEnd={(e) => {
          setFolderDrag(null);
          setFolderOver(null);
          if (e.over && e.active.id !== e.over.id) {
            reorderFolders(String(e.active.id), String(e.over.id));
          }
        }}
      >
        <SortableContext items={folders.map((f) => f.id)} strategy={stayPut}>
          {folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              dropHint={folderOver?.id === folder.id ? folderOver.side : null}
            >
              {rest
                .filter((t) => t.folderId === folder.id)
                .map((tab) => (
                  <ProjectRow key={tab.id} tab={tab} isActive={tab.id === activeTabId} inFolder />
                ))}
            </FolderRow>
          ))}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeFolder ? (
            <div className="panel heading truncate px-2.5 py-1.5 text-[13px]">
              🗂 {activeFolder.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setDrag({ activeId: String(e.active.id), overId: null, zone: null })}
        onDragMove={(e) => {
          const zone = zoneFor(e);
          setDrag((d) => ({ ...d, overId: zone && e.over ? String(e.over.id) : null, zone }));
        }}
        onDragCancel={() => setDrag({ activeId: null, overId: null, zone: null })}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={loose.map((t) => t.id)} strategy={stayPut}>
          {loose.map((tab) => (
            <ProjectRow
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              inFolder={false}
              dropHint={drag.overId === tab.id ? drag.zone : null}
            />
          ))}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeTab ? (
            <div className="panel heading truncate px-2.5 py-1.5 text-[13px]">{activeTab.name}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
