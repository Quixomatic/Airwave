import { requireNativeModule } from "expo";
import { Platform } from "react-native";

/**
 * The physical display (panel) info — a small, view-less piece of `@airwave/mpv-player`.
 *
 * Why it exists: on Android TV the system renders its UI at 1080p even on 4K panels, so React Native's
 * `Dimensions.get("screen")` reports the 1080p UI *surface*, not the panel — which makes Settings → Device
 * wrongly show 1080p on a 4K TV. The native side reads the display's supported modes (the true pixel
 * dimensions) + HDR capability. **Android only** — on iOS/tvOS the UI surface equals the panel, so RN's
 * `Dimensions` is already correct and this returns `null`.
 */

export interface DisplayInfo {
  /** Panel width in physical pixels (e.g. 3840). 0 if unknown. */
  width: number;
  /** Panel height in physical pixels (e.g. 2160). 0 if unknown. */
  height: number;
  /** Whether the display advertises any HDR type (HDR10 / HLG / Dolby Vision / HDR10+). */
  hdr: boolean;
}

interface MpvDisplayNative {
  getDisplayInfo(): DisplayInfo;
}

export const mpvDisplay = {
  /**
   * The panel's real resolution + HDR capability. Returns `null` on non-Android platforms (and on any error)
   * so callers cleanly fall back to `Dimensions`. Synchronous — safe to call inline in the device report.
   */
  getInfo(): DisplayInfo | null {
    if (Platform.OS !== "android") return null;
    try {
      return requireNativeModule<MpvDisplayNative>("MpvPlayer").getDisplayInfo();
    } catch {
      return null;
    }
  },
};
