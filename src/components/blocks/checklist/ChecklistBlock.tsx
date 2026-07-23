import { useState } from "react";
import type { ChecklistBlockData } from "../../../types";
import { useProjectsStore } from "../../../stores/projectsStore";
import { ChecklistItemRow } from "./ChecklistItemRow";

export function ChecklistBlock({ block }: { block: ChecklistBlockData }) {
  const addChecklistItem = useProjectsStore((s) => s.addChecklistItem);
  const [draft, setDraft] = useState("");

  const openCount = block.items.filter((it) => !it.done).length;

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    addChecklistItem(block.id, text);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-0.5">
      {block.items.length > 0 && (
        <p className="mb-1 text-[11px] text-ink-soft">
          {openCount === 0 ? "Alles klaar 🎉" : `${openCount} open`}
        </p>
      )}
      {block.items.map((item) => (
        <ChecklistItemRow key={item.id} blockId={block.id} item={item} depth={0} />
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="+ Nieuwe taak…"
        className="mt-1 w-full rounded-themed-sm bg-transparent px-1 py-1 text-[13px] text-ink outline-none placeholder:text-ink-soft focus:bg-surface-raised"
      />
    </div>
  );
}
