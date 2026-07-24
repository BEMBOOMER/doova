import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Block } from "../../types";
import { ACCENT_COLORS } from "../../types";
import { useProjectsStore } from "../../stores/projectsStore";
import { useUiStore } from "../../stores/uiStore";
import { NoteBlock } from "./note/NoteBlock";
import { FileOrganizerBlock } from "./file-organizer/FileOrganizerBlock";
import { CalendarBlock } from "./calendar/CalendarBlock";

const TYPE_ICONS: Record<Block["type"], string> = {
  note: "📝",
  "file-organizer": "📁",
  calendar: "📅",
};

export function BlockContainer({ block, tabId }: { block: Block; tabId: string }) {
  const { renameBlock, removeBlock, restoreBlock, duplicateBlock, setBlockColor } =
    useProjectsStore();
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

  const toggleMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (menuPos) {
      setMenuPos(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const width = 200;
    setMenuPos({
      x: Math.min(Math.max(rect.right - width, 8), window.innerWidth - width - 8),
      y: Math.min(rect.bottom + 4, window.innerHeight - 180),
    });
  };

  return (
    <>
      {block.color && (
        <div
          className="absolute inset-x-0 top-0 h-1 rounded-t-themed"
          style={{ background: block.color }}
        />
      )}
      <div
        className="block-drag-handle flex shrink-0 cursor-grab items-center gap-2 px-3 pb-1 pt-2.5 active:cursor-grabbing"
        onDoubleClick={() => {
          setDraft(block.title);
          setEditing(true);
        }}
      >
        <span className="text-[13px]">{TYPE_ICONS[block.type]}</span>
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
            className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none"
          />
        ) : (
          <span className="heading min-w-0 flex-1 truncate text-[13px]">{block.title}</span>
        )}
        <button
          ref={menuButtonRef}
          onClick={toggleMenu}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[13px] text-ink-soft hover:text-ink"
          title="Opties"
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
