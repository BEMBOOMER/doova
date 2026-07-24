/**
 * Bindings are stored as normalised strings like "mod+shift+k", where "mod" is
 * Cmd on macOS. An empty binding means the action has no shortcut.
 */
export function bindingFromEvent(e: KeyboardEvent | React.KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (!["Meta", "Control", "Alt", "Shift"].includes(key)) parts.push(key);
  return parts.join("+");
}

/** True when the binding has an actual key, not just modifiers. */
export function isCompleteBinding(binding: string): boolean {
  const last = binding.split("+").pop() ?? "";
  return last.length > 0 && !["mod", "alt", "shift"].includes(last);
}

export function matches(binding: string, e: KeyboardEvent): boolean {
  return binding !== "" && bindingFromEvent(e) === binding;
}

const SYMBOLS: Record<string, string> = {
  mod: "⌘",
  alt: "⌥",
  shift: "⇧",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Enter: "⏎",
  Escape: "esc",
  " ": "space",
};

export function formatBinding(binding: string): string {
  if (!binding) return "—";
  return binding
    .split("+")
    .map((p) => SYMBOLS[p] ?? (p.length === 1 ? p.toUpperCase() : p))
    .join("");
}

/** Ignore shortcuts fired while the user is typing, except pure mod combos. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable === true ||
    !!el.closest?.(".ProseMirror")
  );
}
