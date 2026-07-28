import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { LinkMeta } from "../types";
import { isTauri } from "./ids";

/**
 * Everything the link block needs from outside the webview.
 *
 * The fetch itself happens in Rust so the content policy can stay shut, and it
 * is fire-and-forget: a link block is fully usable with nothing but its URL.
 */

const URL_PATTERN = /^https?:\/\/[^\s<>"']+$/i;

/** True only for a single bare web address, so a sentence quoting one stays text. */
export function isSingleUrl(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length <= 2048 && URL_PATTERN.test(trimmed);
}

export async function fetchLinkMetadata(url: string): Promise<LinkMeta | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<LinkMeta>("fetch_link_metadata", { url });
  } catch (err) {
    console.error("link metadata failed", url, err);
    // Still counts as an attempt: the block stamps fetchedAt either way so a
    // dead site is not re-fetched on every render.
    return {};
  }
}

let dirPromise: Promise<string> | null = null;
const urlCache = new Map<string, string>();

export async function faviconUrl(file: string): Promise<string | null> {
  if (!isTauri()) return null;
  const cached = urlCache.get(file);
  if (cached) return cached;
  dirPromise ??= appDataDir();
  const url = convertFileSrc(await join(await dirPromise, "favicons", file));
  urlCache.set(file, url);
  return url;
}

export function openLink(url: string): Promise<void> {
  return openUrl(url);
}

/**
 * Favicons live beside the moodboard images but in their own folder, and their
 * own sweep: the image sweep deletes anything with an image extension that no
 * block claims, and every favicon would match that description.
 */
export async function sweepUnusedFavicons(keep: string[]): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke<number>("sweep_unused_favicons", { keep });
  } catch (err) {
    console.error("favicon sweep failed", err);
  }
}
