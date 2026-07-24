import {
  BaseDirectory,
  copyFile,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { DATA_FILE } from "./persistence";

const DIR = { baseDir: BaseDirectory.AppData };
const BACKUP_DIR = "backups";
const KEEP = 20;
const INTERVAL_MS = 30 * 60 * 1000;

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function makeBackup(): Promise<void> {
  try {
    if (!(await exists(DATA_FILE, DIR))) return;
    if (!(await exists(BACKUP_DIR, DIR))) await mkdir(BACKUP_DIR, { ...DIR, recursive: true });
    const name = `${BACKUP_DIR}/data-${stamp()}.json`;
    if (await exists(name, DIR)) return; // one per minute is plenty
    await copyFile(DATA_FILE, name, { fromPathBaseDir: DIR.baseDir, toPathBaseDir: DIR.baseDir });
    await prune();
  } catch (err) {
    console.error("backup failed", err);
  }
}

async function prune() {
  const all = await listBackups();
  for (const name of all.slice(KEEP)) {
    await remove(`${BACKUP_DIR}/${name}`, DIR);
  }
}

/** Backup file names, newest first. */
export async function listBackups(): Promise<string[]> {
  try {
    if (!(await exists(BACKUP_DIR, DIR))) return [];
    const entries = await readDir(BACKUP_DIR, DIR);
    return entries
      .filter((e) => e.isFile && e.name.startsWith("data-") && e.name.endsWith(".json"))
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** Restores a backup over data.json (validates JSON first). Reload after. */
export async function restoreBackup(name: string): Promise<boolean> {
  try {
    const raw = await readTextFile(`${BACKUP_DIR}/${name}`, DIR);
    JSON.parse(raw); // must be valid
    await writeTextFile(DATA_FILE, raw, DIR);
    return true;
  } catch (err) {
    console.error("restore failed", err);
    return false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Backup on start and every 30 minutes. */
export function startBackupSchedule() {
  if (timer) return;
  void makeBackup();
  timer = setInterval(() => void makeBackup(), INTERVAL_MS);
}
