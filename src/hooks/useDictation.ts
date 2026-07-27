import { useCallback, useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useUiStore } from "../stores/uiStore";
import {
  getPermissions,
  listenToSpeech,
  openPrivacySettings,
  requestPermissions,
  speechAvailable,
  startDictation,
  stopDictation,
  type SpeechErrorKind,
} from "../lib/speech";

export type DictationStatus = "idle" | "preparing" | "listening" | "stopping";

interface Options {
  /** Identifies the caller so a second block cannot hijack a running dictation. */
  ownerId: string;
  locale: string;
  onStart?: () => void;
  /** Everything recognised so far, finalised segments plus the live one. */
  onText?: (text: string) => void;
  onDone?: (text: string) => void;
}

/**
 * Stopping is asynchronous: macOS still owes us one last result after `endAudio`.
 * If it never arrives we close the session anyway so the UI cannot get stuck.
 */
const STOP_GRACE_MS = 6000;

function describe(kind: SpeechErrorKind, message: string): {
  text: string;
  pane?: "microphone" | "speech";
} {
  switch (kind) {
    case "permission-speech":
      return { text: "Doova mag geen spraakherkenning gebruiken.", pane: "speech" };
    case "permission-microphone":
      return { text: "Doova mag de microfoon niet gebruiken.", pane: "microphone" };
    case "on-device-unavailable":
      return {
        text: "Deze taal staat niet offline op je Mac. Zet hem aan via Systeeminstellingen, Toetsenbord, Dictee.",
      };
    default:
      return { text: message };
  }
}

export function useDictation({ ownerId, locale, onStart, onText, onDone }: Options) {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const showToast = useUiStore((s) => s.showToast);
  const setDictatingBlockId = useUiStore((s) => s.setDictatingBlockId);

  const committed = useRef<string[]>([]);
  const partial = useRef("");
  const unlisten = useRef<UnlistenFn | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest callbacks without making start() a new function on every render.
  const callbacks = useRef({ onStart, onText, onDone });
  callbacks.current = { onStart, onText, onDone };

  const compose = () =>
    [...committed.current, partial.current]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");

  const finish = useCallback(() => {
    if (graceTimer.current) clearTimeout(graceTimer.current);
    graceTimer.current = null;
    unlisten.current?.();
    unlisten.current = null;
    setStatus("idle");
    setDictatingBlockId(null);
    callbacks.current.onDone?.(compose());
  }, [setDictatingBlockId]);

  const start = useCallback(async () => {
    if (!speechAvailable() || status !== "idle") return;

    let permissions = await getPermissions();
    if (permissions.speech === "undetermined" || permissions.microphone === "undetermined") {
      permissions = await requestPermissions();
    }
    if (permissions.speech !== "granted") {
      showToast("Doova mag geen spraakherkenning gebruiken.", "Instellingen", () =>
        void openPrivacySettings("speech"),
      );
      return;
    }
    if (permissions.microphone !== "granted") {
      showToast("Doova mag de microfoon niet gebruiken.", "Instellingen", () =>
        void openPrivacySettings("microphone"),
      );
      return;
    }

    committed.current = [];
    partial.current = "";
    setStatus("preparing");
    setDictatingBlockId(ownerId);
    callbacks.current.onStart?.();

    unlisten.current = await listenToSpeech({
      onState: (state) => {
        if (state === "listening") setStatus("listening");
        else if (state === "stopping") setStatus("stopping");
        else finish();
      },
      onPartial: (text) => {
        partial.current = text;
        callbacks.current.onText?.(compose());
      },
      onFinal: (text) => {
        if (text.trim()) committed.current.push(text.trim());
        partial.current = "";
        callbacks.current.onText?.(compose());
      },
      onError: (kind, message) => {
        const { text, pane } = describe(kind, message);
        showToast(text, pane ? "Instellingen" : undefined, pane ? () => void openPrivacySettings(pane) : undefined);
        finish();
      },
    });

    await startDictation(locale);
  }, [finish, locale, ownerId, setDictatingBlockId, showToast, status]);

  const stop = useCallback(async () => {
    if (status === "idle") return;
    setStatus("stopping");
    await stopDictation();
    graceTimer.current = setTimeout(finish, STOP_GRACE_MS);
  }, [finish, status]);

  const listening = status === "listening" || status === "preparing";

  // A block that disappears mid-dictation must not leave the microphone open.
  useEffect(() => {
    return () => {
      if (unlisten.current) {
        void stopDictation();
        unlisten.current();
        unlisten.current = null;
        if (graceTimer.current) clearTimeout(graceTimer.current);
        setDictatingBlockId(null);
      }
    };
  }, [setDictatingBlockId]);

  return { status, listening, busy: status !== "idle", start, stop };
}
