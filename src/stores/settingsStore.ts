import { create } from "zustand";
import type { SettingsData } from "../types";
import { ACCENT_COLORS, DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, DICTATION_LOCALES } from "../types";
import { SETTINGS_FILE, loadJson, saveJsonDebounced } from "../lib/persistence";
import { applyTheme, applyUiClasses, watchSystemScheme } from "../lib/theme";

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
      typeof saved?.gridSize === "number" && saved.gridSize >= 1 && saved.gridSize <= 32
        ? Math.min(saved.gridSize, 20)
        : DEFAULT_SETTINGS.gridSize,
    compactMode: saved?.compactMode ?? DEFAULT_SETTINGS.compactMode,
    reduceTransparency: saved?.reduceTransparency ?? DEFAULT_SETTINGS.reduceTransparency,
    sidebarCollapsed: saved?.sidebarCollapsed ?? DEFAULT_SETTINGS.sidebarCollapsed,
    colorScheme:
      saved?.colorScheme === "light" || saved?.colorScheme === "dark" || saved?.colorScheme === "auto"
        ? saved.colorScheme
        : DEFAULT_SETTINGS.colorScheme,
    shortcuts: { ...DEFAULT_SHORTCUTS, ...(saved?.shortcuts ?? {}) },
    panButton:
      saved?.panButton === 0 || saved?.panButton === 1 || saved?.panButton === 2
        ? saved.panButton
        : DEFAULT_SETTINGS.panButton,
    dictationLocale: DICTATION_LOCALES.some((l) => l.id === saved?.dictationLocale)
      ? saved!.dictationLocale!
      : DEFAULT_SETTINGS.dictationLocale,
  };
}

function pickData(s: SettingsState): SettingsData {
  const { theme, colorScheme, accentColor, snapEnabled, gridSize, compactMode, reduceTransparency, sidebarCollapsed, panButton, shortcuts, dictationLocale } = s;
  return { theme, colorScheme, accentColor, snapEnabled, gridSize, compactMode, reduceTransparency, sidebarCollapsed, panButton, shortcuts, dictationLocale };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    const result = await loadJson<SettingsData>(SETTINGS_FILE);
    const settings = sanitize(result.status === "ok" ? result.data : null);
    set({ ...settings, loaded: true });
    void applyTheme(settings.theme, settings.accentColor, settings.colorScheme);
    applyUiClasses(settings);
    // follow macOS appearance while the setting is on "auto"
    watchSystemScheme(() => {
      const s = get();
      if (s.colorScheme === "auto") void applyTheme(s.theme, s.accentColor, "auto");
    });
  },

  update: (patch) => {
    set(patch);
    const next = pickData(get());
    if (
      patch.theme !== undefined ||
      patch.accentColor !== undefined ||
      patch.colorScheme !== undefined
    ) {
      void applyTheme(next.theme, next.accentColor, next.colorScheme);
    }
    applyUiClasses(next);
    saveJsonDebounced(SETTINGS_FILE, next);
  },
}));
