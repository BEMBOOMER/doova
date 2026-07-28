import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./ids";

/**
 * Reading and writing Doova's own files.
 *
 * The bytes are handled by Rust, which owns the data folder and is the only
 * thing that knows where it currently is. Keeping one authority over the
 * location matters now that the folder can move: a path held over here too
 * would be a second answer, and the moment the two disagreed a save would land
 * where nobody looks. It also means the webview needs no filesystem access.
 *
 * The scheduling stays on this side, because it is about how the app behaves
 * rather than about files: writes are debounced, serialised per file, and
 * re-queued on failure instead of being dropped.
 */

/**
 * "missing" (first run) and "error" (file there but unreadable) are distinct:
 * callers may only seed-and-persist on "missing", or a transient read failure
 * would overwrite real data with a fresh empty state.
 */
export type LoadResult<T> =
  | { status: "ok"; data: T }
  | { status: "missing" }
  | { status: "error" };

export async function loadJson<T>(file: string): Promise<LoadResult<T>> {
  if (!isTauri()) return { status: "error" };

  let primaryMissing = false;
  try {
    const text = await invoke<string | null>("store_read", { name: file });
    if (text === null) primaryMissing = true;
    else return { status: "ok", data: JSON.parse(text) as T };
  } catch (err) {
    console.error(`Failed to load ${file}, trying backup`, err);
  }

  try {
    const backup = await invoke<string | null>("store_read_backup", { name: file });
    if (backup !== null) return { status: "ok", data: JSON.parse(backup) as T };
  } catch (err) {
    console.error(`Backup of ${file} also unreadable`, err);
    return { status: "error" };
  }
  return primaryMissing ? { status: "missing" } : { status: "error" };
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, string>();
// per-file promise chain: serialises writes so two saves never overlap
const chains = new Map<string, Promise<void>>();

export function saveJsonDebounced(file: string, data: unknown, delay = 700) {
  pending.set(file, JSON.stringify(data, null, 2));
  clearTimeout(timers.get(file));
  timers.set(
    file,
    setTimeout(() => {
      void flushFile(file);
    }, delay),
  );
}

function flushFile(file: string): Promise<void> {
  const contents = pending.get(file);
  if (contents === undefined) return chains.get(file) ?? Promise.resolve();
  pending.delete(file);
  clearTimeout(timers.get(file));
  timers.delete(file);
  const next = (chains.get(file) ?? Promise.resolve()).then(async () => {
    try {
      if (isTauri()) await invoke("store_write", { name: file, contents });
    } catch (err) {
      console.error(`Failed to save ${file}, re-queueing`, err);
      // keep the newest payload around for the next flush attempt
      if (!pending.has(file)) pending.set(file, contents);
    }
  });
  chains.set(file, next);
  return next;
}

/** Immediately write everything pending AND wait for in-flight writes. */
export async function flushAll() {
  const files = new Set([...pending.keys(), ...chains.keys()]);
  await Promise.all([...files].map((file) => flushFile(file)));
}

export const DATA_FILE = "data.json";
export const SETTINGS_FILE = "settings.json";
