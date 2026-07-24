import type { JSONContent } from "@tiptap/react";
import type { ProjectTab } from "../types";
import { DUE_MARKER } from "../types";

export interface AggregatedDue {
  date: string; // yyyy-mm-dd
  text: string;
  done: boolean;
  blockTitle: string;
}

const DUE_RE = new RegExp(`${DUE_MARKER}(\\d{4}-\\d{2}-\\d{2})`);

function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

function walk(node: JSONContent, blockTitle: string, out: AggregatedDue[]) {
  if (node.type === "taskItem") {
    const text = textOf(node);
    const m = text.match(DUE_RE);
    if (m) {
      out.push({
        date: m[1],
        text: text.replace(DUE_RE, "").replace(/\s*·\s*$/, "").trim(),
        done: Boolean((node.attrs as { checked?: boolean } | undefined)?.checked),
        blockTitle,
      });
    }
  }
  for (const child of node.content ?? []) walk(child, blockTitle, out);
}

/** All due dates found in the tab's note blocks (tasks with a ⏳yyyy-mm-dd marker). */
export function collectDueDates(tab: ProjectTab): AggregatedDue[] {
  const out: AggregatedDue[] = [];
  for (const block of tab.blocks) {
    if (block.type === "note" && block.content) walk(block.content, block.title, out);
  }
  return out;
}
