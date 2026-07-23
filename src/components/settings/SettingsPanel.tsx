import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { ACCENT_COLORS, type ThemeName } from "../../types";

const THEMES: { id: ThemeName; label: string; hint: string }[] = [
  { id: "glass", label: "Glass", hint: "Licht, doorschijnend, Apple-stijl" },
  { id: "bemboe", label: "bemboe", hint: "Neo-brutalism: dikke randen, harde schaduwen" },
];

function ThemePreview({ id }: { id: ThemeName }) {
  return (
    <div
      className="pointer-events-none h-16 w-full overflow-hidden rounded-lg p-2"
      style={
        id === "glass"
          ? { background: "linear-gradient(135deg, #dbeafe, #ede9fe)" }
          : { background: "#F5F0E8" }
      }
    >
      <div
        className="h-full w-2/3"
        style={
          id === "glass"
            ? {
                background: "rgba(255,255,255,0.55)",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.7)",
                boxShadow: "0 3px 10px rgba(0,0,0,0.08)",
              }
            : {
                background: "#fff",
                borderRadius: 7,
                border: "2.5px solid #1A1A1A",
                boxShadow: "3px 3px 0 #1A1A1A",
              }
        }
      />
    </div>
  );
}

export function SettingsPanel() {
  const { theme, accentColor, setTheme, setAccentColor } = useSettingsStore();
  const { settingsOpen, setSettingsOpen } = useUiStore();

  if (!settingsOpen) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setSettingsOpen(false);
      }}
    >
      <div className="panel pop-in w-[420px] max-w-[90vw] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="heading text-[15px]">Instellingen</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-[12px] text-ink-soft hover:text-ink"
          >
            ✕
          </button>
        </div>

        <p className="mb-1.5 text-[12px] font-semibold text-ink-soft">Thema</p>
        <div className="mb-4 grid grid-cols-2 gap-2.5">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="rounded-themed-sm p-1.5 text-left transition-all"
              style={{
                outline: theme === t.id ? "2.5px solid var(--color-accent)" : "2.5px solid transparent",
                outlineOffset: 2,
              }}
            >
              <ThemePreview id={t.id} />
              <p className="heading mt-1.5 text-[13px]">{t.label}</p>
              <p className="text-[11px] leading-tight text-ink-soft">{t.hint}</p>
            </button>
          ))}
        </div>

        <p className="mb-1.5 text-[12px] font-semibold text-ink-soft">Accentkleur</p>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => setAccentColor(c.id)}
              className="h-8 w-8 rounded-full transition-transform hover:scale-110"
              style={{
                background: c.hex,
                outline: accentColor === c.id ? "2.5px solid var(--ink)" : "none",
                outlineOffset: 2,
              }}
              title={c.label}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
