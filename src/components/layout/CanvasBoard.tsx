import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Block, BlockGroup } from "../../types";
import { useProjectsStore } from "../../stores/projectsStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { registerViewport } from "../../lib/canvasView";
import { TEMPLATES } from "../../lib/templates";
import { ConnectionsLayer } from "./ConnectionsLayer";
import { CanvasBlock } from "../blocks/CanvasBlock";

/** Roughly the menu's own size, used only to decide whether it fits above. */
const MENU_WIDTH = 190;
const MENU_HEIGHT = 140;

/**
 * Highlighted frame around an expanded group with a pill on top, or a chip
 * that replaces a collapsed one. Dragging the pill/chip moves the whole group.
 */
function GroupOverlay({ group, members }: { group: BlockGroup; members: Block[] }) {
  const {
    toggleBlockGroup,
    renameBlockGroup,
    dissolveBlockGroup,
    moveBlockGroup,
    setGroupPosition,
    arrangeBlockGroup,
  } = useProjectsStore();
  const setInteracting = useUiStore((s) => s.setInteracting);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);
  // anchored to the pill rather than the cursor: opening downwards buried the
  // menu under the group's own blocks, which is exactly what you want to see
  const [menuPos, setMenuPos] = useState<
    { x: number; above: number } | { x: number; below: number } | null
  >(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // drag the whole group by its pill/chip: members move live via the DOM,
  // the store is committed once on release (no persist storm)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    els: { el: HTMLElement; left: number; top: number }[];
  } | null>(null);

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 || editing) return;
    e.stopPropagation();
    const els = group.collapsed
      ? []
      : members.flatMap((m) => {
          const el = document.querySelector<HTMLElement>(`[data-block-id="${m.id}"]`);
          return el ? [{ el, left: m.layout.x, top: m.layout.y }] : [];
        });
    dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false, els };
    // marks the same flag react-moveable sets, so the connection lines know to
    // follow the elements instead of the store while this drag runs
    setInteracting(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setDragOffset({ x: dx, y: dy });
    for (const { el, left, top } of d.els) {
      el.style.left = `${Math.max(0, left + dx)}px`;
      el.style.top = `${Math.max(0, top + dy)}px`;
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setInteracting(false);
    setDragOffset({ x: 0, y: 0 });
    if (!d.moved) {
      toggleBlockGroup(group.id);
      return;
    }
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (group.collapsed) {
      setGroupPosition(group.id, group.x + dx, group.y + dy);
    } else {
      moveBlockGroup(group.id, dx, dy);
    }
  };

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
      style={{ width: `${Math.max(6, draft.length + 1)}ch` }}
      className="max-w-[16rem] bg-transparent text-[12px] outline-none"
    />
  ) : (
    // block, not inline: overflow-hidden does nothing on an inline span, which
    // is what let a long name spill straight out of the chip
    <span className="heading block truncate text-[12px]">{group.name}</span>
  );

  const menu =
    menuPos &&
    createPortal(
      <div
        ref={menuRef}
        className="panel pop-in fixed z-[80] p-1.5"
        style={{
          left: menuPos.x,
          ...("above" in menuPos
            ? { bottom: menuPos.above }
            : { top: menuPos.below }),
          width: MENU_WIDTH,
        }}
        // the portal is a React child of the pill, so without this, clicks on
        // menu items bubble into the pill's drag/toggle handlers
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
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
            arrangeBlockGroup(group.id);
            setMenuPos(null);
          }}
          className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
        >
          ⇆ Netjes ordenen
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

  const sharedPillHandlers = {
    onPointerDown: startDrag,
    onPointerMove: onDragMove,
    onPointerUp: endDrag,
    onDoubleClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      setDraft(group.name);
      setEditing(true);
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.min(Math.max(rect.left, 8), window.innerWidth - MENU_WIDTH - 8);
      // near the top of the window there is no room above, so it flips back down
      setMenuPos(
        rect.top > MENU_HEIGHT + 16
          ? { x, above: window.innerHeight - rect.top + 8 }
          : { x, below: rect.bottom + 8 },
      );
    },
  };

  if (group.collapsed) {
    return (
      <div
        className="panel pop-in absolute flex cursor-grab select-none items-center gap-2 px-3 py-2.5 active:cursor-grabbing"
        style={{
          left: group.x + dragOffset.x,
          top: group.y + dragOffset.y,
          // sizes to the name instead of a fixed width, with a ceiling so a very
          // long one ellipsizes rather than stretching across the canvas
          minWidth: 180,
          maxWidth: 420,
          zIndex: 500,
        }}
        {...sharedPillHandlers}
        title="Klik om uit te klappen, sleep om te verplaatsen"
      >
        <span className="text-[13px]">🗂</span>
        <span className="min-w-0 flex-1">{name}</span>
        <span className="shrink-0 text-[11px] text-ink-soft">{members.length} blokken ▸</span>
        {menu}
      </div>
    );
  }

  // frame hugs the members' bounding box, like the reference design
  const PAD = 16;
  const minX = Math.min(...members.map((b) => b.layout.x)) - PAD;
  const minY = Math.min(...members.map((b) => b.layout.y)) - PAD;
  const maxX = Math.max(...members.map((b) => b.layout.x + b.layout.width)) + PAD;
  const maxY = Math.max(...members.map((b) => b.layout.y + b.layout.height)) + PAD;

  return (
    <>
      <div
        className="group-frame absolute"
        style={{
          left: minX + dragOffset.x,
          top: minY + dragOffset.y,
          width: maxX - minX,
          height: maxY - minY,
          zIndex: 0,
        }}
      />
      <div
        className="panel absolute flex -translate-x-1/2 cursor-grab select-none items-center gap-1.5 rounded-full px-3.5 py-1.5 active:cursor-grabbing"
        style={{
          left: (minX + maxX) / 2 + dragOffset.x,
          top: minY - 16 + dragOffset.y,
          zIndex: 600,
        }}
        {...sharedPillHandlers}
        title="Klik om in te klappen, sleep om de groep te verplaatsen"
      >
        <span className="text-[10px]">▾</span>
        {name}
        <span className="text-[10.5px] text-ink-soft">{members.length}</span>
        {menu}
      </div>
    </>
  );
}

