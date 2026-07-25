import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { exists } from "@tauri-apps/plugin-fs";
import { stat } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { FileOrganizerItem } from "../types";
import { isTauri, newId, nowIso } from "./ids";

const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "heif", "avif", "bmp", "tiff", "tif",
]);

export function isImage(item: FileOrganizerItem): boolean {
  return item.kind === "file" && !!item.ext && IMAGE_EXTS.has(item.ext);
}

/** asset: URL for a local file, or null outside Tauri (dev browser). */
export function imageSrc(path: string): string | null {
  return isTauri() ? convertFileSrc(path) : null;
}

export async function makeFileItem(path: string): Promise<FileOrganizerItem> {
  const name = path.replace(/\/+$/, "").split("/").pop() ?? path;
  let kind: "file" | "folder" = "file";
  try {
    const info = await stat(path);
    kind = info.isDirectory ? "folder" : "file";
  } catch {
    // stat can fail outside fs scope; fall back to extension heuristic
    kind = /\.[A-Za-z0-9]{1,8}$/.test(name) ? "file" : "folder";
  }
  const ext = kind === "file" ? (name.includes(".") ? name.split(".").pop()!.toLowerCase() : null) : null;
  return { id: newId(), path, name, kind, ext, addedAt: nowIso() };
}

export async function revealInFinder(path: string): Promise<boolean> {
  try {
    await revealItemInDir(path);
    return true;
  } catch (err) {
    console.error("reveal failed", err);
    return false;
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    return await exists(path);
  } catch {
    // outside fs scope; assume it exists rather than flagging falsely
    return true;
  }
}

const EXT_ICONS: Record<string, string> = {
  png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", webp: "🖼️", svg: "🖼️", heic: "🖼️",
  mp4: "🎬", mov: "🎬", avi: "🎬", mkv: "🎬", webm: "🎬",
  mp3: "🎵", wav: "🎵", aiff: "🎵", flac: "🎵", m4a: "🎵",
  pdf: "📕",
  doc: "📄", docx: "📄", txt: "📄", md: "📄", rtf: "📄", pages: "📄",
  xls: "📊", xlsx: "📊", csv: "📊", numbers: "📊",
  ppt: "📽️", pptx: "📽️", key: "📽️",
  zip: "🗜️", rar: "🗜️", "7z": "🗜️", dmg: "💿",
  psd: "🎨", ai: "🎨", fig: "🎨", sketch: "🎨", afdesign: "🎨",
  js: "⚙️", ts: "⚙️", tsx: "⚙️", jsx: "⚙️", html: "⚙️", css: "⚙️", json: "⚙️", py: "⚙️", rs: "⚙️", swift: "⚙️",
  drp: "🎞️", prproj: "🎞️", aep: "🎞️",
};

export function iconFor(item: FileOrganizerItem): string {
  if (item.kind === "folder") return "📁";
  return (item.ext && EXT_ICONS[item.ext]) || "📄";
}
