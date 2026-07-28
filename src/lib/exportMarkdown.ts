import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  MarkdownSerializer,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";
import type { JSONContent } from "@tiptap/react";
import type { Block, ProjectTab } from "../types";
import { collectDueDates } from "./calendarAggregate";

const schema = getSchema([
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  TaskList,
  TaskItem.configure({ nested: true }),
]);

const d = defaultMarkdownSerializer;

// Tiptap uses camelCase node names; map them onto prosemirror-markdown's writers
const serializer = new MarkdownSerializer(
  {
    doc: (state, node) => state.renderContent(node),
    paragraph: d.nodes.paragraph,
    heading: d.nodes.heading,
    text: d.nodes.text,
    blockquote: d.nodes.blockquote,
    codeBlock: d.nodes.code_block,
    horizontalRule: d.nodes.horizontal_rule,
    hardBreak: d.nodes.hard_break,
    bulletList: d.nodes.bullet_list,
    orderedList: d.nodes.ordered_list,
    listItem: d.nodes.list_item,
    taskList: (state, node) => {
      state.renderList(node, "  ", () => "- ");
    },
    taskItem: (state, node) => {
      state.write(node.attrs.checked ? "[x] " : "[ ] ");
      state.renderContent(node);
    },
  },
  {
    bold: d.marks.strong,
    italic: d.marks.em,
    code: d.marks.code,
    strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
    // highlights survive as ==marked== (Obsidian/Notion-style)
    highlight: { open: "==", close: "==", mixable: true, expelEnclosingWhitespace: true },
  },
);

export function noteToMarkdown(content: JSONContent | null): string {
  if (!content) return "";
  try {
    return serializer.serialize(schema.nodeFromJSON(content)).trim();
  } catch (err) {
    console.error("markdown serialize failed", err);
    return "(kon notitie niet omzetten)";
  }
}

function blockToMarkdown(block: Block): string {
  const lines: string[] = [`## ${block.title}`];
  if (block.type === "note") {
    lines.push(noteToMarkdown(block.content) || "_leeg_");
    const files = block.files ?? [];
    if (files.length > 0) {
      lines.push("", "**Bijlagen**");
      for (const it of files) {
        lines.push(`- ${it.missing ? "⚠ " : ""}${it.name} — \`${it.path}\``);
      }
    }
  } else if (block.type === "file-organizer") {
    if (block.items.length === 0) lines.push("_leeg_");
    for (const it of block.items) {
      lines.push(`- ${it.missing ? "⚠ " : ""}${it.name}${it.ext ? ` (${it.ext})` : ""} — \`${it.path}\``);
    }
  } else if (block.type === "link") {
    lines.push(`[${block.linkTitle || block.url}](${block.url})`);
  } else if (block.type === "swatch") {
    if (block.swatches.length === 0) lines.push("_geen kleuren_");
    for (const sw of block.swatches) {
      lines.push(`- \`${sw.hex.toUpperCase()}\`${sw.name ? ` — ${sw.name}` : ""}`);
    }
  } else if (block.type === "moodboard") {
    if (block.images.length === 0) lines.push("_geen afbeeldingen_");
    for (const img of block.images) lines.push(`- ${img.name}`);
  } else if (block.type === "calendar") {
    const sorted = [...block.events].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) lines.push("_geen events_");
    for (const ev of sorted) {
      lines.push(`- ${ev.date}${ev.time ? ` ${ev.time}` : ""} — ${ev.title}`);
    }
  }
  return lines.join("\n");
}

/** Reading order: top-to-bottom, then left-to-right within a row band. */
function readingOrder(blocks: Block[]): Block[] {
  return [...blocks].sort((a, b) => {
    const rowA = Math.round(a.layout.y / 100);
    const rowB = Math.round(b.layout.y / 100);
    if (rowA !== rowB) return rowA - rowB;
    return a.layout.x - b.layout.x;
  });
}

export function exportProjectMarkdown(tab: ProjectTab): string {
  const parts = [`# ${tab.name}`, ""];
  for (const block of readingOrder(tab.blocks)) {
    parts.push(blockToMarkdown(block), "");
  }
  return parts.join("\n").trim() + "\n";
}

export function exportProjectDigest(tab: ProjectTab): string {
  const dues = collectDueDates(tab);
  const openTasks: string[] = [];
  for (const block of readingOrder(tab.blocks)) {
    if (block.type !== "note" || !block.content) continue;
    const md = noteToMarkdown(block.content);
    for (const line of md.split("\n")) {
      if (line.trim().startsWith("- [ ]")) {
        openTasks.push(`${line.trim()} _(${block.title})_`);
      }
    }
  }
  const deadlines = dues
    .filter((due) => !due.done)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((due) => `- ${due.date}: ${due.text} _(${due.blockTitle})_`);

  const noteSnippets = readingOrder(tab.blocks)
    .filter((b) => b.type === "note" && b.content)
    .map((b) => {
      const firstLines = noteToMarkdown((b as { content: JSONContent | null }).content)
        .split("\n")
        .filter((l) => l.trim() && !l.trim().startsWith("- ["))
        .slice(0, 2)
        .join(" · ");
      return firstLines ? `- **${b.title}**: ${firstLines}` : null;
    })
    .filter(Boolean) as string[];

  return [
    `# ${tab.name} — stand van zaken`,
    "",
    "## Open taken",
    openTasks.length ? openTasks.join("\n") : "_geen_",
    "",
    "## Deadlines",
    deadlines.length ? deadlines.join("\n") : "_geen_",
    "",
    "## Notities (kern)",
    noteSnippets.length ? noteSnippets.join("\n") : "_geen_",
    "",
  ].join("\n");
}