/**
 * Canvas is generously sized and grow-only, so resizing or moving a block
 * never makes the whole board reflow or the scrollbars jump around.
 */
/**
 * The canvas is exactly as big as it needs to be: the viewport when
 * everything fits (so there is nothing to scroll into), growing past it only
 * as far as the blocks reach, plus room to keep dragging outward.
 */
const CANVAS_MARGIN = 220;

export function CanvasBoard() {
  const {
    tabs,
    activeTabId,
    addBlock,
    addCalendarBlock,
    addBlocks,
    promoteBlockToMoodboard,
    promoteBlockToSwatch,
  } = useProjectsStore();
  const setSelectedBlockId = useUiStore((s) => s.setSelectedBlockId);
  const revealBlockId = useUiStore((s) => s.revealBlockId);
  const setRevealBlockId = useUiStore((s) => s.setRevealBlockId);
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

  // hold the configured mouse button to drag the canvas around
  const viewportRef = useRef<HTMLDivElement>(null);
  // the canvas is never smaller than what you can see, so an empty project
  // has nothing to scroll into
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  // lets code outside this component place a block where you are looking
  useEffect(() => {
    registerViewport(viewportRef.current);
    return () => registerViewport(null);
  });

  // A search hit switches project first, so the block does not exist yet when
  // the palette closes; this runs once its canvas has actually rendered.
  useEffect(() => {
    if (!revealBlockId) return;
    const el = document.querySelector<HTMLElement>(`[data-block-id="${revealBlockId}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    el.classList.add("reveal-flash");
    const timer = setTimeout(() => el.classList.remove("reveal-flash"), 1200);
    setRevealBlockId(null);
    return () => clearTimeout(timer);
  }, [revealBlockId, activeTabId, setRevealBlockId]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewport({ width: Math.round(width), height: Math.round(height) });
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);
  const panButton = useSettingsStore((s) => s.panButton);
  const panning = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const startPan = (e: React.PointerEvent) => {
    if (panButton === 0 || e.button !== panButton) return;
    const vp = viewportRef.current;
    if (!vp) return;
    e.preventDefault();
    panning.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop };
    vp.setPointerCapture(e.pointerId);
    vp.style.cursor = "grabbing";
  };

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onMove = (e: PointerEvent) => {
      const start = panning.current;
      if (!start) return;
      vp.scrollLeft = start.left - (e.clientX - start.x);
      vp.scrollTop = start.top - (e.clientY - start.y);
    };
    const onUp = () => {
      if (!panning.current) return;
      panning.current = null;
      vp.style.cursor = "";
    };
    vp.addEventListener("pointermove", onMove);
    vp.addEventListener("pointerup", onUp);
    vp.addEventListener("pointercancel", onUp);
    return () => {
      vp.removeEventListener("pointermove", onMove);
      vp.removeEventListener("pointerup", onUp);
      vp.removeEventListener("pointercancel", onUp);
    };
  }, []);

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
    viewport.width,
    ...tab.blocks.map((b) => b.layout.x + b.layout.width + CANVAS_MARGIN),
  );
  const height = Math.max(
    viewport.height,
    ...tab.blocks.map((b) => b.layout.y + b.layout.height + CANVAS_MARGIN),
  );

  const canvasPoint = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.max(0, e.clientX - rect.left), y: Math.max(0, e.clientY - rect.top) };
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={viewportRef}
        className="canvas-viewport absolute inset-0 overflow-auto"
        onPointerDown={startPan}
        onAuxClick={(e) => {
          // stop the middle-click paste/auto-scroll default while panning
          if (panButton !== 0 && e.button === panButton) e.preventDefault();
        }}
      >
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
            if (panButton === 2) return; // right button is bound to panning
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
                <ConnectionsLayer
                  connections={tab.connections ?? []}
                  blocks={tab.blocks}
                  width={width}
                  height={height}
                />
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
            <button
              onClick={() => {
                const id = addBlock({ x: ctxMenu.canvasX, y: ctxMenu.canvasY });
                promoteBlockToMoodboard(id, []);
                setCtxMenu(null);
              }}
              className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
            >
              ▦ Moodboard hier
            </button>
            <button
              onClick={() => {
                const id = addBlock({ x: ctxMenu.canvasX, y: ctxMenu.canvasY });
                promoteBlockToSwatch(id, []);
                setCtxMenu(null);
              }}
              className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
            >
              ◧ Kleuren hier
            </button>
            <p className="mb-0.5 mt-1.5 px-2 text-[11px] text-ink-soft">Sjabloon…</p>
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  addBlocks(template.build(), { x: ctxMenu.canvasX, y: ctxMenu.canvasY });
                  setCtxMenu(null);
                }}
                className="w-full truncate rounded-themed-sm px-2 py-1 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
                title={template.hint}
              >
                ▤ {template.name}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
