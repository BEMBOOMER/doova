import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { flushAll } from "./persistence";
import { isTauri } from "./ids";

/**
 * Moving the data folder, for putting it somewhere that syncs itself.
 *
 * Copy first, switch the pointer last, and never delete the source: an
 * interrupted move then loses nothing, because until that final write the app
 * still reads from where it always did.
 *
 * The restart afterwards is not ceremony. Resolved paths are cached in several
 * places (image URLs, the settings file, in-flight writes) and hunting them all
 * down would be a permanent source of stale-path bugs; starting again is exact.
 */

export async function currentLocation(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>("store_location");
  } catch {
    return null;
  }
}

export async function isDefaultLocation(): Promise<boolean> {
  if (!isTauri()) return true;
  try {
    return await invoke<boolean>("store_is_default");
  } catch {
    return true;
  }
}

/** Returns an error message, or null when the app is about to restart. */
async function moveTo(target: string): Promise<string | null> {
  try {
    // anything still queued belongs in the old folder, before it is copied
    await flushAll();
    await invoke<string>("store_move", { target });
    await relaunch();
    return null;
  } catch (err) {
    console.error("data move failed", err);
    return typeof err === "string" ? err : "Verplaatsen mislukt.";
  }
}

export async function chooseNewLocation(): Promise<string | null> {
  if (!isTauri()) return "Dit werkt alleen in de app.";
  const picked = await open({ directory: true, multiple: false, title: "Kies een map voor je Doova-data" });
  if (typeof picked !== "string") return null;
  return moveTo(picked);
}

export function resetToDefaultLocation(): Promise<string | null> {
  return moveTo("");
}
