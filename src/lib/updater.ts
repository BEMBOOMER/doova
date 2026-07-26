import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useUiStore } from "../stores/uiStore";
import { flushAll } from "./persistence";
import { isTauri } from "./ids";

/**
 * Updates worden ondertekend met een eigen sleutelpaar (minisign), niet met een
 * Apple-certificaat: de publieke sleutel zit in tauri.conf.json en de app
 * weigert alles wat daar niet bij past. De manifest-URL wijst naar het
 * latest.json van de nieuwste GitHub-release.
 */
let busy = false;
/** true zodra een update is gevonden: dan hoeft er niet meer gekeken te worden */
let found = false;

/**
 * Achtergrondritme: kort na het opstarten, nog een keer als dat mislukte
 * (laptop nog offline, wifi nog niet terug), en daarna elke zes uur voor wie
 * de app dagenlang open laat staan.
 */
export function startUpdateWatch(): () => void {
  if (!isTauri()) return () => {};
  const timers: ReturnType<typeof setTimeout>[] = [];
  timers.push(setTimeout(() => void checkForUpdate({ silent: true }), 4000));
  timers.push(setTimeout(() => void checkForUpdate({ silent: true }), 60_000));
  const interval = setInterval(() => void checkForUpdate({ silent: true }), 6 * 60 * 60 * 1000);
  return () => {
    timers.forEach(clearTimeout);
    clearInterval(interval);
  };
}

export async function checkForUpdate({ silent }: { silent: boolean }): Promise<void> {
  if (!isTauri() || busy) return;
  if (found && silent) return; // de melding staat al op het scherm
  const { showToast } = useUiStore.getState();
  busy = true;
  try {
    const update = await check();
    if (!update) {
      if (!silent) showToast("Je hebt de nieuwste versie");
      return;
    }
    found = true;
    // blijft staan: een update die na vijf tellen weer weg is, mis je gewoon
    showToast(
      `Doova ${update.version} is beschikbaar`,
      "Installeren",
      () => void install(update),
      { persist: true },
    );
  } catch (err) {
    console.error("update check failed", err);
    // bij het opstarten is een mislukte check (geen internet) geen nieuws
    if (!silent) showToast("Kon niet controleren op updates");
  } finally {
    busy = false;
  }
}

async function install(update: Awaited<ReturnType<typeof check>>): Promise<void> {
  if (!update) return;
  const { showToast } = useUiStore.getState();
  showToast("Update wordt gedownload…");
  try {
    await update.downloadAndInstall();
    // openstaande wijzigingen eerst wegschrijven, daarna pas herstarten
    await flushAll();
    showToast("Doova start opnieuw op");
    await relaunch();
  } catch (err) {
    console.error("update install failed", err);
    showToast("Update installeren is mislukt");
  }
}
