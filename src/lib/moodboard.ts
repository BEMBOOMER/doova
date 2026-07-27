import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import type { MoodboardImage } from "../types";
import { isTauri, newId, nowIso } from "./ids";

/**
 * Moodboard images are copies inside the app's data folder. The block stores
 * only a filename; turning that into something the webview can show happens
 * here, and the path is cached because it never changes while the app runs.
 */

interface ImportedImage {
  file: string;
  name: string;
}

const IMAGE_MIME = /^image\/(png|jpeg|gif|webp|heic|heif|avif|bmp|tiff|svg\+xml)$/;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/tiff": "tif",
  "image/svg+xml": "svg",
};

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "avif", "bmp", "tif", "tiff", "svg",
]);

export function isImagePath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.has(ext);
}

let dirPromise: Promise<string> | null = null;
const urlCache = new Map<string, string>();

/** asset: URL for a stored image, or null outside Tauri (dev browser). */
export async function imageUrl(file: string): Promise<string | null> {
  if (!isTauri()) return null;
  const cached = urlCache.get(file);
  if (cached) return cached;
  dirPromise ??= appDataDir();
  const url = convertFileSrc(await join(await dirPromise, "images", file));
  urlCache.set(file, url);
  return url;
}

/**
 * A copy of the image scaled to fit a page, as a data URI.
 *
 * The exporter renders images at their natural pixel size and ignores both the
 * width attribute and CSS, so an original would run straight off the page. The
 * webview does the scaling because it already has the decoder and a canvas.
 */
export async function imageDataUrl(
  file: string,
  maxWidth = 460,
  maxHeight = 620,
): Promise<string | null> {
  const url = await imageUrl(file);
  if (!url) return null;
  const img = await load(url);
  if (!img) return null;

  const scale = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // JPEG has no alpha, so transparent areas would come out black
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch (err) {
    console.error("image rescale failed", file, err);
    return null;
  }
}

function load(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Natural size, so the grid can hold a slot open instead of jumping on load. */
function measure(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function toMoodboardImage(imported: ImportedImage): Promise<MoodboardImage> {
  const url = await imageUrl(imported.file);
  const size = url ? await measure(url) : null;
  return {
    id: newId(),
    file: imported.file,
    name: imported.name,
    addedAt: nowIso(),
    ...(size ?? {}),
  };
}

/** Copies files from disk into the app's folder. Non-images are skipped. */
export async function importImagePaths(paths: string[]): Promise<MoodboardImage[]> {
  const results: MoodboardImage[] = [];
  for (const path of paths.filter(isImagePath)) {
    try {
      const imported = await invoke<ImportedImage>("import_image_file", { path });
      results.push(await toMoodboardImage(imported));
    } catch (err) {
      console.error("image import failed", path, err);
    }
  }
  return results;
}

function toBase64(bytes: Uint8Array): string {
  // btoa needs a binary string, and a spread of a large array blows the stack
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

/** Pasted or dropped blobs: pixels without a file to copy from. */
export async function importImageBlobs(files: File[]): Promise<MoodboardImage[]> {
  const results: MoodboardImage[] = [];
  for (const file of files) {
    if (!IMAGE_MIME.test(file.type)) continue;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const imported = await invoke<ImportedImage>("import_image_bytes", {
        data: toBase64(bytes),
        ext: MIME_EXTENSIONS[file.type] ?? "png",
        name: file.name || "Geplakt beeld",
      });
      results.push(await toMoodboardImage(imported));
    } catch (err) {
      console.error("pasted image import failed", err);
    }
  }
  return results;
}

/**
 * Removing an image or a board leaves its file alone, because both can be
 * undone and a restored board with blank tiles is worse than a stale file.
 * This runs once at startup, when there is no undo history left to honour.
 */
export async function sweepUnusedImages(keep: string[]): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke<number>("sweep_unused_images", { keep });
  } catch (err) {
    console.error("image sweep failed", err);
  }
}

/** Gives a duplicated block its own copies, so removing one cannot blank the other. */
export async function copyStoredImages(images: MoodboardImage[]): Promise<MoodboardImage[]> {
  const copies: MoodboardImage[] = [];
  for (const image of images) {
    try {
      const file = await invoke<string>("copy_stored_image", { file: image.file });
      copies.push({ ...image, id: newId(), file });
    } catch (err) {
      console.error("image copy failed", image.file, err);
    }
  }
  return copies;
}
