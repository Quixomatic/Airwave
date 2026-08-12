import type { ViewProps } from "react-native";

export type MpvContentFit = "contain" | "cover" | "fill";

/** Fired once per media once mpv has parsed the header (duration + dimensions known). */
export interface MpvLoadEvent {
  duration: number; // seconds (0 if unknown)
  width: number;
  height: number;
}

/** Playback position tick (mpv `time-pos`), in seconds. */
export interface MpvProgressEvent {
  currentTime: number;
  /** The loaded file's duration in seconds (0 if unknown). Used by the audio-only bumper bed to derive its
   *  loop position; the video program clock ignores it. */
  duration: number;
}

/** mpv `paused-for-cache` — true = stalled waiting on the network buffer. */
export interface MpvBufferingEvent {
  buffering: boolean;
}

export interface MpvErrorEvent {
  message: string;
}

export interface MpvEndEvent {
  /** mpv end-file reason: "eof" | "stop" | "error" | "redirect" | "unknown". */
  reason: string;
}

export interface MpvTrack {
  id: number; // mpv track id (aid/sid)
  type: "audio" | "sub" | "video";
  title?: string;
  lang?: string;
  codec?: string;
}

export interface MpvTracksEvent {
  audio: MpvTrack[];
  subtitle: MpvTrack[];
}

/** Native-event envelope Expo wraps view events in. */
type Native<T> = { nativeEvent: T };

export interface MpvPlayerViewProps extends ViewProps {
  /** Media URL. `null`/omitted stops + releases the current file. */
  source?: string | null;
  /**
   * Initial start position in **seconds** — mpv opens the file AT this offset via `loadfile … start=<t>`
   * (an ffmpeg-estimated byte-range seek, NOT a play-from-0-then-seek). This is the fix libVLC couldn't do.
   */
  startTime?: number;
  /**
   * Content mode for the current `source` (default `"video"`). `"audio"` = an audio-only load (the bumper
   * music bed / a radio track): mpv decodes no video track and draws no cover art to the surface, and the
   * load starts SILENT so JS can fade it in. It's applied per-load (set it alongside `source`), so the ONE
   * engine plays program video and bumper/radio audio sequentially with no second instance. See
   * `.plans/mpv-hybrid-core.md`.
   */
  mode?: "video" | "audio";
  /** `true` = paused. */
  paused?: boolean;
  muted?: boolean;
  /** 0..100 */
  volume?: number;
  contentFit?: MpvContentFit;
  /** mpv audio track id (`aid`). `-1` = auto. */
  audioTrack?: number;
  /** mpv subtitle track id (`sid`). `-1` = none. */
  subtitleTrack?: number;
  /**
   * Audio channel handling (mpv `audio-channels`). `"auto"` (default) uses the full negotiated route —
   * real 5.1/7.1 LPCM to an AVR/soundbar; `"stereo"` forces a fold-down. Applied at init and switchable
   * live (the caller reloads the current program for a switch to take effect).
   */
  audioMode?: "auto" | "stereo";
  /** Extra mpv options applied at init, e.g. `{ "cache": "yes", "hwdec": "videotoolbox" }`. */
  options?: Record<string, string>;

  onLoad?: (e: Native<MpvLoadEvent>) => void;
  onFirstFrame?: (e: Native<Record<string, never>>) => void;
  onProgress?: (e: Native<MpvProgressEvent>) => void;
  onBuffering?: (e: Native<MpvBufferingEvent>) => void;
  onTracks?: (e: Native<MpvTracksEvent>) => void;
  onError?: (e: Native<MpvErrorEvent>) => void;
  onEnd?: (e: Native<MpvEndEvent>) => void;
}

export interface MpvPlayerViewRef {
  /** Resume playback. */
  play: () => Promise<void>;
  /** Pause playback. */
  pause: () => Promise<void>;
  /** Absolute seek in **seconds**. mpv estimates the byte position → fast even on un-indexed MKV. */
  seek: (seconds: number) => Promise<void>;
  /** Smoothly ramp the volume to 0..1 over `durationMs` — a native 60fps fade (one bridge call). For the
   *  bumper music bed's fade in/out. Audio-only loads start silent, so this is how they become audible. */
  fadeVolume: (target: number, durationMs: number) => Promise<void>;
  /** Loop the current file at EOF (mpv `loop-file`) — the ambient bumper bed / looping radio. A video load
   *  resets this, so it never bleeds into a program. */
  setLoop: (loop: boolean) => Promise<void>;
  /** Playback speed (1.0 = normal — mpv `speed`). */
  setRate: (rate: number) => Promise<void>;
  /** Queue a track AFTER the current one for GAPLESS handoff (radio). Call after a `source` load. */
  append: (url: string, startTime?: number) => Promise<void>;
}
