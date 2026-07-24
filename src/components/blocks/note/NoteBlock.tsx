import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import type { NoteBlockData } from "../../../types";
import { useProjectsStore } from "../../../stores/projectsStore";

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

export function NoteBlock({ block }: { block: NoteBlockData }) {
  const setNoteContent = useProjectsStore((s) => s.setNoteContent);

  const editor = useEditor({
    // keep toolbar active-states in sync with the selection (v3 defaults to false)
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
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
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
