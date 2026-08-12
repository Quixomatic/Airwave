import { requireNativeView } from "expo";
import { forwardRef, useImperativeHandle, useRef } from "react";

import type { MpvPlayerViewProps, MpvPlayerViewRef } from "./MpvPlayer.types";

// The native Expo view registered by `MpvPlayerModule` (Swift). Its imperative view functions
// (play/pause/seek) are exposed on the underlying ref; the props/events flow straight through.
type NativeRef = {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  fadeVolume: (target: number, durationMs: number) => Promise<void>;
  setLoop: (loop: boolean) => Promise<void>;
  setRate: (rate: number) => Promise<void>;
  append: (url: string, startTime: number) => Promise<void>;
};
const NativeView = requireNativeView<MpvPlayerViewProps & { ref?: React.Ref<NativeRef> }>("MpvPlayer");

/**
 * mpv-backed video view. Behaves like a seekable media element (that's the point — so the proven
 * tv-web/tv-native effectiveTime + DVR logic maps straight onto it): set `source` + `startTime`, drive
 * `paused`, and `seek(seconds)` is a fast ffmpeg-estimated jump even on un-indexed MKV.
 */
export const MpvPlayerView = forwardRef<MpvPlayerViewRef, MpvPlayerViewProps>((props, ref) => {
  const nativeRef = useRef<NativeRef>(null);
  useImperativeHandle(
    ref,
    () => ({
      play: async () => {
        await nativeRef.current?.play();
      },
      pause: async () => {
        await nativeRef.current?.pause();
      },
      seek: async (seconds: number) => {
        await nativeRef.current?.seek(seconds);
      },
      fadeVolume: async (target: number, durationMs: number) => {
        await nativeRef.current?.fadeVolume(target, durationMs);
      },
      setLoop: async (loop: boolean) => {
        await nativeRef.current?.setLoop(loop);
      },
      setRate: async (rate: number) => {
        await nativeRef.current?.setRate(rate);
      },
      append: async (url: string, startTime = 0) => {
        await nativeRef.current?.append(url, startTime);
      },
    }),
    [],
  );
  return <NativeView {...props} ref={nativeRef} />;
});
MpvPlayerView.displayName = "MpvPlayerView";
