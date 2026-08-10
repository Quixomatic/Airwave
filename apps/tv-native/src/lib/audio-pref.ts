import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * The device's audio-output preference for the mpv video player.
 *
 *  - "auto"   — render to the full negotiated route: real 5.1/7.1 LPCM to an AVR/soundbar (the default,
 *               and what makes 5.1 dialogue play correctly). On a stereo route it folds down cleanly.
 *  - "stereo" — always fold multichannel down to stereo (for a plain 2-speaker setup, or a receiver that
 *               mishandles discrete multichannel PCM).
 *
 * Maps to mpv's `audio-channels` (see `@airwave/mpv-player` `audioMode` prop). A per-device pref (some
 * households have a surround receiver on one TV and bare speakers on another), stored in AsyncStorage and
 * hydrated once at launch into a module var so `getAudioMode()` is sync. A tiny external store notifies the
 * player + the settings page so a change reloads the current program with the new layout (mirrors the
 * network-override pattern in `plex-connection.ts`).
 */
export type AudioMode = "auto" | "stereo";

const KEY = "cg-audio-mode";

let _mode: AudioMode = "auto";
const listeners = new Set<() => void>();

/** Seed the in-memory mode from AsyncStorage. Awaited at launch (alongside loadSession/loadDevice). */
export async function hydrateAudioMode(): Promise<void> {
  const v = await AsyncStorage.getItem(KEY);
  if (v === "stereo" || v === "auto") _mode = v;
}

export function getAudioMode(): AudioMode {
  return _mode;
}

/** Persist the mode and notify subscribers (the player re-reads it and reloads the current program). */
export function setAudioMode(mode: AudioMode): void {
  if (mode === _mode) return;
  _mode = mode;
  void AsyncStorage.setItem(KEY, mode).catch(() => {});
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive read for React components (the player + the settings page). */
export function useAudioMode(): AudioMode {
  return useSyncExternalStore(subscribe, getAudioMode);
}
