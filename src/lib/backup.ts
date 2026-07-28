import { invoke } from "@tauri-apps/api/core";
import { DATA_FILE } from "./persistence";
import { isTauri } from "./ids";

/**
 * Timestamped copies of data.json, kept beside it so they travel with the data
 * when the folder moves. Rust does the copying and the pruning, for the same
 * reason it does the writing: it is the only thing that knows where the folder
 * currently is.
 */

const INTERVAL_MS = 30 * 60 * 1000;

/** Minute resolution: more often than that is not a different state. */
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function makeBackup(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke<boolean>("store_backup", { name: DATA_FILE, stamp: stamp() });
  } catch (err) {
    console.error("backup failed", err);
  }
}

/** Backup file names, newest first. */
export async function listBackups(): Promise<string[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<string[]>("store_list_backups");
  } catch {
    return [];
  }
}

/** Restores a backup over data.json (validates JSON first). Reload after. */
export async function restoreBackup(name: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const raw = await invoke<string | null>("store_read", { name: `backups/${name}` });
    if (raw === null) return false;
    JSON.parse(raw); // must be valid before it replaces anything
    await invoke("store_write", { name: DATA_FILE, contents: raw });
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
