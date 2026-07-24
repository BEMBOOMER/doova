import { useMemo, useState } from "react";
import type { CalendarBlockData } from "../../../types";
import { useProjectsStore } from "../../../stores/projectsStore";
import { collectDueDates } from "../../../lib/calendarAggregate";
import { CalendarMonth } from "./CalendarMonth";
import { EventEditor } from "./EventEditor";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function CalendarBlock({ block }: { block: CalendarBlockData }) {
  const { tabs, activeTabId } = useProjectsStore();
  const tab = tabs.find((t) => t.id === activeTabId);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const dues = useMemo(() => (tab ? collectDueDates(tab) : []), [tab]);

  const monthLabel = cursor.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-center justify-between">
        <button
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-soft hover:text-ink"
        >
          ‹
        </button>
        <span className="heading text-[12.5px] first-letter:uppercase">{monthLabel}</span>
        <button
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-soft hover:text-ink"
        >
          ›
        </button>
      </div>
      <CalendarMonth
        cursor={cursor}
        events={block.events}
        dues={dues}
        onDayClick={(iso) => setEditingDate(iso)}
      />
      <p className="mt-1 text-center text-[10.5px] text-ink-soft">
        Klik op een dag voor events · ⏳-deadlines uit taken tellen mee
      </p>
      {editingDate && (
        <EventEditor
          blockId={block.id}
          date={editingDate}
          events={block.events.filter((ev) => ev.date === editingDate)}
          dues={dues.filter((d) => d.date === editingDate)}
          onClose={() => setEditingDate(null)}
        />
      )}
      <span className="hidden">{monthKey(cursor)}</span>
    </div>
  );
}
