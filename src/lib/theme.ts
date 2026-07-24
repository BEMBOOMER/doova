import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import type { AccentColor, SettingsData, ThemeName } from "../types";
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
    console.warn("setEffects failed", err);
  }
}

/** Root classes for display settings that pure CSS handles. */
export function applyUiClasses(s: Pick<SettingsData, "reduceTransparency" | "compactMode">) {
  const root = document.documentElement;
  root.classList.toggle("reduce-transparency", s.reduceTransparency);
  root.classList.toggle("compact", s.compactMode);
}
