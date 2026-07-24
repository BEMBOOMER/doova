import { useState } from "react";
import { createPortal } from "react-dom";
import type { CalendarEvent } from "../../../types";
import type { AggregatedDue } from "../../../lib/calendarAggregate";
import { useProjectsStore } from "../../../stores/projectsStore";

export function EventEditor({
  blockId,
  date,
  events,
  dues,
  onClose,
}: {
  blockId: string;
  date: string;
  events: CalendarEvent[];
  dues: AggregatedDue[];
  onClose: () => void;
}) {
  const { addEvent, removeEvent } = useProjectsStore();
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    addEvent(blockId, { title: trimmed, date, time: time || null });
    setTitle("");
    setTime("");
  };

  const label = new Date(`${date}T12:00:00`).toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return createPortal(
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel pop-in w-80 max-w-[90vw] p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="heading text-[13px] first-letter:uppercase">{label}</h3>
          <button onClick={onClose} className="text-[12px] text-ink-soft hover:text-ink">
            ✕
          </button>
        </div>

        {dues.length > 0 && (
          <div className="mb-2">
            {dues.map((d, i) => (
              <p key={i} className={`text-[12px] ${d.done ? "text-ink-soft line-through" : "text-ink"}`}>
                ⏳ {d.text} <span className="text-ink-soft">({d.blockTitle})</span>
              </p>
            ))}
          </div>
        )}

        {events.map((ev) => (
          <div key={ev.id} className="group flex items-center gap-2 rounded-themed-sm px-1 py-0.5 hover:bg-surface-raised">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--color-accent)" }} />
            <span className="min-w-0 flex-1 truncate text-[12.5px]">
              {ev.time && <span className="text-ink-soft">{ev.time} · </span>}
              {ev.title}
            </span>
            <button
              onClick={() => removeEvent(blockId, ev.id)}
              className="hidden text-[11px] text-ink-soft hover:text-ink group-hover:block"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="mt-2 flex gap-1.5">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onClose();
            }}
            placeholder="Nieuw event…"
            className="min-w-0 flex-1 rounded-themed-sm bg-surface-raised px-2 py-1 text-[12.5px] outline-none placeholder:text-ink-soft"
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-20 rounded-themed-sm bg-surface-raised px-1 py-1 text-[12px] outline-none"
          />
          <button
            onClick={submit}
            className="heading rounded-themed-sm bg-accent px-2.5 text-[12px] text-accent-ink"
          >
            +
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
