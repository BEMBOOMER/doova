import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import type { AccentColor, ThemeName } from "../types";
import { isTauri } from "./ids";

/**
 * Applies theme + accent to the DOM and toggles macOS vibrancy:
 * glass = sidebar material behind a transparent webview, bemboe = flat opaque.
 */
export async function applyTheme(theme: ThemeName, accent: AccentColor) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.accent = accent;
  // opaque fallback when there's no macOS vibrancy behind the webview
  root.classList.toggle("no-vibrancy", !isTauri());

  if (!isTauri()) return;
  try {
    const win = getCurrentWindow();
    if (theme === "glass") {
      await win.setEffects({ effects: [Effect.Sidebar] });
    } else {
      await win.clearEffects();
    }
  } catch (err) {
    // window effects unavailable (e.g. dev in plain browser); DOM theme still applies
    console.warn("setEffects failed", err);
  }
}
