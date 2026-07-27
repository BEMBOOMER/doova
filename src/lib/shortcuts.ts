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

/**
 * Doova's own binding format translated into a Tauri accelerator, for the one
 * shortcut that macOS registers system-wide rather than the webview.
 *
 * Returns null for anything Tauri cannot parse, so a binding that would silently
 * leave you without a working hotkey is refused at the source instead.
 */
const ACCELERATOR_KEYS: Record<string, string> = {
  " ": "Space",
  Enter: "Enter",
  Escape: "Escape",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

export function toAccelerator(binding: string): string | null {
  if (!isCompleteBinding(binding)) return null;
  const parts = binding.split("+");
  const key = parts.pop() ?? "";
  const modifiers = parts.map((p) =>
    p === "mod" ? "CmdOrCtrl" : p === "alt" ? "Alt" : p === "shift" ? "Shift" : "",
  );
  // A system-wide hotkey without modifiers would swallow the key everywhere
  if (modifiers.some((m) => !m) || modifiers.length === 0) return null;

  let accelKey: string | null = null;
  if (ACCELERATOR_KEYS[key]) accelKey = ACCELERATOR_KEYS[key];
  else if (key.length === 1 && /[a-z0-9]/i.test(key)) accelKey = key.toUpperCase();
  else if (/^F\d{1,2}$/.test(key)) accelKey = key;
  if (!accelKey) return null;

  return [...modifiers, accelKey].join("+");
}
