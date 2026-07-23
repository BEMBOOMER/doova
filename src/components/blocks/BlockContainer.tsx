import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block } from "../../types";
import { useProjectsStore } from "../../stores/projectsStore";
import { useUiStore } from "../../stores/uiStore";
import { NoteBlock } from "./note/NoteBlock";
import { ChecklistBlock } from "./checklist/ChecklistBlock";
import { FileOrganizerBlock } from "./file-organizer/FileOrganizerBlock";

const TYPE_ICONS: Record<Block["type"], string> = {
  note: "📝",
  checklist: "☑️",
  "file-organizer": "📁",
};

export function BlockContainer({ block, tabId }: { block: Block; tabId: string }) {
  const { renameBlock, removeBlock, restoreBlock } = useProjectsStore();
  const showToast = useUiStore((s) => s.showToast);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    if (draft.trim()) renameBlock(block.id, draft.trim());
    setEditing(false);
  };

  const remove = () => {
    const tab = useProjectsStore.getState().tabs.find((t) => t.id === tabId);
    const index = tab?.blocks.findIndex((b) => b.id === block.id) ?? 0;
    removeBlock(block.id);
    showToast(`"${block.title}" verwijderd`, "Herstel", () => restoreBlock(tabId, block, index));
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="panel pop-in flex max-h-full w-[300px] shrink-0 flex-col"
      data-block-id={block.id}
      data-block-type={block.type}
    >
      <div
        className="flex shrink-0 cursor-grab items-center gap-2 px-3 pb-1 pt-2.5 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        onDoubleClick={() => { setDraft(block.title); setEditing(true); }}
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
            className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none"
          />
        ) : (
          <span className="heading min-w-0 flex-1 truncate text-[13px]">{block.title}</span>
        )}
        <button
          onClick={remove}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] text-ink-soft hover:text-ink"
          title="Blok verwijderen"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {block.type === "note" && <NoteBlock block={block} />}
        {block.type === "checklist" && <ChecklistBlock block={block} />}
        {block.type === "file-organizer" && <FileOrganizerBlock block={block} />}
      </div>
    </div>
  );
}
