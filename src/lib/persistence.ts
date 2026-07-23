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

export async function loadJson<T>(file: string): Promise<T | null> {
  try {
    if (!(await exists(file, DIR))) return null;
    return JSON.parse(await readTextFile(file, DIR)) as T;
  } catch (err) {
    console.error(`Failed to load ${file}, trying backup`, err);
    try {
      if (await exists(`${file}.bak`, DIR)) {
        return JSON.parse(await readTextFile(`${file}.bak`, DIR)) as T;
      }
    } catch (bakErr) {
      console.error(`Backup of ${file} also unreadable`, bakErr);
    }
    return null;
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, string>();

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

async function flushFile(file: string) {
  const contents = pending.get(file);
  if (contents === undefined) return;
  pending.delete(file);
  clearTimeout(timers.get(file));
  timers.delete(file);
  try {
    await writeAtomic(file, contents);
  } catch (err) {
    console.error(`Failed to save ${file}`, err);
  }
}

/** Immediately write everything still pending (used on window close). */
export async function flushAll() {
  await Promise.all([...pending.keys()].map((file) => flushFile(file)));
}

export const DATA_FILE = "data.json";
export const SETTINGS_FILE = "settings.json";
