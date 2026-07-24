import { useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { appDataDir } from "@tauri-apps/api/path";
import { useSettingsStore } from "../../stores/settingsStore";
import { useProjectsStore } from "../../stores/projectsStore";
import { useUiStore } from "../../stores/uiStore";
import { ACCENT_COLORS, type ThemeName } from "../../types";
import { listBackups, makeBackup, restoreBackup } from "../../lib/backup";
import { runExportDigest, runExportFull } from "../../lib/exportActions";
import { isTauri } from "../../lib/ids";

const THEMES: { id: ThemeName; label: string; hint: string }[] = [
  { id: "glass", label: "Glass", hint: "Licht, doorschijnend, Apple-stijl" },
  { id: "bemboe", label: "bemboe", hint: "Neo-brutalism: dikke randen, harde schaduwen" },
];

function ThemePreview({ id }: { id: ThemeName }) {
  return (
    <div
      className="pointer-events-none h-16 w-full overflow-hidden rounded-lg p-2"
      style={id === "glass" ? { background: "linear-gradient(135deg, #dbeafe, #ede9fe)" } : { background: "#F5F0E8" }}
    >
      <div
        className="h-full w-2/3"
        style={
          id === "glass"
            ? { background: "rgba(255,255,255,0.5)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.7)", boxShadow: "0 3px 10px rgba(0,0,0,0.08)" }
            : { background: "#fff", borderRadius: 7, border: "2.5px solid #1A1A1A", boxShadow: "3px 3px 0 #1A1A1A" }
        }
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-4">
      <h3 className="heading mb-3 text-[13px]">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span>
        <span className="block text-[13px] text-ink">{label}</span>
        {hint && <span className="block text-[11px] text-ink-soft">{hint}</span>}
      </span>
      <button
        onClick={() => onChange(!value)}
        className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
        style={{ background: value ? "var(--color-accent)" : "color-mix(in srgb, var(--ink) 20%, transparent)" }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
          style={{ left: value ? 18 : 2 }}
        />
      </button>
    </label>
  );
}

const SHORTCUTS: [string, string][] = [
  ["⌘K", "Command-palette: zoeken & acties"],
  ["Dubbelklik canvas", "Nieuw blok op die plek"],
  ["Dubbelklik titel", "Blok of project hernoemen"],
  ["Sleep header", "Blok verplaatsen (snapt met snapping aan)"],
  ["Sleep rand/hoek", "Blok vergroten/verkleinen (blok eerst selecteren)"],
  ["- of [] aan regelbegin", "Checklist-item in een notitie"],
];

export function SettingsView() {
  const settings = useSettingsStore();
  const { tabs, activeTabId } = useProjectsStore();
  const showToast = useUiStore((s) => s.showToast);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const [backups, setBackups] = useState<string[]>([]);

  const refreshBackups = () => void listBackups().then(setBackups);
  useEffect(refreshBackups, []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <h2 className="heading mb-4 text-lg">Instellingen</h2>
      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <Section title="Weergave">
          <div className="mb-3 grid grid-cols-2 gap-2.5">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => settings.update({ theme: t.id })}
                className="rounded-themed-sm p-1.5 text-left"
                style={{ outline: settings.theme === t.id ? "2.5px solid var(--color-accent)" : "2.5px solid transparent", outlineOffset: 2 }}
              >
                <ThemePreview id={t.id} />
                <p className="heading mt-1.5 text-[13px]">{t.label}</p>
                <p className="text-[11px] leading-tight text-ink-soft">{t.hint}</p>
              </button>
            ))}
          </div>
          <p className="mb-1.5 text-[12px] font-semibold text-ink-soft">Accentkleur</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {ACCENT_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => settings.update({ accentColor: c.id })}
                className="h-7 w-7 rounded-full transition-transform hover:scale-110"
                style={{ background: c.hex, outline: settings.accentColor === c.id ? "2.5px solid var(--ink)" : "none", outlineOffset: 2 }}
                title={c.label}
              />
            ))}
          </div>
          <Toggle
            label="Verminder transparantie"
            hint="Opaak glas, maximaal leesbaar"
            value={settings.reduceTransparency}
            onChange={(v) => settings.update({ reduceTransparency: v })}
          />
          <Toggle
            label="Compacte modus"
            hint="Kleinere paddings en tekst"
            value={settings.compactMode}
            onChange={(v) => settings.update({ compactMode: v })}
          />
        </Section>

        <Section title="Canvas">
          <Toggle
            label="Magnetisch snappen"
            hint="Blokken klikken vast als ze dicht bij elkaar of een rand komen"
            value={settings.snapEnabled}
            onChange={(v) => settings.update({ snapEnabled: v })}
          />
          <label className="mt-2 block">
            <span className="text-[13px] text-ink">Snap-gevoeligheid: {settings.gridSize}px</span>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={settings.gridSize}
              onChange={(e) => settings.update({ gridSize: Number(e.target.value) })}
              className="mt-1 w-full accent-[var(--color-accent)]"
            />
          </label>
        </Section>

        <Section title="Data">
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => activeTab && void runExportFull(activeTab)}
              disabled={!activeTab}
              className="rounded-themed-sm bg-surface-raised px-3 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink disabled:opacity-40"
            >
              ⬇ Exporteer actief project als Markdown
            </button>
            <button
              onClick={() => activeTab && void runExportDigest(activeTab)}
              disabled={!activeTab}
              className="rounded-themed-sm bg-surface-raised px-3 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink disabled:opacity-40"
            >
              ⬇ Exporteer digest (open taken + deadlines)
            </button>
            {isTauri() && (
              <button
                onClick={() => void appDataDir().then((p) => openPath(p))}
                className="rounded-themed-sm bg-surface-raised px-3 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
              >
                📂 Open data-map
              </button>
            )}
            <button
              onClick={() => void makeBackup().then(() => { refreshBackups(); showToast("Backup gemaakt"); })}
              className="rounded-themed-sm bg-surface-raised px-3 py-1.5 text-left text-[12.5px] hover:bg-accent hover:text-accent-ink"
            >
              ⛃ Maak nu een backup
            </button>
          </div>
          <p className="mb-1 mt-3 text-[12px] font-semibold text-ink-soft">
            Backups (automatisch elke 30 min, max 20)
          </p>
          <div className="max-h-32 overflow-y-auto">
            {backups.length === 0 && <p className="text-[12px] text-ink-soft">Nog geen backups</p>}
            {backups.map((name) => (
              <div key={name} className="group flex items-center justify-between rounded-themed-sm px-2 py-1 hover:bg-surface-raised">
                <span className="text-[11.5px] text-ink">{name.replace("data-", "").replace(".json", "")}</span>
                <button
                  onClick={() => {
                    void restoreBackup(name).then((ok) => {
                      if (ok) window.location.reload();
                      else showToast("Terugzetten mislukt");
                    });
                  }}
                  className="hidden text-[11px] text-ink-soft hover:text-ink group-hover:block"
                >
                  Terugzetten
                </button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Sneltoetsen">
          <div className="space-y-1">
            {SHORTCUTS.map(([key, desc]) => (
              <div key={key} className="flex items-baseline gap-2 text-[12.5px]">
                <span className="heading shrink-0 rounded bg-surface-raised px-1.5 py-0.5 text-[11px]">{key}</span>
                <span className="text-ink-soft">{desc}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-border-themed/30 pt-2 text-[11.5px] text-ink-soft">
            Doova v0.2 · gemaakt door Roelof (bemboe) · data blijft lokaal op je Mac
          </p>
        </Section>
      </div>
    </div>
  );
}
