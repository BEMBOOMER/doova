import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { useProjectsStore } from "./stores/projectsStore";
import { useSettingsStore } from "./stores/settingsStore";

if (import.meta.env.DEV) {
  // dev-only handle for poking at state from the console
  Object.assign(window, { doova: { projects: useProjectsStore, settings: useSettingsStore } });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
