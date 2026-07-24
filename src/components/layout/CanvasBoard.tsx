import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Block, BlockGroup } from "../../types";
import { useProjectsStore } from "../../stores/projectsStore";
import { useUiStore } from "../../stores/uiStore";
import { CanvasBlock } from "../blocks/CanvasBlock";

/** Pill above an expanded group, and chip that replaces a collapsed one. */
function GroupOverlay({ group, members }: { group: BlockGroup; members: Block[] }) {
  const { toggleBlockGroup, renameBlockGroup, dissolveBlockGroup } = useProjectsStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!menuPos) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuPos(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuPos]);

  const commit = () => {
    renameBlockGroup(group.id, draft);
    setEditing(false);
  };

  const name = editing ? (
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
      className="w-24 bg-transparent text-[12px] outline-none"
    />
  ) : (
    <span className="heading truncate text-[12px]">{group.name}</span>
  );

  const menu =
    menuPos &&
    createPortal(
      <div
        ref={menuRef}
        className="panel pop-in fixed z-[80] p-1.5"
        style={{ left: menuPos.x, top: menuPos.y, width: 190 }}
      >
        <button
          onClick={() => {
            setMenuPos(null);
            setDraft(group.name);
            setEditing(true);
          }}
          className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
        >
          ✎ Hernoemen
        </button>
        <button
          onClick={() => {
            dissolveBlockGroup(group.id);
            setMenuPos(null);
          }}
          className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
        >
          ⇱ Groep opheffen (blokken blijven)
        </button>
      </div>,
      document.body,
    );

  if (group.collapsed) {
    return (
      <div
        className="panel pop-in absolute flex cursor-pointer items-center gap-2 px-3 py-2.5"
        style={{ left: group.x, top: group.y, width: 230, zIndex: 500 }}
        onClick={() => toggleBlockGroup(group.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(group.name);
          setEditing(true);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuPos({ x: e.clientX, y: e.clientY });
        }}
        title="Klik om uit te klappen"
      >
        <span className="text-[13px]">🗂</span>
        <span className="min-w-0 flex-1">{name}</span>
        <span className="shrink-0 text-[11px] text-ink-soft">{members.length} blokken ▸</span>
        {menu}
      </div>
    );
  }

  const minX = Math.min(...members.map((b) => b.layout.x));
  const minY = Math.min(...members.map((b) => b.layout.y));

  return (
    <div
      className="panel absolute flex cursor-pointer items-center gap-1.5 px-2.5 py-1"
      style={{ left: minX, top: Math.max(0, minY - 34), zIndex: 500 }}
      onClick={() => toggleBlockGroup(group.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(group.name);
        setEditing(true);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuPos({ x: e.clientX, y: e.clientY });
      }}
      title="Klik om in te klappen"
    >
      <span className="text-[10px]">▾</span>
      {name}
      <span className="text-[10.5px] text-ink-soft">{members.length}</span>
      {menu}
    </div>
  );
}

/**
 * Canvas is generously sized and grow-only, so resizing or moving a block
 * never makes the whole board reflow or the scrollbars jump around.
 */
const MIN_CANVAS = { width: 3200, height: 2200 };
const CANVAS_MARGIN = 600;

export function CanvasBoard() {
  const { tabs, activeTabId, addBlock, addCalendarBlock } = useProjectsStore();
  const setSelectedBlockId = useUiStore((s) => s.setSelectedBlockId);
  const tab = tabs.find((t) => t.id === activeTabId);

  const targetsRef = useRef(new Map<string, HTMLElement>());
  const [, bump] = useState(0);
  const registerTarget = useCallback((id: string, el: HTMLElement | null) => {
    const map = targetsRef.current;
    if (el) {
      if (map.get(id) !== el) {
        map.set(id, el);
        bump((n) => n + 1); // other blocks need the fresh element for snap guidelines
      }
    } else if (map.delete(id)) {
      bump((n) => n + 1);
    }
  }, []);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!ctxRef.current?.contains(e.target as Node)) setCtxMenu(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [ctxMenu]);

  if (!tab) {
    return (
      <div className="flex flex-1 items-center justify-center text-ink-soft">
        <div className="text-center">
          <p className="heading mb-1 text-lg">Geen project open</p>
          <p className="text-sm">Maak een project aan in de zijbalk.</p>
        </div>
      </div>
    );
  }

  const width = Math.max(
    MIN_CANVAS.width,
    ...tab.blocks.map((b) => b.layout.x + b.layout.width + CANVAS_MARGIN),
  );
  const height = Math.max(
    MIN_CANVAS.height,
    ...tab.blocks.map((b) => b.layout.y + b.layout.height + CANVAS_MARGIN),
  );

  const canvasPoint = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.max(0, e.clientX - rect.left), y: Math.max(0, e.clientY - rect.top) };
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div className="canvas-viewport absolute inset-0 overflow-auto">
        <div
          id="canvas-inner"
          className="relative"
          style={{ width, height }}
          onDoubleClick={(e) => {
            if (e.target !== e.currentTarget) return;
            addBlock(canvasPoint(e));
          }}
          onContextMenu={(e) => {
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            const pt = canvasPoint(e);
            setCtxMenu({ x: e.clientX, y: e.clientY, canvasX: pt.x, canvasY: pt.y });
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSelectedBlockId(null);
          }}
        >
          {(() => {
            const groups = tab.groups ?? [];
            const collapsedIds = new Set(groups.filter((g) => g.collapsed).map((g) => g.id));
            const visible = tab.blocks.filter(
              (b) => !b.groupId || !collapsedIds.has(b.groupId),
            );
            return (
              <>
                {visible.map((block) => (
                  <CanvasBlock
                    key={block.id}
                    block={block}
                    tabId={tab.id}
                    otherTargets={[...targetsRef.current.entries()]
                      .filter(([id]) => id !== block.id)
                      .map(([, el]) => el)}
                    registerTarget={registerTarget}
                  />
                ))}
                {groups.map((group) => {
                  const members = tab.blocks.filter((b) => b.groupId === group.id);
                  if (members.length === 0) return null;
                  return <GroupOverlay key={group.id} group={group} members={members} />;
                })}
              </>
            );
          })()}
          {tab.blocks.length === 0 && (
            <div className="pointer-events-none absolute left-0 top-0 flex h-[60vh] w-full items-center justify-center text-ink-soft">
              <div className="text-center">
                <p className="heading mb-1 text-[15px]">Leeg project</p>
                <p className="text-[13px]">Dubbelklik of rechtsklik ergens, of gebruik + rechtsonder.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => addBlock()}
        className="panel absolute bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full text-2xl text-ink-soft transition-transform hover:scale-105 hover:text-ink"
        title="Nieuw blok (dubbelklik of rechtsklik op canvas kan ook)"
      >
        +
      </button>

      {ctxMenu &&
        createPortal(
          <div
            ref={ctxRef}
            className="panel pop-in fixed z-[70] p-1.5"
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 190),
              top: Math.min(ctxMenu.y, window.innerHeight - 100),
              width: 180,
            }}
          >
            <button
              onClick={() => {
                addBlock({ x: ctxMenu.canvasX, y: ctxMenu.canvasY });
                setCtxMenu(null);
              }}
              className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
            >
              ＋ Nieuw blok hier
            </button>
            <button
              onClick={() => {
                addCalendarBlock({ x: ctxMenu.canvasX, y: ctxMenu.canvasY });
                setCtxMenu(null);
              }}
              className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
            >
              📅 Agenda-blok hier
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
