import { invoke } from "@tauri-apps/api/core";
import { toAccelerator } from "./shortcuts";
import { isTauri } from "./ids";

/**
 * Keeps the system-wide capture hotkey in step with the setting.
 *
 * This one shortcut is not handled by the app's keydown chain: macOS owns it, so
 * it keeps working while Doova is in the background, and it has to be handed to
 * Rust every time it changes. macOS accepts a registration that another app
 * already holds without complaining, so a silent hotkey cannot be detected here
 * and the settings screen says so instead.
 */
export async function syncCaptureHotkey(binding: string): Promise<string | null> {
  if (!isTauri()) return null;
  const accelerator = toAccelerator(binding);
  if (!accelerator) {
    return "Een systeembrede sneltoets heeft minstens ⌘, ⌥ of ⇧ nodig.";
  }
  try {
    await invoke("set_capture_hotkey", { accelerator });
    return null;
  } catch (err) {
    console.error("quick capture hotkey failed", err);
    return typeof err === "string" ? err : "Deze toetscombinatie werd niet geaccepteerd.";
  }
}
