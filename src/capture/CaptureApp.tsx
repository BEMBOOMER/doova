import { useEffect, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DICTATION_LOCALES, type DictationLocale } from "../types";
import { speechAvailable } from "../lib/speech";
import { isTauri } from "../lib/ids";
import { useDictation } from "../hooks/useDictation";
import { Toasts } from "../components/ui/Toasts";

/**
 * The quick-capture window: one field that is always one keystroke away.
 *
 * It deliberately owns no data. Enter emits the text and the main window is the
 * only thing that ever writes to disk, which keeps the single-writer guarantee
 * that the atomic saves in persistence.ts rely on. It also reads no settings,
 * so this window needs no filesystem access at all; the language toggle is
 * local and resets, which is fine for a box you close again in three seconds.
 */

function MicIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function CaptureApp() {
  const [text, setText] = useState("");
  const [locale, setLocale] = useState<DictationLocale>("nl-NL");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canDictate = speechAvailable();

  // Dictated text replaces what the previous update wrote, so the field keeps a
  // separate memory of what you typed before the microphone opened.
  const typedBefore = useRef("");

  const dictation = useDictation({
    ownerId: "quick-capture",
    locale,
    onStart: () => {
      typedBefore.current = text ? `${text.replace(/\s+$/, "")} ` : "";
    },
    onText: (spoken) => setText(typedBefore.current + spoken),
  });

  const close = () => {
    setText("");
    if (dictation.busy) void dictation.stop();
    if (isTauri()) void getCurrentWindow().hide();
  };

  const save = () => {
    const value = text.trim();
    if (!value) {
      close();
      return;
    }
    if (isTauri()) void emit("quick-capture", { text: value });
    close();
  };

  // The window is only hidden, never destroyed, so every time it comes back the
  // field has to be refocused by hand.
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    if (!isTauri()) return;
    const unlisten = getCurrentWindow().onFocusChanged(({ payload }) => {
      if (payload) focus();
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  return (
    // The window itself is transparent and frameless, so this panel IS the
    // window: without it you would be typing into thin air.
    <div className="h-screen w-screen p-2">
      <div className="panel relative flex h-full w-full flex-col gap-1.5 p-3">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
            // shift+enter keeps the newline, so a captured thought can be a few lines
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
          placeholder="Wat wil je onthouden?"
          spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-transparent text-[14px] leading-snug text-ink outline-none placeholder:text-ink-soft"
        />

        <div className="flex shrink-0 items-center gap-1.5">
          {canDictate && (
            <>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  void (dictation.busy ? dictation.stop() : dictation.start());
                }}
                className={`flex h-6 w-6 items-center justify-center rounded-themed-sm transition-colors ${
                  dictation.busy
                    ? "bg-accent text-accent-ink"
                    : "text-ink-soft hover:text-ink"
                } ${dictation.listening ? "mic-pulse" : ""}`}
                title={dictation.busy ? "Stop met dicteren" : "Inspreken"}
              >
                <MicIcon />
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  const next = DICTATION_LOCALES.find((l) => l.id !== locale);
                  if (next) setLocale(next.id);
                }}
                disabled={dictation.busy}
                className="heading rounded-themed-sm px-1 text-[10px] tracking-wide text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
                title="Wissel de taal waarin je dicteert"
              >
                {DICTATION_LOCALES.find((l) => l.id === locale)?.short}
              </button>
            </>
          )}
          <span className="ml-auto text-[10.5px] text-ink-soft">
            ↵ bewaren · esc sluiten
          </span>
        </div>

        <Toasts />
      </div>
    </div>
  );
}
