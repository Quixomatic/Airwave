import { requireNativeModule } from "expo";

/** An event subscription — `remove()` to unsubscribe. (Structurally matches Expo's `EventSubscription`;
 *  declared locally so this file doesn't depend on `expo-modules-core`'s types resolving from every consumer.) */
export interface MpvAudioSubscription {
  remove: () => void;
}

/**
 * Headless audio-only mpv player (§7.14 Phase B / radio channels) — a compartmentalized piece of the
 * `@ChannelGuide/mpv-player` module, completely independent of the video `<MpvPlayerView>`. Drive it
 * imperatively: `load` a URL, then `play`/`pause`/`seek`/`setVolume`/`setLoop`/`stop`, and subscribe to
 * `onProgress`/`onEnded`. Backed by a second, surface-less libmpv instance (see the native `MpvAudioCore`).
 */

export interface MpvAudioProgress {
  currentTime: number;
  duration: number;
}

export interface MpvAudioError {
  message: string;
}

export interface MpvAudioBuffering {
  buffering: boolean;
}

interface MpvAudioNative {
  audioLoad(url: string, startTime: number): Promise<void>;
  audioAppend(url: string, startTime: number): Promise<void>;
  audioPlay(): Promise<void>;
  audioPause(): Promise<void>;
  audioStop(): Promise<void>;
  audioSeek(seconds: number): Promise<void>;
  audioSetVolume(volume: number): Promise<void>;
  audioFadeVolume(volume: number, durationMs: number): Promise<void>;
  audioSetMuted(muted: boolean): Promise<void>;
  audioSetRate(rate: number): Promise<void>;
  audioSetLoop(loop: boolean): Promise<void>;
  addListener(event: "onAudioProgress", listener: (e: MpvAudioProgress) => void): MpvAudioSubscription;
  addListener(event: "onAudioEnded", listener: () => void): MpvAudioSubscription;
  addListener(event: "onAudioError", listener: (e: MpvAudioError) => void): MpvAudioSubscription;
  addListener(event: "onAudioBuffering", listener: (e: MpvAudioBuffering) => void): MpvAudioSubscription;
}

// Same native module as the video view ("MpvPlayer") — the audio API is module-level, view-less.
const Native = requireNativeModule<MpvAudioNative>("MpvPlayer");

export const mpvAudio = {
  /** Load (and buffer) a track URL, opening AT `startTime` seconds (a fast range-seek, not play-from-0).
   *  Replaces any current track. */
  load: (url: string, startTime = 0): Promise<void> => Native.audioLoad(url, startTime),
  /** Queue a track AFTER the current one for GAPLESS handoff (mpv playlist `append` + `prefetch-playlist`) —
   *  the next entry opens before this one ends, so there's no gap. Call after `load`; optional `startTime`
   *  tunes the appended entry mid-track. The queue primitive for radio channels. */
  append: (url: string, startTime = 0): Promise<void> => Native.audioAppend(url, startTime),
  play: (): Promise<void> => Native.audioPlay(),
  pause: (): Promise<void> => Native.audioPause(),
  /** Stop + unload the current track. */
  stop: (): Promise<void> => Native.audioStop(),
  /** Absolute seek, in seconds. */
  seek: (seconds: number): Promise<void> => Native.audioSeek(seconds),
  /** Volume 0..1 (0 = silent, 1 = full) — set immediately. */
  setVolume: (volume: number): Promise<void> => Native.audioSetVolume(volume),
  /** Smoothly ramp the volume to 0..1 over `durationMs` — a native 60fps fade (one bridge call). Use for
   *  fade in/out and crossfades; cancels any in-flight fade and starts from the current level. */
  fadeVolume: (volume: number, durationMs: number): Promise<void> => Native.audioFadeVolume(volume, durationMs),
  /** Mute/unmute without disturbing the volume level (mpv `mute`). */
  setMuted: (muted: boolean): Promise<void> => Native.audioSetMuted(muted),
  /** Playback speed (1.0 = normal — mpv `speed`). */
  setRate: (rate: number): Promise<void> => Native.audioSetRate(rate),
  /** Loop the track when it reaches the end (mpv `loop-file`). */
  setLoop: (loop: boolean): Promise<void> => Native.audioSetLoop(loop),
  /** Position ticks (mpv `time-pos`) + the track's duration. */
  onProgress: (listener: (e: MpvAudioProgress) => void): MpvAudioSubscription =>
    Native.addListener("onAudioProgress", listener),
  /** Natural end of the track (EOF). */
  onEnded: (listener: () => void): MpvAudioSubscription => Native.addListener("onAudioEnded", listener),
  /** A load/decode/network error (mpv end-file reason = error). */
  onError: (listener: (e: MpvAudioError) => void): MpvAudioSubscription =>
    Native.addListener("onAudioError", listener),
  /** Stalled waiting on the network buffer (mpv `paused-for-cache`) — true on stall, false on resume. */
  onBuffering: (listener: (e: MpvAudioBuffering) => void): MpvAudioSubscription =>
    Native.addListener("onAudioBuffering", listener),
};
