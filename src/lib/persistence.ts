import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
  copyFile,
  rename,
} from "@tauri-apps/plugin-fs";

const DIR = { baseDir: BaseDirectory.AppData };

async function ensureDir() {
  if (!(await exists("", DIR))) {
    await mkdir("", { ...DIR, recursive: true });
  }
}

/**
 * Atomic write: write to <file>.tmp, keep one rolling backup, then rename over
 * the real file so a crash mid-write never leaves a half-written data file.
 */
async function writeAtomic(file: string, contents: string) {
  await ensureDir();
  const tmp = `${file}.tmp`;
  await writeTextFile(tmp, contents, DIR);
  if (await exists(file, DIR)) {
    await copyFile(file, `${file}.bak`, { fromPathBaseDir: DIR.baseDir, toPathBaseDir: DIR.baseDir });
  }
  await rename(tmp, file, { oldPathBaseDir: DIR.baseDir, newPathBaseDir: DIR.baseDir });
}

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
  let primaryMissing = false;
  try {
    if (!(await exists(file, DIR))) {
      primaryMissing = true;
    } else {
      return { status: "ok", data: JSON.parse(await readTextFile(file, DIR)) as T };
    }
  } catch (err) {
    console.error(`Failed to load ${file}, trying backup`, err);
  }
  try {
    if (await exists(`${file}.bak`, DIR)) {
      return { status: "ok", data: JSON.parse(await readTextFile(`${file}.bak`, DIR)) as T };
    }
  } catch (bakErr) {
    console.error(`Backup of ${file} also unreadable`, bakErr);
    return { status: "error" };
  }
  return primaryMissing ? { status: "missing" } : { status: "error" };
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, string>();
// per-file promise chain: serializes writes so two saves never share a .tmp
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
      await writeAtomic(file, contents);
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
