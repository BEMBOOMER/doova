import { nanoid } from "nanoid";

export const newId = () => nanoid(10);
export const nowIso = () => new Date().toISOString();

/** True when running inside the Tauri app (false in a plain browser). */
export const isTauri = () => "__TAURI_INTERNALS__" in window;
