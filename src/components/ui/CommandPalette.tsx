import { useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { useProjectsStore } from "../../stores/projectsStore";
import { useUiStore } from "../../stores/uiStore";
import { runExportDigest, runExportFull } from "../../lib/exportActions";

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join(" ");
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setActiveView, setSelectedBlockId } = useUiStore();
  const { tabs, activeTabId, setActiveTab, addBlock, addCalendarBlock, addTab } =
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

    // block-level search across every project
    const hits: Command[] = [];
    for (const tab of tabs) {
      for (const block of tab.blocks) {
        let haystack = block.title.toLowerCase();
        if (block.type === "note" && block.content) haystack += " " + textOf(block.content).toLowerCase();
        if (block.type === "file-organizer")
          haystack += " " + block.items.map((it) => it.name).join(" ").toLowerCase();
        if (block.type === "note" && block.files?.length)
          haystack += " " + block.files.map((it) => it.name).join(" ").toLowerCase();
        if (block.type === "calendar")
          haystack += " " + block.events.map((ev) => ev.title).join(" ").toLowerCase();
        if (haystack.includes(q)) {
          hits.push({
            id: `hit-${block.id}`,
            label: `${block.title}`,
            hint: `in ${tab.name}`,
            run: () => {
              setActiveTab(tab.id);
              setActiveView("canvas");
              setSelectedBlockId(block.id);
              setPaletteOpen(false);
            },
          });
        }
      }
    }
    return [
      ...hits,
      ...base.filter((c) => c.label.toLowerCase().includes(q)),
    ];
  }, [tabs, activeTabId, query, addBlock, addCalendarBlock, addTab, setActiveTab, setActiveView, setPaletteOpen, setSelectedBlockId]);

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
              <span className="min-w-0 truncate">{cmd.label}</span>
              {cmd.hint && <span className="shrink-0 text-[11px] opacity-70">{cmd.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
