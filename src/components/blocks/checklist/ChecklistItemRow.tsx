import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChecklistItem } from "../../../types";
import { useProjectsStore } from "../../../stores/projectsStore";
import { LabelPicker } from "./LabelPicker";

function formatDue(iso: string): { text: string; overdue: boolean } {
  const due = new Date(`${iso}T23:59:59`);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((due.getTime() - startOfToday.getTime()) / 86400000);
  if (days < 0) return { text: `${Math.abs(days)}d te laat`, overdue: true };
  if (days === 0) return { text: "vandaag", overdue: false };
  if (days === 1) return { text: "morgen", overdue: false };
  if (days < 7) return { text: `over ${days}d`, overdue: false };
  return {
    text: due.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }),
    overdue: false,
  };
}

export function ChecklistItemRow({
  blockId,
  item,
  depth,
}: {
  blockId: string;
  item: ChecklistItem;
  depth: number;
}) {
  const { updateChecklistItem, removeChecklistItem, addChecklistItem } = useProjectsStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  // menu renders in a body portal, or the block's scroll container clips it
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [addingSub, setAddingSub] = useState(false);
  const [subDraft, setSubDraft] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!menuPos) return;
    const onDown = (e: MouseEvent) => {
      // ignore the toggle button itself, or its own click would reopen the menu
      if (menuButtonRef.current?.contains(e.target as Node)) return;
      if (!menuRef.current?.contains(e.target as Node)) setMenuPos(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuPos]);

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (menuPos) {
      setMenuPos(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const width = 208;
    const x = Math.min(Math.max(rect.right - width, 8), window.innerWidth - width - 8);
    const y = Math.min(rect.bottom + 4, window.innerHeight - 260);
    setMenuPos({ x, y });
  };

  const commit = () => {
    const text = draft.trim();
    if (text) updateChecklistItem(blockId, item.id, { text });
    setEditing(false);
  };

  const submitSub = () => {
    const text = subDraft.trim();
    if (text) addChecklistItem(blockId, text, item.id);
    setSubDraft("");
    setAddingSub(false);
  };

  const due = item.dueDate ? formatDue(item.dueDate) : null;

  return (
    <div style={{ marginLeft: depth > 0 ? 18 : 0 }}>
      <div className="group flex items-start gap-2 rounded-themed-sm px-1 py-1 hover:bg-surface-raised">
        <input
          type="checkbox"
          checked={item.done}
          onChange={(e) => updateChecklistItem(blockId, item.id, { done: e.target.checked })}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
        />
        <div className="min-w-0 flex-1">
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
              className="w-full bg-transparent text-[13px] outline-none"
            />
          ) : (
            <p
              onDoubleClick={() => { setDraft(item.text); setEditing(true); }}
              className={`break-words text-[13px] leading-snug ${item.done ? "text-ink-soft line-through" : "text-ink"}`}
            >
              {item.text}
            </p>
          )}
          {(due || item.label) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {item.label && (
                <span
                  className="rounded-full px-1.5 py-px text-[10px] font-semibold"
                  style={{ background: item.label.color, color: "#1a1a1a" }}
                >
                  {item.label.text}
                </span>
              )}
              {due && (
                <span className={`text-[10.5px] ${due.overdue ? "font-semibold text-[#ff3b30]" : "text-ink-soft"}`}>
                  📅 {due.text}
                </span>
              )}
            </div>
          )}
        </div>
        <button
          ref={menuButtonRef}
          onClick={openMenu}
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-[13px] text-ink-soft hover:text-ink group-hover:flex"
          title="Opties"
        >
          ⋯
        </button>
        {menuPos &&
          createPortal(
            <div
              ref={menuRef}
              className="panel pop-in fixed z-50 w-52 p-2"
              style={{ left: menuPos.x, top: menuPos.y }}
            >
              <label className="mb-1.5 block text-[11px] text-ink-soft">
                Vervaldatum
                <input
                  type="date"
                  value={item.dueDate ?? ""}
                  onChange={(e) =>
                    updateChecklistItem(blockId, item.id, { dueDate: e.target.value || null })
                  }
                  className="mt-0.5 w-full rounded-themed-sm bg-surface-raised px-1.5 py-1 text-[12px] text-ink outline-none"
                />
              </label>
              <LabelPicker
                label={item.label}
                onChange={(label) => updateChecklistItem(blockId, item.id, { label })}
              />
              <div className="mt-2 flex gap-1.5">
                {depth === 0 && (
                  <button
                    onClick={() => { setAddingSub(true); setMenuPos(null); }}
                    className="flex-1 rounded-themed-sm bg-surface-raised px-2 py-1 text-[11.5px] hover:bg-accent hover:text-accent-ink"
                  >
                    + Subtaak
                  </button>
                )}
                <button
                  onClick={() => { removeChecklistItem(blockId, item.id); setMenuPos(null); }}
                  className="flex-1 rounded-themed-sm bg-surface-raised px-2 py-1 text-[11.5px] text-[#ff3b30] hover:bg-[#ff3b30] hover:text-white"
                >
                  Verwijder
                </button>
              </div>
            </div>,
            document.body,
          )}
      </div>
      {item.subtasks.map((sub) => (
        <ChecklistItemRow key={sub.id} blockId={blockId} item={sub} depth={depth + 1} />
      ))}
      {addingSub && (
        <input
          autoFocus
          value={subDraft}
          onChange={(e) => setSubDraft(e.target.value)}
          onBlur={submitSub}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitSub();
            if (e.key === "Escape") setAddingSub(false);
          }}
          placeholder="Subtaak…"
          className="ml-[26px] mt-0.5 w-[calc(100%-26px)] rounded-themed-sm bg-surface-raised px-1.5 py-1 text-[12.5px] outline-none placeholder:text-ink-soft"
        />
      )}
    </div>
  );
}
