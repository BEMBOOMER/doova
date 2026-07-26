import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import type { NoteBlockData } from "../../../types";
import { useProjectsStore } from "../../../stores/projectsStore";
import { revealInFinder } from "../../../lib/fileSystem";
import { FileBadge, ImageOrRow } from "../../ui/FileThumb";

function ToolbarButton({
  editor,
  action,
  active,
  label,
  title,
}: {
  editor: Editor;
  action: () => void;
  active: boolean;
  label: string;
  title: string;
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); action(); }}
      className={`flex h-6 min-w-6 items-center justify-center rounded px-1 text-[12px] transition-colors ${
        active ? "bg-accent text-accent-ink" : "text-ink-soft hover:text-ink"
      }`}
      title={title}
      disabled={!editor.isEditable}
    >
      {label}
    </button>
  );
}

const HIGHLIGHT_COLORS = ["#FFF176", "#A5F3C4", "#A5D8FF", "#FFC9DE", "#E4C7FF"];

export function NoteBlock({ block }: { block: NoteBlockData }) {
  const setNoteContent = useProjectsStore((s) => s.setNoteContent);
  const removeNoteFile = useProjectsStore((s) => s.removeNoteFile);
  const files = block.files ?? [];
  // popover lives in a body portal: inside the block it gets clipped by the
  // block's own scroll container
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => {
      if (toggleRef.current?.contains(e.target as Node)) return;
      if (!pickerRef.current?.contains(e.target as Node)) setPicker(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [picker]);

  const openPickerAt = (x: number, y: number) =>
    setPicker({
      x: Math.min(Math.max(x, 8), window.innerWidth - 200),
      y: Math.min(y, window.innerHeight - 60),
    });

  const editor = useEditor({
    // keep toolbar active-states in sync with the selection (v3 defaults to false)
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: "Schrijf iets, of sleep een bestand…" }),
    ],
    content: block.content ?? "",
    onUpdate: ({ editor }) => setNoteContent(block.id, editor.getJSON()),
  });

  if (!editor) return null;

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-1 flex flex-wrap items-center gap-0.5 rounded-themed-sm px-1 py-0.5">
        <ToolbarButton editor={editor} label="B" title="Vet"
          action={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")} />
        <ToolbarButton editor={editor} label="I" title="Cursief"
          action={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")} />
        <ToolbarButton editor={editor} label="S" title="Doorhalen"
          action={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")} />
        <span className="mx-0.5 h-4 w-px bg-border-themed opacity-40" />
        <ToolbarButton editor={editor} label="H1" title="Kop 1"
          action={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive("heading", { level: 1 })} />
        <ToolbarButton editor={editor} label="H2" title="Kop 2"
          action={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })} />
        <span className="mx-0.5 h-4 w-px bg-border-themed opacity-40" />
        <ToolbarButton editor={editor} label="•" title="Lijst"
          action={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")} />
        <ToolbarButton editor={editor} label="1." title="Genummerde lijst"
          action={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")} />
        <ToolbarButton editor={editor} label="☑" title="Checklist"
          action={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive("taskList")} />
        <span className="mx-0.5 h-4 w-px bg-border-themed opacity-40" />
        <div ref={toggleRef}>
          <ToolbarButton editor={editor} label="✎" title="Markeren"
            action={() => {
              if (picker) {
                setPicker(null);
                return;
              }
              const r = toggleRef.current?.getBoundingClientRect();
              if (r) openPickerAt(r.left, r.bottom + 6);
            }}
            active={editor.isActive("highlight")} />
        </div>
      </div>
      <div
        onContextMenu={(e) => {
          // right-click on a selection offers the highlighter instead of the
          // block menu; an empty selection falls through to the block
          if (editor.state.selection.empty) return;
          e.preventDefault();
          e.stopPropagation();
          openPickerAt(e.clientX, e.clientY);
        }}
      >
        <EditorContent editor={editor} />
      </div>
      {picker &&
        createPortal(
          <div
            ref={pickerRef}
            className="panel pop-in fixed z-[90] flex items-center gap-1.5 p-1.5"
            style={{ left: picker.x, top: picker.y }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  editor.chain().focus().setHighlight({ color: c }).run();
                  setPicker(null);
                }}
                className="h-6 w-6 rounded-full transition-transform hover:scale-110"
                style={{ background: c }}
                title="Markeer selectie"
              />
            ))}
            <button
              onClick={() => {
                editor.chain().focus().unsetHighlight().run();
                setPicker(null);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-border-themed text-[11px] text-ink-soft hover:text-ink"
              title="Markering weghalen"
            >
              ✕
            </button>
          </div>,
          document.body,
        )}
      {files.length > 0 && (
        <div className="mt-2 border-t border-border-themed/30 pt-1.5">
          {files.map((item) => (
            <ImageOrRow
              key={item.id}
              item={item}
              onOpen={() => void revealInFinder(item.path)}
              onRemove={() => removeNoteFile(block.id, item.id)}
              row={
                <div
                  onClick={() => void revealInFinder(item.path)}
                  className="group pop-in flex cursor-pointer items-center gap-2.5 rounded-themed-sm px-1.5 py-1.5 transition-colors hover:bg-surface-raised"
                  title={`${item.path}\nKlik om te tonen in Finder`}
                >
                  <FileBadge item={item} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
                      {item.name}
                    </span>
                    <span className="block truncate text-[10.5px] leading-tight text-ink-soft">
                      {item.path.replace(/^\/Users\/[^/]+/, "~").split("/").slice(0, -1).join("/")}
                    </span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNoteFile(block.id, item.id);
                    }}
                    className="hidden h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] text-ink-soft hover:text-ink group-hover:flex"
                    title="Bijlage verwijderen"
                  >
                    ✕
                  </button>
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
