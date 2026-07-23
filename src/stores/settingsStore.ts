import { create } from "zustand";
import type { AccentColor, SettingsData, ThemeName } from "../types";
import { DEFAULT_SETTINGS } from "../types";
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
    const saved = await loadJson<SettingsData>(SETTINGS_FILE);
    const settings = { ...DEFAULT_SETTINGS, ...saved };
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
