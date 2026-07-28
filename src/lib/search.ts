import type { JSONContent } from "@tiptap/react";
import type { Block, ProjectTab } from "../types";

/**
 * Searching every block in every project.
 *
 * A plain "does it contain the query" check made every hit look equally good,
 * so a passing mention in a long note outranked a block actually named after
 * what you typed. This ranks, and returns the surrounding words, so the list
 * shows why something matched instead of just that it did.
 *
 * There is no index. A personal canvas holds a few hundred blocks at most, and
 * recomputing on each keystroke stays well under a frame at that size while
 * never being stale.
 */

export interface SearchHit {
  block: Block;
  tab: ProjectTab;
  score: number;
  /** Words around the match, or the empty string when the title matched. */
  snippet: string;
  /** Offsets into `snippet` for highlighting. */
  match: { start: number; end: number } | null;
}

export function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join(" ");
}

/**
 * Lower-cased and stripped of accents, so "cafe" finds "café" and the other way
 * round. Doing it to both sides keeps offsets aligned with the original text.
 */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Everything in a block worth searching, beyond its title. */
function bodyOf(block: Block): string {
  switch (block.type) {
    case "note": {
      const note = block.content ? textOf(block.content) : "";
      const files = (block.files ?? []).map((f) => f.name).join(" ");
      return `${note} ${files}`.trim();
    }
    case "file-organizer":
      return block.items.map((it) => it.name).join(" ");
    case "calendar":
      return block.events.map((ev) => `${ev.date} ${ev.title} ${ev.note ?? ""}`).join(" ");
    case "moodboard":
      return block.images.map((img) => img.name).join(" ");
    // the url counts as much as the title: you often remember only the domain
    case "link":
      return `${block.linkTitle ?? ""} ${block.url}`.trim();
    case "swatch":
      return block.swatches.map((sw) => `${sw.hex} ${sw.name ?? ""}`).join(" ");
  }
}

const SNIPPET_PAD = 44;

function snippetAround(text: string, at: number, length: number): SearchHit["snippet"] {
  const from = Math.max(0, at - SNIPPET_PAD);
  const to = Math.min(text.length, at + length + SNIPPET_PAD);
  return (from > 0 ? "…" : "") + text.slice(from, to).trim() + (to < text.length ? "…" : "");
}

export function searchBlocks(tabs: ProjectTab[], query: string): SearchHit[] {
  const q = fold(query.trim());
  if (!q) return [];

  const hits: SearchHit[] = [];
  for (const tab of tabs) {
    for (const block of tab.blocks) {
      const title = fold(block.title);
      const titleAt = title.indexOf(q);

      if (titleAt === 0) {
        hits.push({ block, tab, score: 100, snippet: "", match: null });
        continue;
      }
      if (titleAt > 0) {
        hits.push({ block, tab, score: 70, snippet: "", match: null });
        continue;
      }

      const body = bodyOf(block);
      const bodyAt = fold(body).indexOf(q);
      if (bodyAt < 0) continue;

      // Locating the match inside the finished snippet, rather than carrying an
      // offset through the slicing and trimming, keeps the highlight honest.
      const snippet = snippetAround(body, bodyAt, q.length);
      const inSnippet = fold(snippet).indexOf(q);
      hits.push({
        block,
        tab,
        score: 40,
        snippet,
        match: inSnippet < 0 ? null : { start: inSnippet, end: inSnippet + q.length },
      });
    }
  }

  // Newest first among equals: what you touched recently is what you mean
  return hits.sort(
    (a, b) => b.score - a.score || b.block.createdAt.localeCompare(a.block.createdAt),
  );
}
