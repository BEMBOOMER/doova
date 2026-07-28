import type { JSONContent } from "@tiptap/react";
import type { Block } from "../types";

/**
 * Turns a block into a standalone HTML document for the PDF and Word export.
 *
 * macOS parses this with NSAttributedString, which understands a useful subset
 * of CSS but has opinions of its own. Two of them shape what is written here:
 * checklists are paragraphs rather than list items, because the importer would
 * add its own bullet next to the checkbox, and only inline styling that the
 * importer actually honours is used.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

function applyMarks(text: string, marks: JSONContent["marks"]): string {
  let out = escapeHtml(text);
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case "bold":
        out = `<strong>${out}</strong>`;
        break;
      case "italic":
        out = `<em>${out}</em>`;
        break;
      case "strike":
        out = `<s>${out}</s>`;
        break;
      case "code":
        out = `<code>${out}</code>`;
        break;
      case "highlight": {
        const color = typeof mark.attrs?.color === "string" ? mark.attrs.color : "#FFF176";
        out = `<span style="background-color:${escapeHtml(color)}">${out}</span>`;
        break;
      }
    }
  }
  return out;
}

function children(node: JSONContent): string {
  return (node.content ?? []).map(nodeToHtml).join("");
}

/** Flattens a task list to paragraphs; see the note at the top of this file. */
function taskItemToHtml(node: JSONContent, depth: number): string {
  const box = node.attrs?.checked ? "&#9745;" : "&#9744;";
  const own = (node.content ?? []).filter((c) => c.type !== "taskList");
  const nested = (node.content ?? []).filter((c) => c.type === "taskList");
  // The converter drops margin-left on paragraphs, so nesting is spelled out in
  // actual spaces or every level would sit flush against the margin.
  const indent = "&nbsp;&nbsp;&nbsp;&nbsp;".repeat(depth);
  const text = own.map(children).join(" ");
  return (
    `<p class="task">${indent}${box}&nbsp;${text}</p>` +
    nested.map((list) => taskListToHtml(list, depth + 1)).join("")
  );
}

function taskListToHtml(node: JSONContent, depth = 0): string {
  return (node.content ?? [])
    .filter((c) => c.type === "taskItem")
    .map((item) => taskItemToHtml(item, depth))
    .join("");
}

function nodeToHtml(node: JSONContent): string {
  switch (node.type) {
    case "text":
      return applyMarks(node.text ?? "", node.marks);
    case "paragraph": {
      const inner = children(node);
      // an empty paragraph is spacing the user put there on purpose
      return inner ? `<p>${inner}</p>` : "<p>&nbsp;</p>";
    }
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 3);
      return `<h${level}>${children(node)}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${children(node)}</ul>`;
    case "orderedList":
      return `<ol>${children(node)}</ol>`;
    case "listItem":
      return `<li>${children(node)}</li>`;
    case "taskList":
      return taskListToHtml(node);
    case "blockquote":
      return `<blockquote>${children(node)}</blockquote>`;
    case "codeBlock":
      return `<pre>${escapeHtml(
        (node.content ?? []).map((c) => c.text ?? "").join(""),
      )}</pre>`;
    case "horizontalRule":
      return "<hr />";
    case "hardBreak":
      return "<br />";
    default:
      return children(node);
  }
}

export function noteToHtml(content: JSONContent | null): string {
  if (!content) return "";
  try {
    return children(content);
  } catch (err) {
    console.error("html serialize failed", err);
    return "<p><em>Deze notitie kon niet omgezet worden.</em></p>";
  }
}

const STYLESHEET = `
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, sans-serif;
         font-size: 11pt; line-height: 1.45; color: #1a1a1a; }
  h1 { font-size: 20pt; margin: 0 0 10pt; }
  h2 { font-size: 15pt; margin: 14pt 0 6pt; }
  h3 { font-size: 12.5pt; margin: 12pt 0 5pt; }
  p { margin: 0 0 7pt; }
  p.task { margin: 0 0 4pt; }
  ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
  li { margin: 0 0 3pt; }
  blockquote { margin: 0 0 8pt; color: #555; font-style: italic; }
  pre { font-family: "SF Mono", Menlo, monospace; font-size: 9.5pt;
        background: #f2f2f2; padding: 8pt; margin: 0 0 8pt; }
  code { font-family: "SF Mono", Menlo, monospace; font-size: 9.5pt; }
  hr { border: none; border-top: 1px solid #ccc; margin: 10pt 0; }
  .meta { color: #777; font-size: 9pt; margin: 0 0 14pt; }
  .attachments { margin-top: 14pt; }
  .attachments h2 { font-size: 12pt; }
  .path { color: #777; font-size: 9pt; }
`;

