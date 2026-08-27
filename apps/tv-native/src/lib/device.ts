import AsyncStorage from "@react-native-async-storage/async-storage";
import { mpvDisplay } from "@airwave/mpv-player";
import { Dimensions, Platform, PixelRatio } from "react-native";

import { getServerUrl } from "./auth";

/**
 * Per-device identity + the capability-diagnostic "done" flag, ported from tv-web's `device.ts`.
 * The profile is measured device-side but stored in the SERVER's DB per `deviceId`, and the done
 * flag is keyed by SERVER URL so the diagnostic re-runs on a server switch (a new server has no
 * profile for this device). Storage is AsyncStorage; values are hydrated once at startup into
 * module vars so the getters are sync (mirroring tv-web, where localStorage is sync).
 */
const DEVICE_ID_KEY = "cg-device-id";
const CAPS_DONE_KEY = "cg-caps-done";

let _deviceId = "";
let _capsDoneServer = "";

function gen(): string {
  return `dev-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

/** Hydrate device identity + caps-done. Call once at startup (alongside loadSession). */
export async function loadDevice(): Promise<void> {
  _deviceId = (await AsyncStorage.getItem(DEVICE_ID_KEY)) ?? "";
  if (!_deviceId) {
    _deviceId = gen();
    await AsyncStorage.setItem(DEVICE_ID_KEY, _deviceId);
  }
  _capsDoneServer = (await AsyncStorage.getItem(CAPS_DONE_KEY)) ?? "";
}

export function deviceId(): string {
  return _deviceId;
}

/** Whether the diagnostic has completed against the CURRENT server. */
export function capsDoneForCurrentServer(): boolean {
  return _capsDoneServer !== "" && _capsDoneServer === getServerUrl();
}

export async function markCapsDone(): Promise<void> {
  _capsDoneServer = getServerUrl();
  await AsyncStorage.setItem(CAPS_DONE_KEY, _capsDoneServer);
}

/** The device report sent on sign-in. On native the codec facts come from the diagnostic's measured
 *  clips (not canPlayType), so this is device identity + screen — enough for the server's record. */
export function gatherDeviceReport() {
  const { width, height } = Dimensions.get("screen");
  const scale = PixelRatio.get();
  // Default: the UI surface size in physical px. On Android TV this is the 1080p UI surface even on a 4K
  // panel, so prefer the native panel resolution (Display supported modes) when available — see mpvDisplay.
  let screenWidth = Math.round(width * scale);
  let screenHeight = Math.round(height * scale);
  let hdr = false;
  const panel = mpvDisplay.getInfo(); // null off Android
  if (panel && panel.width > 0 && panel.height > 0) {
    screenWidth = panel.width;
    screenHeight = panel.height;
    hdr = panel.hdr;
  }
  return {
    deviceId: _deviceId,
    userAgent: `expo/${Platform.OS} ${Platform.Version}`,
    platform: Platform.OS,
    model: Platform.OS === "ios" ? "iOS device" : "Android device",
    osVersion: String(Platform.Version),
    screenWidth,
    screenHeight,
    pixelRatio: scale,
    hdr,
    colorGamut: "srgb",
    capabilities: { video: {}, audio: {}, containers: {} },
    raw: { isTV: Platform.isTV, native: true },
  };
}
