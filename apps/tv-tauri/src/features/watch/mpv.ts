import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * The JS side of the Rust mpv player (Phase 4). Where tv-native drives an `<MpvPlayerView>` component
 * imperatively via a ref + view events, tv-tauri's mpv is a full-window native surface behind the
 * webview, driven by Tauri commands and observed via Tauri events (`spawn_mpv_event_loop` in lib.rs).
 * This module is the thin bridge — `use-tv-player` calls these instead of `viewRef.current?.*`.
 */

export const mpv = {
  /** Load a URL, opening AT `startAt` seconds (mpv `start=` — a fast byte-range seek). */
  load: (url: string, startAt: number) => invoke("mpv_load", { url, startAt }),
  play: () => invoke("mpv_set_pause", { paused: false }),
  pause: () => invoke("mpv_set_pause", { paused: true }),
  /** Absolute seek, seconds. */
  seek: (seconds: number) => invoke("mpv_seek", { seconds }),
  stop: () => invoke("mpv_stop"),
  setAudioTrack: (aid: string) => invoke("mpv_set_audio_track", { aid }),
  setSubtitleTrack: (sid: string) => invoke("mpv_set_subtitle_track", { sid }),
  /** Mini feed: render the video into a sub-rect `(x,y,w,h)` of a `winW`×`winH` window. */
  setRegion: (x: number, y: number, w: number, h: number, winW: number, winH: number) =>
    invoke("mpv_set_region", { x, y, w, h, winW, winH }),
  fillWindow: (winW = window.innerWidth, winH = window.innerHeight) =>
    invoke("mpv_fill_window", { winW, winH }),
  /** Linux unmaps native video while the guide-only UI is visible; a no-op elsewhere. */
  hideWindow: () => invoke("mpv_hide_window"),
};

export type MpvLoaded = { width: number; height: number; duration: number };

/** Subscribe to the mpv status events the Rust event-loop emits. Each returns an unlisten promise. */
export const mpvEvents = {
  onTimePos: (cb: (t: number) => void): Promise<UnlistenFn> =>
    listen<number>("mpv:time-pos", (e) => cb(e.payload)),
  onLoaded: (cb: (e: MpvLoaded) => void): Promise<UnlistenFn> =>
    listen<MpvLoaded>("mpv:loaded", (e) => cb(e.payload)),
  onEof: (cb: () => void): Promise<UnlistenFn> => listen("mpv:eof", () => cb()),
  onEnd: (cb: () => void): Promise<UnlistenFn> => listen("mpv:end", () => cb()),
  /** mpv `core-idle` — true while buffering / not producing frames. */
  onIdle: (cb: (idle: boolean) => void): Promise<UnlistenFn> =>
    listen<boolean>("mpv:idle", (e) => cb(e.payload)),
};
