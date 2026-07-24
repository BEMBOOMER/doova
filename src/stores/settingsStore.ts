import { create } from "zustand";
import type { SettingsData } from "../types";
import { ACCENT_COLORS, DEFAULT_SETTINGS } from "../types";
import { SETTINGS_FILE, loadJson, saveJsonDebounced } from "../lib/persistence";
import { applyTheme, applyUiClasses } from "../lib/theme";

interface SettingsState extends SettingsData {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<SettingsData>) => void;
}

function sanitize(saved: Partial<SettingsData> | null): SettingsData {
  return {
    theme: saved?.theme === "bemboe" ? "bemboe" : DEFAULT_SETTINGS.theme,
    accentColor: ACCENT_COLORS.some((c) => c.id === saved?.accentColor)
      ? saved!.accentColor!
      : DEFAULT_SETTINGS.accentColor,
    snapEnabled: saved?.snapEnabled ?? DEFAULT_SETTINGS.snapEnabled,
    gridSize:
      typeof saved?.gridSize === "number" && saved.gridSize >= 2 && saved.gridSize <= 32
        ? saved.gridSize
        : DEFAULT_SETTINGS.gridSize,
    compactMode: saved?.compactMode ?? DEFAULT_SETTINGS.compactMode,
    reduceTransparency: saved?.reduceTransparency ?? DEFAULT_SETTINGS.reduceTransparency,
    sidebarCollapsed: saved?.sidebarCollapsed ?? DEFAULT_SETTINGS.sidebarCollapsed,
  };
}

function pickData(s: SettingsState): SettingsData {
  const { theme, accentColor, snapEnabled, gridSize, compactMode, reduceTransparency, sidebarCollapsed } = s;
  return { theme, accentColor, snapEnabled, gridSize, compactMode, reduceTransparency, sidebarCollapsed };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    const result = await loadJson<SettingsData>(SETTINGS_FILE);
    const settings = sanitize(result.status === "ok" ? result.data : null);
    set({ ...settings, loaded: true });
    void applyTheme(settings.theme, settings.accentColor);
    applyUiClasses(settings);
  },

  update: (patch) => {
    set(patch);
    const next = pickData(get());
    if (patch.theme !== undefined || patch.accentColor !== undefined) {
      void applyTheme(next.theme, next.accentColor);
    }
    applyUiClasses(next);
    saveJsonDebounced(SETTINGS_FILE, next);
  },
}));
