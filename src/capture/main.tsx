import React from "react";
import ReactDOM from "react-dom/client";
import CaptureApp from "./CaptureApp";
import "../index.css";

/**
 * Entry point for the quick-capture window.
 *
 * Deliberately separate from src/main.tsx: mounting App here would start a
 * second projects store, a second backup schedule and a second exit-flush
 * listener, and two windows racing to write data.json is exactly the thing the
 * atomic saves cannot protect against.
 *
 * It also reads no settings file, so the look is pinned to the default theme
 * and only follows the system's light/dark preference.
 */
const root = document.documentElement;
// Suppresses the full-viewport frost layer: in a frameless window it paints a
// square right through the rounded panel (see index.css).
root.classList.add("capture-window");
root.dataset.theme = "glass";
root.dataset.accent = "lightblue";
root.dataset.scheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CaptureApp />
  </React.StrictMode>,
);
