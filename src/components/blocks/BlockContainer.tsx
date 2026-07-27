import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Block } from "../../types";
import { ACCENT_COLORS } from "../../types";
import { useProjectsStore } from "../../stores/projectsStore";
import { useUiStore } from "../../stores/uiStore";
import { exportBlockAs } from "../../lib/exportDocument";
import { NoteBlock } from "./note/NoteBlock";
import { FileOrganizerBlock } from "./file-organizer/FileOrganizerBlock";
import { CalendarBlock } from "./calendar/CalendarBlock";

export function BlockContainer({
  block,
  tabId,
  contextMenuRef,
}: {
  block: Block;
  tabId: string;
  /** lets CanvasBlock open this block's menu from a right-click anywhere on it */
  contextMenuRef?: React.MutableRefObject<((x: number, y: number) => void) | null>;
}) {
  const {
    renameBlock,
    removeBlock,
    restoreBlock,
    duplicateBlock,
    setBlockColor,
    groupBlocks,
    removeBlockFromGroup,
    tabs,
    activeTabId,
  } = useProjectsStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const otherBlocks = activeTab?.blocks.filter((b) => b.id !== block.id) ?? [];
  const showToast = useUiStore((s) => s.showToast);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.title);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!menuPos) return;
    const onDown = (e: MouseEvent) => {
      if (menuButtonRef.current?.contains(e.target as Node)) return;
      if (!menuRef.current?.contains(e.target as Node)) setMenuPos(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuPos]);

  const commit = () => {
    if (draft.trim()) renameBlock(block.id, draft.trim());
    setEditing(false);
  };

  const remove = () => {
    removeBlock(block.id);
    showToast(`"${block.title}" verwijderd`, "Herstel", () => restoreBlock(tabId, block));
  };

  const openMenuAt = (x: number, y: number) => {
    const width = 200;
    setMenuPos({
      x: Math.min(Math.max(x, 8), window.innerWidth - width - 8),
      y: Math.min(y, window.innerHeight - 360),
    });
  };

  const toggleMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (menuPos) {
      setMenuPos(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    openMenuAt(rect.right - 200, rect.bottom + 4);
  };

  useEffect(() => {
    if (!contextMenuRef) return;
    contextMenuRef.current = openMenuAt;
    return () => {
      contextMenuRef.current = null;
    };
  });

  return (
    <>
      {/* name floats above the panel so the block itself stays all content */}
      <div
        className="block-drag-handle absolute -top-[26px] left-1 flex max-w-[calc(100%-8px)] cursor-grab items-center gap-1.5 active:cursor-grabbing"
        onDoubleClick={() => {
          setDraft(block.title);
          setEditing(true);
        }}
        title="Dubbelklik om te hernoemen, sleep om te verplaatsen"
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
            className="min-w-0 flex-1 bg-transparent text-[12.5px] font-semibold text-ink outline-none"
          />
        ) : (
          <span
            className="heading truncate text-[12.5px] leading-none text-ink"
            style={block.color ? { color: block.color } : undefined}
          >
            {block.title}
          </span>
        )}
      </div>
      <div className="block-drag-handle flex shrink-0 cursor-grab items-center justify-end gap-1 px-2 pb-0.5 pt-2 active:cursor-grabbing">
        <button
          ref={menuButtonRef}
          onMouseUp={toggleMenu}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[13px] text-ink-soft hover:text-ink"
          title="Opties (of rechtsklik op het blok)"
        >
          ⋯
        </button>
        <button
          onClick={remove}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] text-ink-soft hover:text-ink"
          title="Blok verwijderen"
        >
          ✕
        </button>
      </div>
      <div className="block-body min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {block.type === "note" && <NoteBlock block={block} />}
        {block.type === "file-organizer" && <FileOrganizerBlock block={block} />}
        {block.type === "calendar" && <CalendarBlock block={block} />}
      </div>
      {menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="panel pop-in fixed z-50 w-50 p-2"
            style={{ left: menuPos.x, top: menuPos.y, width: 200 }}
          >
            <button
              onClick={() => {
                duplicateBlock(block.id);
                setMenuPos(null);
              }}
              className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
            >
              ⧉ Dupliceren
            </button>
            {block.groupId && (
              <button
                onClick={() => {
                  removeBlockFromGroup(block.id);
                  setMenuPos(null);
                }}
                className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
              >
                ⇱ Uit groep halen
              </button>
            )}
            {otherBlocks.length > 0 && (
              <>
                <p className="mb-0.5 mt-1.5 px-2 text-[11px] text-ink-soft">Koppel met…</p>
                <div className="max-h-32 overflow-y-auto">
                  {otherBlocks.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        groupBlocks(block.id, b.id);
                        setMenuPos(null);
                      }}
                      className="w-full truncate rounded-themed-sm px-2 py-1 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
                    >
                      🔗 {b.title}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button
              onClick={() => {
                setMenuPos(null);
                setDraft(block.title);
                setEditing(true);
              }}
              className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
            >
              ✎ Hernoemen
            </button>
            <button
              onClick={() => {
                setMenuPos(null);
                void exportBlockAs(block, activeTab?.name ?? "Doova", "pdf");
              }}
              className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
            >
              ⬇ Exporteer als PDF
            </button>
            <button
              onClick={() => {
                setMenuPos(null);
                void exportBlockAs(block, activeTab?.name ?? "Doova", "docx");
              }}
              className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
            >
              ⬇ Exporteer als Word
            </button>
            <button
              onClick={() => {
                setMenuPos(null);
                remove();
              }}
              className="w-full rounded-themed-sm px-2 py-1.5 text-left text-[12.5px] text-[#ff3b30] hover:bg-[#ff3b30] hover:text-white"
            >
              ✕ Blok verwijderen
            </button>
            <p className="mb-1 mt-2 px-2 text-[11px] text-ink-soft">Kleur</p>
            <div className="flex flex-wrap gap-1 px-2 pb-1">
              <button
                onClick={() => setBlockColor(block.id, null)}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-border-themed text-[10px] text-ink-soft"
                title="Geen kleur"
              >
                ✕
              </button>
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setBlockColor(block.id, c.hex)}
                  className="h-5 w-5 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: c.hex,
                    outline: block.color === c.hex ? "2px solid var(--ink)" : "none",
                    outlineOffset: 1,
                  }}
                  title={c.label}
                />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
