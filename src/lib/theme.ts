import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import type { AccentColor, ColorScheme, SettingsData, ThemeName } from "../types";
import { isTauri } from "./ids";

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

export function resolveScheme(scheme: ColorScheme): "light" | "dark" {
  if (scheme !== "auto") return scheme;
  return darkQuery().matches ? "dark" : "light";
}

/**
 * Applies theme, light/dark and accent to the DOM, and matches the macOS
 * window appearance so the vibrancy behind the glass is the same shade.
 */
export async function applyTheme(theme: ThemeName, accent: AccentColor, scheme: ColorScheme) {
  const root = document.documentElement;
  const resolved = resolveScheme(scheme);
  root.dataset.theme = theme;
  root.dataset.accent = accent;
  root.dataset.scheme = resolved;
  // opaque fallback when there's no macOS vibrancy behind the webview
  root.classList.toggle("no-vibrancy", !isTauri());

  if (!isTauri()) return;
  try {
    const win = getCurrentWindow();
    // vibrancy takes its shade from the window appearance, so force it to
    // match the chosen scheme instead of whatever macOS is set to
    await win.setTheme(theme === "glass" ? resolved : null);
    if (theme === "glass") {
      await win.setEffects({ effects: [Effect.Sidebar] });
    } else {
      await win.clearEffects();
    }
  } catch (err) {
    console.warn("theme apply failed", err);
  }
}

/** Re-applies on macOS appearance changes while the setting is "auto". */
export function watchSystemScheme(onChange: () => void): () => void {
  const mq = darkQuery();
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Root classes for display settings that pure CSS handles. */
export function applyUiClasses(s: Pick<SettingsData, "reduceTransparency" | "compactMode">) {
  const root = document.documentElement;
  root.classList.toggle("reduce-transparency", s.reduceTransparency);
  root.classList.toggle("compact", s.compactMode);
}
