import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { Block } from "../types";
import { blockToHtmlDocument } from "./exportHtml";
import { useUiStore } from "../stores/uiStore";
import { isTauri } from "./ids";

export type DocumentFormat = "pdf" | "docx";

const FORMATS: Record<DocumentFormat, { label: string; extension: string }> = {
  pdf: { label: "PDF", extension: "pdf" },
  docx: { label: "Word", extension: "docx" },
};

/** Keeps the suggested filename usable as one, on any filesystem. */
function safeName(title: string): string {
  const cleaned = title.replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Blok";
}

export async function exportBlockAs(
  block: Block,
  projectName: string,
  format: DocumentFormat,
): Promise<void> {
  const { showToast } = useUiStore.getState();
  const { label, extension } = FORMATS[format];

  if (!isTauri()) {
    showToast(`${label} exporteren werkt alleen in de app`);
    return;
  }

  const path = await save({
    defaultPath: `${safeName(block.title)}.${extension}`,
    filters: [{ name: label, extensions: [extension] }],
  });
  if (!path) return;

  try {
    // Rust writes the file itself, so this is not bound by the frontend's
    // filesystem scope and any folder the save dialog allows will work.
    await invoke("export_document", {
      html: blockToHtmlDocument(block, projectName),
      path,
      format,
    });
    showToast(`Geëxporteerd als ${label}`);
  } catch (err) {
    console.error("document export failed", err);
    showToast(typeof err === "string" ? err : `${label} exporteren mislukt`);
  }
}
