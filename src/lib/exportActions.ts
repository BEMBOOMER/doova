import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { ProjectTab } from "../types";
import { exportProjectDigest, exportProjectMarkdown } from "./exportMarkdown";
import { useUiStore } from "../stores/uiStore";
import { isTauri } from "./ids";
import { copyText } from "./clipboard";

async function deliver(markdown: string, suggestedName: string) {
  const { showToast } = useUiStore.getState();
  // clipboard can fail outside a user gesture; the save dialog is still offered
  await copyText(markdown);
  if (!isTauri()) {
    showToast("Gekopieerd naar klembord");
    return;
  }
  const path = await save({
    defaultPath: suggestedName,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!path) {
    showToast("Gekopieerd naar klembord");
    return;
  }
  try {
    await writeTextFile(path, markdown);
    showToast("Geëxporteerd én op klembord gezet");
  } catch (err) {
    console.error("export write failed", err);
    showToast("Opslaan buiten toegestane mappen mislukt, wel op klembord");
  }
}

export async function runExportFull(tab: ProjectTab) {
  await deliver(exportProjectMarkdown(tab), `${tab.name}.md`);
}

export async function runExportDigest(tab: ProjectTab) {
  await deliver(exportProjectDigest(tab), `${tab.name} digest.md`);
}
