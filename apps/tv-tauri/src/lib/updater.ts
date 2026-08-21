import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

/**
 * Self-update via `tauri-plugin-updater`. Checks the `latest.json` endpoint (GitHub release, see
 * tauri.conf `plugins.updater`), and if a newer signed build exists, downloads + installs it and
 * relaunches. On Windows the NSIS installer runs in `passive` mode (a small progress window).
 *
 * NOTE: the endpoint is a GitHub *release* asset; while the repo is private it isn't publicly
 * fetchable, so `check()` returns null / errors until releases are public. The wiring is ready — it
 * lights up the moment a public `latest.json` is served.
 */
export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "uptodate" }
  | { state: "downloading"; version: string }
  | { state: "error"; message: string };

export async function checkForUpdates(onStatus: (s: UpdateStatus) => void): Promise<void> {
  onStatus({ state: "checking" });
  try {
    const update = await check();
    if (!update) {
      onStatus({ state: "uptodate" });
      return;
    }
    onStatus({ state: "downloading", version: update.version });
    await update.downloadAndInstall();
    await relaunch();
  } catch (e) {
    onStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
  }
}
