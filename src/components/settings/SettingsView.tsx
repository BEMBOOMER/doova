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
  { id: "glass", label: "Glass", hint: "Doorschijnend glas dat je bureaublad laat doorschemeren" },
  { id: "bemboe", label: "bemboe", hint: "Jouw huisstijl: dikke randen, harde schaduwen, papier" },
];

const CATEGORIES = [
  { id: "weergave", icon: "◐", label: "Weergave", hint: "Thema, kleur, leesbaarheid" },
  { id: "canvas", icon: "⌗", label: "Canvas", hint: "Snappen en blokken" },
  { id: "data", icon: "⛃", label: "Data", hint: "Export, backups, opslag" },
  { id: "sneltoetsen", icon: "⌘", label: "Sneltoetsen", hint: "Alle shortcuts" },
  { id: "over", icon: "☺", label: "Over Doova", hint: "Versie en info" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

function ThemePreview({ id }: { id: ThemeName }) {
  return (
    <div
      className="pointer-events-none h-14 w-full overflow-hidden rounded-lg p-2"
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

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-themed/25 py-2.5 last:border-0">
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {hint && <span className="block text-[11.5px] leading-snug text-ink-soft">{hint}</span>}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
      style={{ background: value ? "var(--color-accent)" : "color-mix(in srgb, var(--ink) 20%, transparent)" }}
    >
      <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" style={{ left: value ? 18 : 2 }} />
    </button>
  );
}

function ActionButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-themed-sm bg-surface-raised px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

const SHORTCUTS: [string, string][] = [
  ["⌘K", "Command-palette: zoeken door alles en snelle acties"],
  ["Dubbelklik canvas", "Nieuw blok op die plek"],
  ["Rechtsklik canvas", "Menu: nieuw blok of agenda-blok hier"],
  ["Rechtsklik blok", "Menu: hernoemen, dupliceren, koppelen, kleur, verwijderen"],
  ["Rechtsklik zijbalk", "Menu: nieuw project"],
  ["Dubbelklik naam", "Blok, groep of project hernoemen"],
  ["Sleep naam/header", "Blok verplaatsen (snapt bij randen)"],
  ["Sleep rand of hoek", "Blok vergroten of verkleinen (selecteer het blok eerst)"],
  ["Sleep project op project", "Beide in één map zetten"],
  ["Sleep bestand op blok", "Leeg blok wordt een bestandenblok"],
  ["- of [] aan regelbegin", "Checklist-item in een notitie"],
];

export function SettingsView() {
  const settings = useSettingsStore();
  const { tabs, activeTabId } = useProjectsStore();
  const showToast = useUiStore((s) => s.showToast);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const [backups, setBackups] = useState<string[]>([]);
  const [category, setCategory] = useState<CategoryId>("weergave");

  const refreshBackups = () => void listBackups().then(setBackups);
  useEffect(refreshBackups, []);

  return (
    <div className="flex min-h-0 flex-1">
      {/* category rail */}
      <nav className="w-52 shrink-0 overflow-y-auto border-r border-border-themed/30 p-3">
        <h2 className="heading mb-2 px-1 text-[12px] uppercase tracking-wide text-ink-soft">Instellingen</h2>
        <div className="space-y-0.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`flex w-full items-start gap-2.5 rounded-themed-sm px-2.5 py-2 text-left transition-colors ${
                category === c.id ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-raised"
              }`}
            >
              <span className="mt-px text-[13px] leading-none">{c.icon}</span>
              <span className="min-w-0">
                <span className="heading block text-[12.5px] leading-tight">{c.label}</span>
                <span className="block text-[11px] leading-snug opacity-70">{c.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </nav>

      {/* panel */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-xl">
          {category === "weergave" && (
            <>
              <h3 className="heading mb-3 text-[15px]">Weergave</h3>
              <div className="mb-4 grid grid-cols-2 gap-2.5">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => settings.update({ theme: t.id })}
                    className="rounded-themed-sm p-1.5 text-left"
                    style={{ outline: settings.theme === t.id ? "2.5px solid var(--color-accent)" : "2.5px solid transparent", outlineOffset: 2 }}
                  >
                    <ThemePreview id={t.id} />
                    <p className="heading mt-1.5 text-[13px]">{t.label}</p>
                    <p className="text-[11px] leading-snug text-ink-soft">{t.hint}</p>
                  </button>
                ))}
              </div>
              <Row label="Accentkleur" hint="Gebruikt voor knoppen, actieve items en labels">
                <div className="flex max-w-[190px] flex-wrap justify-end gap-1.5">
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => settings.update({ accentColor: c.id })}
                      className="h-6 w-6 rounded-full transition-transform hover:scale-110"
                      style={{ background: c.hex, outline: settings.accentColor === c.id ? "2.5px solid var(--ink)" : "none", outlineOffset: 2 }}
                      title={c.label}
                    />
                  ))}
                </div>
              </Row>
              <Row
                label="Verminder transparantie"
                hint="Maakt het glas ondoorzichtig. Handig bij een drukke achtergrond of als tekst lastig leest."
              >
                <Switch value={settings.reduceTransparency} onChange={(v) => settings.update({ reduceTransparency: v })} />
              </Row>
              <Row label="Compacte modus" hint="Kleinere paddings en tekst, zodat er meer op je scherm past">
                <Switch value={settings.compactMode} onChange={(v) => settings.update({ compactMode: v })} />
              </Row>
            </>
          )}

          {category === "canvas" && (
            <>
              <h3 className="heading mb-3 text-[15px]">Canvas</h3>
              <Row
                label="Magnetisch snappen"
                hint="Blokken klikken vast als je ze vlak langs een ander blok of een rand sleept, zoals vensters op macOS. Staat dit uit, dan plaats je volledig vrij."
              >
                <Switch value={settings.snapEnabled} onChange={(v) => settings.update({ snapEnabled: v })} />
              </Row>
              <Row
                label={`Snap-gevoeligheid: ${settings.gridSize}px`}
                hint="Hoe dicht een blok bij een rand moet komen voordat het vastklikt. Lager is preciezer."
              >
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={1}
                  value={settings.gridSize}
                  onChange={(e) => settings.update({ gridSize: Number(e.target.value) })}
                  className="w-32 accent-[var(--color-accent)]"
                />
              </Row>
              <p className="mt-4 rounded-themed-sm bg-surface-raised p-3 text-[12px] leading-relaxed text-ink-soft">
                Blokken passen zich aan wat je erin doet: typ tekst en het wordt een notitie, sleep
                een bestand erin en het wordt een bestandenblok. Via het ⋯-menu koppel je blokken
                aan elkaar tot een groep die je in- en uitklapt.
              </p>
            </>
          )}

          {category === "data" && (
            <>
              <h3 className="heading mb-3 text-[15px]">Data</h3>
              <div className="mb-4 flex flex-col gap-1.5">
                <ActionButton onClick={() => activeTab && void runExportFull(activeTab)} disabled={!activeTab}>
                  ⬇ Exporteer actief project als Markdown
                </ActionButton>
                <ActionButton onClick={() => activeTab && void runExportDigest(activeTab)} disabled={!activeTab}>
                  ⬇ Exporteer digest (open taken + deadlines)
                </ActionButton>
                {isTauri() && (
                  <ActionButton onClick={() => void appDataDir().then((p) => openPath(p))}>
                    📂 Open data-map in Finder
                  </ActionButton>
                )}
                <ActionButton
                  onClick={() => void makeBackup().then(() => { refreshBackups(); showToast("Backup gemaakt"); })}
                >
                  ⛃ Maak nu een backup
                </ActionButton>
              </div>
              <p className="mb-1.5 text-[12px] font-semibold text-ink-soft">
                Backups · automatisch elke 30 minuten, maximaal 20 bewaard
              </p>
              <div className="max-h-48 overflow-y-auto rounded-themed-sm bg-surface-raised/60 p-1">
                {backups.length === 0 && <p className="px-2 py-1 text-[12px] text-ink-soft">Nog geen backups</p>}
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
              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-soft">
                Alles staat lokaal in Application Support als leesbare JSON. Bij elke opslag wordt
                de vorige versie als .bak bewaard, dus je raakt nooit alles in één keer kwijt.
              </p>
            </>
          )}

          {category === "sneltoetsen" && (
            <>
              <h3 className="heading mb-3 text-[15px]">Sneltoetsen & muisacties</h3>
              <div className="space-y-1.5">
                {SHORTCUTS.map(([key, desc]) => (
                  <div key={key} className="flex items-baseline gap-2.5 text-[12.5px]">
                    <span className="heading w-44 shrink-0 rounded bg-surface-raised px-1.5 py-0.5 text-[11px]">{key}</span>
                    <span className="text-ink-soft">{desc}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {category === "over" && (
            <>
              <h3 className="heading mb-3 text-[15px]">Over Doova</h3>
              <p className="mb-2 text-[13px] leading-relaxed text-ink">
                Doova v0.2 — een werkblad voor je projecten: notities, taken, bestanden en agenda
                op één vrij canvas.
              </p>
              <p className="mb-4 text-[12.5px] leading-relaxed text-ink-soft">
                Gemaakt door Roelof (bemboe). Gebouwd met Tauri en React. Je data blijft volledig
                lokaal op je Mac, er gaat niets naar een server.
              </p>
              <div className="rounded-themed-sm bg-surface-raised p-3 text-[12px] leading-relaxed text-ink-soft">
                <p className="mb-1 font-semibold text-ink">Tips</p>
                <p>Dubbelklik ergens op het canvas voor een nieuw blok op die plek.</p>
                <p>Rechtsklik werkt overal: op blokken, op het canvas en in de zijbalk.</p>
                <p>Sleep een project bovenop een ander project om ze in een map te zetten.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
