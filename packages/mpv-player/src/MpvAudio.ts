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

interface MpvAudioNative {
  audioLoad(url: string): Promise<void>;
  audioPlay(): Promise<void>;
  audioPause(): Promise<void>;
  audioStop(): Promise<void>;
  audioSeek(seconds: number): Promise<void>;
  audioSetVolume(volume: number): Promise<void>;
  audioFadeVolume(volume: number, durationMs: number): Promise<void>;
  audioSetLoop(loop: boolean): Promise<void>;
  addListener(event: "onAudioProgress", listener: (e: MpvAudioProgress) => void): MpvAudioSubscription;
  addListener(event: "onAudioEnded", listener: () => void): MpvAudioSubscription;
}

// Same native module as the video view ("MpvPlayer") — the audio API is module-level, view-less.
const Native = requireNativeModule<MpvAudioNative>("MpvPlayer");

export const mpvAudio = {
  /** Load (and buffer) a track URL. Replaces any current track. */
  load: (url: string): Promise<void> => Native.audioLoad(url),
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
  /** Loop the track when it reaches the end (mpv `loop-file`). */
  setLoop: (loop: boolean): Promise<void> => Native.audioSetLoop(loop),
  /** Position ticks (mpv `time-pos`) + the track's duration. */
  onProgress: (listener: (e: MpvAudioProgress) => void): MpvAudioSubscription =>
    Native.addListener("onAudioProgress", listener),
  /** Natural end of the track (EOF). */
  onEnded: (listener: () => void): MpvAudioSubscription => Native.addListener("onAudioEnded", listener),
};
