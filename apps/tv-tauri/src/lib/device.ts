import { getVal, setVal } from "./store";
import { getStoredServerUrl } from "./server-url";

/**
 * Per-device identity + the capability-diagnostic "done" flag. Faithful port of tv-native `lib/device.ts`.
 * The profile is measured device-side (mpv decode probes) but stored in the SERVER's DB per `deviceId`;
 * the done flag is keyed by SERVER URL so the diagnostic re-runs on a server switch. Backed by the
 * tauri-plugin-store cache (sync, hydrated at startup) rather than AsyncStorage/localStorage.
 */
const DEVICE_ID_KEY = "deviceId";
const CAPS_DONE_KEY = "capsDoneServer";

function gen(): string {
  return `dev-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function deviceId(): string {
  let id = getVal(DEVICE_ID_KEY);
  if (!id) {
    id = gen();
    setVal(DEVICE_ID_KEY, id);
  }
  return id;
}

/** Whether the diagnostic has completed against the CURRENT server. */
export function capsDoneForCurrentServer(): boolean {
  const done = getVal(CAPS_DONE_KEY);
  return done !== "" && done === getStoredServerUrl();
}

export function markCapsDone(): void {
  setVal(CAPS_DONE_KEY, getStoredServerUrl());
}

/** The device report sent before the diagnostic. On desktop the codec facts come from the mpv decode
 *  probes (not this), so this is device identity + screen — enough for the server's record. */
export function gatherDeviceReport() {
  const dpr = window.devicePixelRatio || 1;
  const ua = navigator.userAgent;
  const platform = /Windows/i.test(ua)
    ? "windows"
    : /Mac/i.test(ua)
      ? "macos"
      : /Linux/i.test(ua)
        ? "linux"
        : "desktop";
  return {
    deviceId: deviceId(),
    userAgent: `tauri/${platform}`,
    platform,
    model: "Desktop",
    osVersion: "",
    screenWidth: Math.round((window.screen?.width ?? 0) * dpr),
    screenHeight: Math.round((window.screen?.height ?? 0) * dpr),
    pixelRatio: dpr,
    hdr: false,
    colorGamut: "srgb",
    capabilities: { video: {}, audio: {}, containers: {} },
    raw: { desktop: true, tauri: true },
  };
}
