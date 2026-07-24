import type { CalendarEvent } from "../../../types";
import type { AggregatedDue } from "../../../lib/calendarAggregate";

const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CalendarMonth({
  cursor,
  events,
  dues,
  onDayClick,
}: {
  cursor: Date; // first day of shown month
  events: CalendarEvent[];
  dues: AggregatedDue[];
  onDayClick: (isoDate: string) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = iso(new Date());

  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => iso(new Date(year, month, i + 1))),
  ];

  return (
    <div className="grid grid-cols-7 gap-0.5">
      {WEEKDAYS.map((d) => (
        <div key={d} className="pb-0.5 text-center text-[9.5px] font-semibold uppercase text-ink-soft">
          {d}
        </div>
      ))}
      {cells.map((dayIso, i) => {
        if (!dayIso) return <div key={`pad-${i}`} />;
        const dayEvents = events.filter((ev) => ev.date === dayIso);
        const dayDues = dues.filter((d) => d.date === dayIso && !d.done);
        const isToday = dayIso === todayIso;
        return (
          <button
            key={dayIso}
            onClick={() => onDayClick(dayIso)}
            className={`flex aspect-square flex-col items-center justify-start rounded-themed-sm pt-0.5 text-[11px] transition-colors hover:bg-surface-raised ${
              isToday ? "bg-accent font-bold text-accent-ink" : "text-ink"
            }`}
          >
            <span>{Number(dayIso.slice(-2))}</span>
            <span className="flex gap-0.5">
              {dayEvents.length > 0 && (
                <span className="h-1 w-1 rounded-full" style={{ background: "var(--color-accent)" }} />
              )}
              {dayDues.length > 0 && (
                <span className="h-1 w-1 rounded-full bg-[#ff3b30]" />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
