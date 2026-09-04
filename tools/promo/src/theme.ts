export const FPS = 60;

// Brand (apps/site "10-foot navy")
export const C = {
  bg: "#060a14",
  surface: "#0b1120",
  surface2: "#0f1626",
  fg: "#f1f5f9",
  muted: "#94a3b8",
  border: "rgba(148,163,184,0.14)",
  accent: "#4a9fe0",
  accent2: "#7bb8ea",
  gradCenter: "#16263f",
  gradEdge: "#05080f",
};

export const FONT_DISPLAY =
  '"Avenir Next", "Segoe UI Variable Display", "SF Pro Display", ui-sans-serif, system-ui, sans-serif';
export const FONT_BODY = '"Inter", ui-sans-serif, system-ui, sans-serif';
export const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export type Feature = {
  id: string;
  pill: string;
  pre: string;
  hl: string;
  post: string;
  desc: string;
  src: string;
  kind: "video" | "img";
  portrait?: boolean;
  start: number; // seconds, local to the features block
  dur: number;
};

// Feature block starts at 5s absolute; times below are LOCAL (0 = 5s).
export const FEATURES: Feature[] = [
  { id: "guide", pill: "The guide", pre: "A real channel ", hl: "guide", post: ".", desc: "Every channel runs an always-on schedule from your own library. A proper guide, not a shuffle button.", src: "video/guide-surf.mp4", kind: "video", start: 0.0, dur: 5.2 },
  { id: "tune", pill: "Live TV", pre: "Always-on ", hl: "live TV", post: ".", desc: "Turn it on and join whatever's playing now, mid-program, at exactly the right moment.", src: "video/tune-in-info.mp4", kind: "video", start: 5.2, dur: 5.0 },
  { id: "dvr", pill: "DVR", pre: "Rewind and ", hl: "restart", post: ".", desc: "Scrub back within the live buffer, restart the current show, or jump straight to live.", src: "video/restart.mp4", kind: "video", start: 10.2, dur: 4.6 },
  { id: "surf", pill: "Channel surf", pre: "", hl: "Surf", post: " the channels.", desc: "Flip up and down the dial without ever leaving what you're watching.", src: "video/channel-surf.mp4", kind: "video", start: 14.8, dur: 4.8 },
  { id: "bump", pill: "Bumpers", pre: "Polished ", hl: "bumpers", post: ".", desc: "Clean “Up Next” cards between programs, with an optional ambient-music bed.", src: "video/dvr-bumper.mp4", kind: "video", start: 19.6, dur: 5.0 },
  { id: "build", pill: "Build it", pre: "", hl: "Build", post: " a channel fast.", desc: "Point a filter at your library and a channel schedules itself. Preview it live before you save.", src: "video/filtered-pick.mp4", kind: "video", start: 24.6, dur: 5.0 },
  { id: "org", pill: "Organize", pre: "", hl: "Organize", post: " & share.", desc: "Bundle channels into packages and share them per user, Plex-style.", src: "video/lenses.mp4", kind: "video", start: 29.6, dur: 5.0 },
  { id: "every", pill: "Everywhere", pre: "On ", hl: "every screen", post: ".", desc: "Native apps for Apple TV, mobile, the web, desktop, and Roku.", src: "video/mini-player.mp4", kind: "video", start: 34.6, dur: 3.6 },
  { id: "ai", pill: "Optional AI", pre: "", hl: "AI", post: " lineup builder.", desc: "Bring your own key and let an assistant draft entire lineups. Completely optional.", src: "screenshots/admin-aiassistant.webp", kind: "img", start: 38.2, dur: 5.0 },
  { id: "setup", pill: "Self-host", pre: "", hl: "Self-host", post: " it all.", desc: "Your server, your library. From a fresh clone to running in one command.", src: "video/dev-setup.mp4", kind: "video", portrait: true, start: 43.2, dur: 5.4 },
];

export const INTRO_SEC = 5.0;
export const FEATURES_SEC = 48.6; // sum of feature block (5s..53.6s absolute)
export const OUTRO_SEC = 8.0; // lockup + two static tile rows
export const TOTAL_SEC = INTRO_SEC + FEATURES_SEC + OUTRO_SEC; // 61.6

// Glass frame geometry: both width AND height morph to the active media's aspect. Landscape is
// short + wide; the portrait dev-setup clip gets a taller, narrower frame.
export const FRAME_MAT = 14;
const LAND_ASPECT = 1920 / 1078;
const PORT_ASPECT = 964 / 1298;
export const FRAME_H_LAND = 620; // taller landscape → ~1082 wide (bigger demos)
export const FRAME_H_PORT = 820;
export const frameHeightFor = (f: Feature) => (f.portrait ? FRAME_H_PORT : FRAME_H_LAND);
export const frameWidthFor = (f: Feature) => {
  const sh = frameHeightFor(f) - FRAME_MAT * 2;
  return Math.round(sh * (f.portrait ? PORT_ASPECT : LAND_ASPECT)) + FRAME_MAT * 2;
};
export const FRAME_W_LAND = Math.round((FRAME_H_LAND - FRAME_MAT * 2) * LAND_ASPECT) + FRAME_MAT * 2; // ~869
