import { useState } from "react";
import type { ChecklistLabel } from "../../../types";
import { ACCENT_COLORS } from "../../../types";

export function LabelPicker({
  label,
  onChange,
}: {
  label: ChecklistLabel | null;
  onChange: (label: ChecklistLabel | null) => void;
}) {
  const [text, setText] = useState(label?.text ?? "");
  const [color, setColor] = useState(label?.color ?? ACCENT_COLORS[0].hex);

  const apply = (nextText: string, nextColor: string) => {
    const trimmed = nextText.trim();
    onChange(trimmed ? { text: trimmed, color: nextColor } : null);
  };

  return (
    <div>
      <p className="mb-0.5 text-[11px] text-ink-soft">Label</p>
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); apply(e.target.value, color); }}
        placeholder="Bijv. urgent, wachten…"
        className="mb-1 w-full rounded-themed-sm bg-surface-raised px-1.5 py-1 text-[12px] text-ink outline-none placeholder:text-ink-soft"
      />
      <div className="flex flex-wrap gap-1">
        {ACCENT_COLORS.map((c) => (
          <button
            key={c.id}
            onClick={() => { setColor(c.hex); apply(text, c.hex); }}
            className="h-5 w-5 rounded-full transition-transform hover:scale-110"
            style={{
              background: c.hex,
              outline: color === c.hex ? "2px solid var(--ink)" : "none",
              outlineOffset: 1,
            }}
            title={c.label}
          />
        ))}
      </div>
    </div>
  );
}
