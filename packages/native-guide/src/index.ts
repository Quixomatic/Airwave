import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { ComponentType } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";

/**
 * One program as the native side reads it. `art` is the artwork's request URL up to its query (the native side appends
 * the pixel size it needs), or null for none. `sub` is the cell's second line, built in JS.
 */
export type PackedProgram = [
  id: string,
  startMs: number,
  durationSeconds: number,
  title: string,
  art: string | null,
  sub: string,
];

/** One channel. `icon` is the icon-set id the rail's circle shows (`lucide:Radio`), "" for none. */
export type PackedChannel = [
  id: string,
  number: string,
  name: string,
  icon: string,
  logo: string | null,
  programs: PackedProgram[],
];

/**
 * A lineup update. Every channel is sent once under a token (`add`); after that an update is just the row `order` (tokens)
 * with each row's `accent` (a CSS color) and `fav` flag, which belong to the row because an untinted channel's accent
 * depends on its position in the lineup being shown. `s` identifies this JS context (a reload restarts the tokens).
 */
export type LineupUpdate = {
  s: string;
  order: string[];
  accent: string[];
  fav: (0 | 1)[];
  add: [token: string, channel: PackedChannel][];
};

/**
 * The guide's channel rows drawn natively (android/.../NativeGuideView.kt). Android only: on every other platform, and
 * on an Android binary built before this module existed (an over-the-air JS update), `nativeGuide` is null and
 * `NativeGuideView` is null, and the app keeps drawing its React Native rows.
 */
type NativeGuideModule = {
  /** Applies a `LineupUpdate` (as JSON) to the lineup store named `lineupId` and returns its version, or -1 when the update
   *  referenced channels that store doesn't hold (the caller then sends the full lineup). Throws on malformed JSON. Every set
   *  of rows has a store of its own (a guide screen pushed over another stays mounted beneath it); the view names its store
   *  with the same id. */
  setLineup(lineupId: string, json: string): number;
  /** Drops the lineup store `lineupId` (those native rows unmounted); other stores are untouched. */
  clearLineup(lineupId: string): void;
  /** Writes one line to logcat under the tag AirwaveGuide (the app's choice of renderer and why). Missing on a binary built
   *  before it was added, so check for it. */
  logRenderer?(line: string): void;
  /** Registers icons the rows can draw: a JSON object of lucide icon nodes (`[tag, attributes][]`, as `lucide-react-native`
   *  holds them) by icon-set id (`{ "lucide:Radio": [["path", { "d": "..." }], ...] }`). Idempotent; returns how many icons
   *  it read. A channel whose icon was never registered draws `lucide:Radio`'s, and the favorite heart is `lucide:Heart`: register
   *  both. */
  setGlyphs(json: string): number;
};

export const nativeGuide: NativeGuideModule | null = requireOptionalNativeModule<NativeGuideModule>("NativeGuide");

export type NativeGuideErrorEvent = NativeSyntheticEvent<{ message: string }>;

export type NativeGuideViewProps = ViewProps & {
  /** The lineup store these rows draw from: the `lineupId` their `setLineup` calls name. */
  lineupId: string;
  /** `setLineup`'s version for the lineup these rows draw. */
  lineupVersion: number;
  /** JSON: the row geometry in dp (`rowH`, `railW`, `laneW`, `ppm`, `originMs`, `windowMin`, `gap`, and the rest of the
   *  dimensions the rows draw with). Not the current time: that is `nowMs`, which moves every minute while this does not. */
  geo: string;
  /** The current time (epoch ms): where a live cell's progress is drawn. Only the rows with a live cell draw again when it moves. */
  nowMs: number;
  /** JSON: the guide's look (colors, weights, sizes) as a token set. */
  tokens: string;
  focusRow: number;
  /** The selected program's id in the focused row ("" for none). */
  focusProgramId: string;
  /** "grid" | "rail" | "sidebar": which part of the guide has focus. */
  zone: string;
  /** The mini player has focus: no row is focused. */
  miniFocused: boolean;
  /** The rows' vertical scroll offset (dp), decided in JS. */
  scrollY: number;
  /** The one opaque color the rows are drawn over (a CSS color), or "" when something else is behind them (a texture) or it is not
   *  known. A theme that multiplies its second ink with what is beneath the rows needs it to keep each row in a texture of its own. */
  backdrop?: string;
  /** The view hit a drawing error (it stops drawing rows; the guide switches to the React Native rows for the session). */
  onRenderError?: (e: NativeGuideErrorEvent) => void;
};

function loadView(): ComponentType<NativeGuideViewProps> | null {
  if (!nativeGuide) return null;
  try {
    return requireNativeView<NativeGuideViewProps>("NativeGuide");
  } catch {
    return null;
  }
}

export const NativeGuideView: ComponentType<NativeGuideViewProps> | null = loadView();

/** True when this binary can draw the guide natively. */
export function nativeGuideAvailable(): boolean {
  return nativeGuide != null && NativeGuideView != null;
}
