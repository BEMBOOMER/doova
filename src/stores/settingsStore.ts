import { create } from "zustand";
import type { AccentColor, SettingsData, ThemeName } from "../types";
import { ACCENT_COLORS, DEFAULT_SETTINGS } from "../types";
import { SETTINGS_FILE, loadJson, saveJsonDebounced } from "../lib/persistence";
import { applyTheme } from "../lib/theme";

interface SettingsState extends SettingsData {
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (theme: ThemeName) => void;
  setAccentColor: (accentColor: AccentColor) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    const result = await loadJson<SettingsData>(SETTINGS_FILE);
    const saved = result.status === "ok" ? result.data : null;
    const settings: SettingsData = {
      theme: saved?.theme === "bemboe" ? "bemboe" : DEFAULT_SETTINGS.theme,
      accentColor: ACCENT_COLORS.some((c) => c.id === saved?.accentColor)
        ? (saved!.accentColor as AccentColor)
        : DEFAULT_SETTINGS.accentColor,
    };
    set({ ...settings, loaded: true });
    void applyTheme(settings.theme, settings.accentColor);
  },

  setTheme: (theme) => {
    set({ theme });
    const { accentColor } = get();
    void applyTheme(theme, accentColor);
    saveJsonDebounced(SETTINGS_FILE, { theme, accentColor });
  },

  setAccentColor: (accentColor) => {
    set({ accentColor });
    const { theme } = get();
    void applyTheme(theme, accentColor);
    saveJsonDebounced(SETTINGS_FILE, { theme, accentColor });
  },
}));
