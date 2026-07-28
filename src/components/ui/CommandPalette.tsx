import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectsStore } from "../../stores/projectsStore";
import { useUiStore } from "../../stores/uiStore";
import { runExportDigest, runExportFull } from "../../lib/exportActions";
import { searchBlocks, type SearchHit } from "../../lib/search";
import { TEMPLATES } from "../../lib/templates";

interface Command {
  id: string;
  label: string;
  hint?: string;
  /** shown under the label, with the matched part marked */
  snippet?: SearchHit["snippet"];
  match?: SearchHit["match"];
  run: () => void;
}

/** Splits a snippet around the match so the middle can be marked. */
function Snippet({ text, match }: { text: string; match: SearchHit["match"] }) {
  if (!match) return <>{text}</>;
  return (
    <>
      {text.slice(0, match.start)}
      <mark className="bg-transparent font-semibold text-inherit underline decoration-1 underline-offset-2">
        {text.slice(match.start, match.end)}
      </mark>
      {text.slice(match.end)}
    </>
  );
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setActiveView, setSelectedBlockId, setRevealBlockId } =
    useUiStore();
  const { tabs, activeTabId, setActiveTab, addBlock, addCalendarBlock, addTab, addBlocks, undo, redo } =
    useProjectsStore();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [paletteOpen]);

  const commands = useMemo<Command[]>(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const close = () => setPaletteOpen(false);
    const base: Command[] = [
      {
        id: "new-block",
        label: "Nieuw blok",
        hint: "leeg blok op het canvas",
        run: () => { addBlock(); setActiveView("canvas"); close(); },
      },
      {
        id: "new-calendar",
        label: "Agenda-blok toevoegen",
        run: () => { addCalendarBlock(); setActiveView("canvas"); close(); },
      },
      { id: "new-project", label: "Nieuw project", run: () => { addTab(); setActiveView("canvas"); close(); } },
      ...TEMPLATES.map((template) => ({
        id: `template-${template.id}`,
        label: `Sjabloon: ${template.name}`,
        hint: template.hint,
        run: () => { addBlocks(template.build()); setActiveView("canvas"); close(); },
      })),
      ...(activeTab
        ? [
            {
              id: "export-full",
              label: `Exporteer "${activeTab.name}" als Markdown`,
              run: () => { void runExportFull(activeTab); close(); },
            },
            {
              id: "export-digest",
              label: `Exporteer digest van "${activeTab.name}"`,
              hint: "open taken + deadlines",
              run: () => { void runExportDigest(activeTab); close(); },
            },
          ]
        : []),
      { id: "undo", label: "Ongedaan maken", run: () => { undo(); close(); } },
      { id: "redo", label: "Opnieuw", run: () => { redo(); close(); } },
      { id: "settings", label: "Instellingen openen", run: () => { setActiveView("settings"); close(); } },
      ...tabs
        .filter((t) => t.id !== activeTabId)
        .map((t) => ({
          id: `switch-${t.id}`,
          label: `Ga naar project "${t.name}"`,
          run: () => { setActiveTab(t.id); setActiveView("canvas"); close(); },
        })),
    ];

    const q = query.trim().toLowerCase();
    if (!q) return base;

    const hits: Command[] = searchBlocks(tabs, query).map((hit) => ({
      id: `hit-${hit.block.id}`,
      label: hit.block.title,
      hint: `in ${hit.tab.name}`,
      snippet: hit.snippet,
      match: hit.match,
      run: () => {
        setActiveTab(hit.tab.id);
        setActiveView("canvas");
        setSelectedBlockId(hit.block.id);
        // the canvas scrolls to it once that project has actually rendered
        setRevealBlockId(hit.block.id);
        setPaletteOpen(false);
      },
    }));

    return [...hits, ...base.filter((c) => c.label.toLowerCase().includes(q))];
  }, [tabs, activeTabId, query, addBlock, addBlocks, addCalendarBlock, addTab, undo, redo, setActiveTab, setActiveView, setPaletteOpen, setSelectedBlockId, setRevealBlockId]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, commands.length - 1)));
  }, [commands.length]);

  if (!paletteOpen) return null;

  return (
    <div
      className="absolute inset-0 z-[60] flex items-start justify-center bg-black/20 pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setPaletteOpen(false);
      }}
    >
      <div className="panel pop-in w-[480px] max-w-[90vw] overflow-hidden p-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPaletteOpen(false);
            if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, commands.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
            if (e.key === "Enter") commands[index]?.run();
          }}
          placeholder="Zoek of typ een actie…"
          className="mb-1.5 w-full rounded-themed-sm bg-surface-raised px-3 py-2 text-[13.5px] outline-none placeholder:text-ink-soft"
        />
        <div className="max-h-72 overflow-y-auto">
          {commands.length === 0 && (
            <p className="px-3 py-2 text-[12.5px] text-ink-soft">Niets gevonden</p>
          )}
          {commands.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={cmd.run}
              onMouseEnter={() => setIndex(i)}
              className={`flex w-full items-baseline justify-between gap-3 rounded-themed-sm px-3 py-1.5 text-left text-[13px] ${
                i === index ? "bg-accent text-accent-ink" : "text-ink"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{cmd.label}</span>
                {cmd.snippet && (
                  <span className="block truncate text-[11px] opacity-70">
                    <Snippet text={cmd.snippet} match={cmd.match ?? null} />
                  </span>
                )}
              </span>
              {cmd.hint && <span className="shrink-0 text-[11px] opacity-70">{cmd.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
