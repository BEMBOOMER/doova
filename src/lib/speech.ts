import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "./ids";

/**
 * Thin wrapper around the Rust dictation commands. Everything the UI knows about
 * speech goes through here, so swapping the engine later stays a one-file job.
 */

export type PermissionState = "granted" | "denied" | "restricted" | "undetermined";

export interface SpeechPermissions {
  speech: PermissionState;
  microphone: PermissionState;
}

export type SpeechErrorKind =
  | "permission-speech"
  | "permission-microphone"
  | "locale-unavailable"
  | "on-device-unavailable"
  | "audio"
  | "recognition";

export type SpeechState = "listening" | "stopping" | "idle";

export interface SpeechHandlers {
  onState?: (state: SpeechState) => void;
  /** Current segment while it is still being revised. */
  onPartial?: (text: string) => void;
  /** Current segment, settled. Later segments arrive as further calls. */
  onFinal?: (text: string) => void;
  onError?: (kind: SpeechErrorKind, message: string) => void;
}

/** Dictation is macOS-native, so it simply does not exist in browser dev mode. */
export const speechAvailable = () => isTauri();

export function getPermissions(): Promise<SpeechPermissions> {
  return invoke<SpeechPermissions>("speech_permissions");
}

/** Triggers the two macOS prompts. Resolves once the user has answered both. */
export function requestPermissions(): Promise<SpeechPermissions> {
  return invoke<SpeechPermissions>("speech_request_permissions");
}

/** Subset of `locales` this Mac can transcribe without a network connection. */
export function supportedLocales(locales: string[]): Promise<string[]> {
  return invoke<string[]>("speech_supported_locales", { locales });
}

export function startDictation(locale: string): Promise<void> {
  return invoke("speech_start", { locale });
}

export function stopDictation(): Promise<void> {
  return invoke("speech_stop");
}

export async function listenToSpeech(handlers: SpeechHandlers): Promise<UnlistenFn> {
  const unlisteners = await Promise.all([
    listen<{ state: SpeechState }>("speech://state", (e) => handlers.onState?.(e.payload.state)),
    listen<{ text: string }>("speech://partial", (e) => handlers.onPartial?.(e.payload.text)),
    listen<{ text: string }>("speech://final", (e) => handlers.onFinal?.(e.payload.text)),
    listen<{ kind: SpeechErrorKind; message: string }>("speech://error", (e) =>
      handlers.onError?.(e.payload.kind, e.payload.message),
    ),
  ]);
  return () => unlisteners.forEach((off) => off());
}

const PRIVACY_PANES = {
  microphone: "Privacy_Microphone",
  speech: "Privacy_SpeechRecognition",
} as const;

/** Opens the exact Systeeminstellingen pane, since digging for it is a chore. */
export function openPrivacySettings(pane: keyof typeof PRIVACY_PANES): Promise<void> {
  return openUrl(`x-apple.systempreferences:com.apple.preference.security?${PRIVACY_PANES[pane]}`);
}
