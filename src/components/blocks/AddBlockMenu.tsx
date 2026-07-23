import { useEffect, useRef, useState } from "react";
import type { BlockType } from "../../types";
import { useProjectsStore } from "../../stores/projectsStore";

const OPTIONS: { type: BlockType; icon: string; label: string; hint: string }[] = [
  { type: "checklist", icon: "☑️", label: "Checklist", hint: "To-do's met subtaken, datum en labels" },
  { type: "note", icon: "📝", label: "Notitieblok", hint: "Rich text: koppen, lijsten, checkboxen" },
  { type: "file-organizer", icon: "📁", label: "Bestanden", hint: "Sleep bestanden of mappen hierheen" },
];

export function AddBlockMenu({ isEmpty }: { isEmpty: boolean }) {
  const addBlock = useProjectsStore((s) => s.addBlock);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0 self-start">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-center rounded-themed text-ink-soft transition-colors hover:text-ink ${
          isEmpty
            ? "panel h-40 w-[300px] flex-col gap-2"
            : "panel h-11 w-11 text-xl"
        }`}
        title="Blok toevoegen"
      >
        <span className={isEmpty ? "text-3xl" : ""}>+</span>
        {isEmpty && <span className="text-[13px]">Voeg je eerste blok toe</span>}
      </button>
      {open && (
        <div className="panel pop-in absolute left-0 top-full z-30 mt-2 w-64 overflow-hidden p-1.5">
          {OPTIONS.map((opt) => (
            <button
              key={opt.type}
              onClick={() => { addBlock(opt.type); setOpen(false); }}
              className="flex w-full items-start gap-2.5 rounded-themed-sm px-2.5 py-2 text-left transition-colors hover:bg-accent hover:text-accent-ink"
            >
              <span className="mt-0.5 text-base">{opt.icon}</span>
              <span className="min-w-0">
                <span className="heading block text-[13px]">{opt.label}</span>
                <span className="block text-[11.5px] opacity-70">{opt.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
