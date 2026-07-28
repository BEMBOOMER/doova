import { defaultSizeFor } from "../types";
import { useProjectsStore } from "../stores/projectsStore";
import { useUiStore } from "../stores/uiStore";
import { viewportCenter } from "./canvasView";
import { importImageBlobs } from "./moodboard";
import { isSingleUrl } from "./links";
import { isTauri } from "./ids";

export interface Pasted {
  images: File[];
  text: string;
}

/**
 * Reads the clipboard while it is still readable.
 *
 * A DataTransfer is only valid for the duration of its event handler, so this
 * has to happen before anything is awaited; pulling it out separately makes
 * that ordering a rule rather than something the next edit can quietly break.
 */
export function readClipboard(data: DataTransfer): Pasted {
  return {
    images: [...data.files].filter((f) => f.type.startsWith("image/")),
    text: data.getData("text/plain"),
  };
}

/** True when there is anything here the canvas would make a block out of. */
export function hasPasteContent(pasted: Pasted): boolean {
  return pasted.images.length > 0 || pasted.text.trim().length > 0;
}

/**
 * Turns whatever was on the clipboard into the block it most plainly is: a URL
 * becomes a link, an image becomes a moodboard, anything else becomes a note.
 *
 * Only reached when the paste did not belong to something else. An editor, an
 * input or a hovered moodboard all handle their own paste first; this is the
 * fallback for a paste aimed at the canvas itself.
 */
export async function pasteToCanvas({ images: files, text }: Pasted): Promise<boolean> {
  if (!isTauri()) return false;
  const store = useProjectsStore.getState();
  const { showToast } = useUiStore.getState();
  if (!store.activeTabId) return false;

  if (files.length > 0) {
    // Decided before the import, because :hover is only true while the pointer
    // is still there and the import takes long enough for that to change.
    const target = hoveredMoodboardId();
    const images = await importImageBlobs(files);
    if (images.length === 0) {
      showToast("Deze afbeelding kon niet worden toegevoegd");
      return true;
    }
    if (target) {
      store.addMoodboardImages(target, images);
    } else {
      const id = store.addBlock(viewportCenter(defaultSizeFor("moodboard")));
      store.promoteBlockToMoodboard(id, images);
    }
    showToast(images.length === 1 ? "Beeld geplakt" : `${images.length} beelden geplakt`);
    return true;
  }

  if (!text.trim()) return false;

  if (isSingleUrl(text)) {
    const id = store.addBlock(viewportCenter(defaultSizeFor("link")));
    store.promoteBlockToLink(id, text.trim());
    showToast("Link geplakt");
    return true;
  }

  const id = store.addBlock(viewportCenter(defaultSizeFor("note")));
  store.setNoteContent(id, {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  });
  store.renameBlock(id, firstLine(text));
  showToast("Tekst geplakt");
  return true;
}

/**
 * The moodboard under the pointer, if any. One paste listener decides where an
 * image goes: two listeners racing on window meant whichever mounted first won,
 * which is not a rule anyone can reason about.
 */
function hoveredMoodboardId(): string | null {
  const hovered = document.querySelectorAll<HTMLElement>('[data-block-type="moodboard"]:hover');
  // innermost wins when boards overlap
  return hovered[hovered.length - 1]?.dataset.blockId ?? null;
}

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  return line.length > 42 ? `${line.slice(0, 41)}…` : line || "Geplakte tekst";
}
