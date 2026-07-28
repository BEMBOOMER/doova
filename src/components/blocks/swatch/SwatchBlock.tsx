import { useEffect, useRef, useState } from "react";
import type { Swatch, SwatchBlockData } from "../../../types";
import { useProjectsStore } from "../../../stores/projectsStore";
import { useUiStore } from "../../../stores/uiStore";
import { copyText } from "../../../lib/clipboard";

/**
 * A row of colours you can click to copy. Small on purpose: a palette next to
 * the work it belongs to, not a colour picker.
 */

/** Accepts #abc, #aabbcc and bare hex, since that is how colours get pasted. */
function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(value)) return null;
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  return `#${full.toLowerCase()}`;
}

/** White text on a dark colour, ink on a light one, so the hex stays readable. */
function readableInk(hex: string): string {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  // perceived brightness, weighted the way the eye sees the channels
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#1a1a1a" : "#ffffff";
}

function Chip({
  swatch,
  onCopy,
  onEdit,
  onRemove,
}: {
  swatch: Swatch;
  onCopy: () => void;
  onEdit: (hex: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(swatch.hex);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const hex = normalizeHex(draft);
    if (hex) onEdit(hex);
    else setDraft(swatch.hex);
    setEditing(false);
  };

  return (
    <div className="group relative">
      <button
        onClick={onCopy}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(swatch.hex);
          setEditing(true);
        }}
        style={{ background: swatch.hex, color: readableInk(swatch.hex) }}
        className="flex h-14 w-full items-end rounded-themed-sm p-1.5 text-left transition-transform hover:scale-[1.03]"
        title={`${swatch.hex}\nKlik om te kopiëren, dubbelklik om te wijzigen`}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent text-[10px] uppercase tracking-wide outline-none"
            style={{ color: "inherit" }}
          />
        ) : (
          <span className="heading text-[10px] uppercase tracking-wide opacity-80">
            {swatch.hex.replace("#", "")}
          </span>
        )}
      </button>
      <button
        onClick={onRemove}
        className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-black/55 text-[9px] text-white group-hover:flex"
        title="Kleur verwijderen"
      >
        ✕
      </button>
    </div>
  );
}

export function SwatchBlock({ block }: { block: SwatchBlockData }) {
  const { addSwatch, updateSwatch, removeSwatch } = useProjectsStore();
  const showToast = useUiStore((s) => s.showToast);

  const copy = async (hex: string) => {
    const ok = await copyText(hex);
    showToast(ok ? `${hex.toUpperCase()} gekopieerd` : "Kopiëren naar het klembord lukte niet");
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
      {block.swatches.map((swatch) => (
        <Chip
          key={swatch.id}
          swatch={swatch}
          onCopy={() => void copy(swatch.hex)}
          onEdit={(hex) => updateSwatch(block.id, swatch.id, { hex })}
          onRemove={() => removeSwatch(block.id, swatch.id)}
        />
      ))}
      <button
        onClick={() => addSwatch(block.id, "#cccccc")}
        className="flex h-14 items-center justify-center rounded-themed-sm border border-dashed border-border-themed/60 text-[15px] text-ink-soft transition-colors hover:border-border-themed hover:text-ink"
        title="Kleur toevoegen"
      >
        +
      </button>
    </div>
  );
}
