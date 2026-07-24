import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BlockType } from "../../types";
import { useProjectsStore } from "../../stores/projectsStore";

const OPTIONS: { type: BlockType; icon: string; label: string; hint: string }[] = [
  { type: "checklist", icon: "☑️", label: "Checklist", hint: "To-do's met subtaken, datum en labels" },
  { type: "note", icon: "📝", label: "Notitieblok", hint: "Rich text: koppen, lijsten, checkboxen" },
  { type: "file-organizer", icon: "📁", label: "Bestanden", hint: "Sleep bestanden of mappen hierheen" },
];

export function AddBlockMenu({ isEmpty }: { isEmpty: boolean }) {
  const addBlock = useProjectsStore((s) => s.addBlock);
  // portal + fixed position, so the board's scroll container can't clip it
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuPos) return;
    const onDown = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node)) return;
      if (!menuRef.current?.contains(e.target as Node)) setMenuPos(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuPos]);

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (menuPos) {
      setMenuPos(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const width = 256;
    const x = Math.min(Math.max(rect.left, 8), window.innerWidth - width - 8);
    const y = Math.min(rect.bottom + 8, window.innerHeight - 220);
    setMenuPos({ x, y });
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        className={`flex shrink-0 items-center justify-center self-start rounded-themed text-ink-soft transition-colors hover:text-ink ${
          isEmpty
            ? "panel h-40 w-[300px] flex-col gap-2"
            : "panel h-11 w-11 text-xl"
        }`}
        title="Blok toevoegen"
      >
        <span className={isEmpty ? "text-3xl" : ""}>+</span>
        {isEmpty && <span className="text-[13px]">Voeg je eerste blok toe</span>}
      </button>
      {menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="panel pop-in fixed z-50 w-64 overflow-hidden p-1.5"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            {OPTIONS.map((opt) => (
              <button
                key={opt.type}
                onClick={() => { addBlock(opt.type); setMenuPos(null); }}
                className="flex w-full items-start gap-2.5 rounded-themed-sm px-2.5 py-2 text-left transition-colors hover:bg-accent hover:text-accent-ink"
              >
                <span className="mt-0.5 text-base">{opt.icon}</span>
                <span className="min-w-0">
                  <span className="heading block text-[13px]">{opt.label}</span>
                  <span className="block text-[11.5px] opacity-70">{opt.hint}</span>
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