function fileRows(items: { name: string; path: string; missing?: boolean }[]): string {
  if (items.length === 0) return "<p><em>Leeg</em></p>";
  return items
    .map(
      (item) =>
        `<p>${item.missing ? "&#9888; " : ""}${escapeHtml(item.name)}<br />` +
        `<span class="path">${escapeHtml(item.path)}</span></p>`,
    )
    .join("");
}

/**
 * Data URI per stored image filename, already scaled to fit a page. The
 * converter ignores file: URLs entirely and renders whatever it does load at
 * natural pixel size, so both the source and the size are settled before the
 * HTML is written.
 */
export type ImageData = Map<string, string>;

function moodboardBody(
  images: { file: string; name: string }[],
  data: ImageData,
): string {
  if (images.length === 0) return "<p><em>Nog geen afbeeldingen</em></p>";
  return images
    .map((image) => {
      const uri = data.get(image.file);
      if (!uri) return `<p>${escapeHtml(image.name)} <span class="path">(kon niet worden ingesloten)</span></p>`;
      return `<p><img src="${uri}" /></p><p class="path">${escapeHtml(image.name)}</p>`;
    })
    .join("");
}

function bodyForBlock(block: Block, images: ImageData): string {
  if (block.type === "note") {
    const note = noteToHtml(block.content) || "<p><em>Leeg</em></p>";
    const files = block.files ?? [];
    if (files.length === 0) return note;
    return `${note}<div class="attachments"><h2>Bijlagen</h2>${fileRows(files)}</div>`;
  }
  if (block.type === "file-organizer") return fileRows(block.items);
  if (block.type === "moodboard") return moodboardBody(block.images, images);
  if (block.type === "link") {
    return (
      `<p><a href="${escapeHtml(block.url)}">${escapeHtml(block.linkTitle || block.url)}</a></p>` +
      `<p class="path">${escapeHtml(block.url)}</p>`
    );
  }
  if (block.type === "swatch") {
    if (block.swatches.length === 0) return "<p><em>Nog geen kleuren</em></p>";
    return block.swatches
      .map(
        (sw) =>
          `<p><span style="background-color:${escapeHtml(sw.hex)}">&nbsp;&nbsp;&nbsp;&nbsp;</span>` +
          `&nbsp;&nbsp;<strong>${escapeHtml(sw.hex.toUpperCase())}</strong>` +
          (sw.name ? `&nbsp;&nbsp;${escapeHtml(sw.name)}` : "") +
          `</p>`,
      )
      .join("");
  }

  const events = [...block.events].sort((a, b) => a.date.localeCompare(b.date));
  if (events.length === 0) return "<p><em>Geen afspraken</em></p>";
  return events
    .map(
      (ev) =>
        `<p><strong>${escapeHtml(ev.date)}${ev.time ? ` ${escapeHtml(ev.time)}` : ""}</strong>` +
        `&nbsp;&nbsp;${escapeHtml(ev.title)}` +
        (ev.note ? `<br /><span class="path">${escapeHtml(ev.note)}</span>` : "") +
        `</p>`,
    )
    .join("");
}

/** Standalone document for one block, ready for the native converter. */
export function blockToHtmlDocument(
  block: Block,
  projectName: string,
  imageData: ImageData = new Map(),
): string {
  const stamp = new Date().toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return [
    '<!doctype html><html><head><meta charset="utf-8" />',
    `<style>${STYLESHEET}</style></head><body>`,
    `<h1>${escapeHtml(block.title)}</h1>`,
    `<p class="meta">${escapeHtml(projectName)} &middot; ${escapeHtml(stamp)}</p>`,
    bodyForBlock(block, imageData),
    "</body></html>",
  ].join("");
}
