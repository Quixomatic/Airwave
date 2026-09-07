import { AbsoluteFill, Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ComponentType } from "react";
import { FaAmazon, FaWindows } from "react-icons/fa";
import { SiAndroid, SiApple, SiGooglechrome, SiLg, SiRoku } from "react-icons/si";
import { C, FONT_MONO, FRAME_H_LAND, FRAME_MAT, FRAME_W_LAND } from "../theme";

/**
 * The "Everywhere" scene add-on, rendered on top of the normal Features frame (which is Layer 1 — the TV —
 * and enters exactly as every other feature does, blur-swap and all). AFTER it plays solo for a beat, two more
 * glass layers (iPad, macOS) slide up + fade in, each cascaded down-and-right so the three read as stacked
 * cards with depth, and a strip of platform tiles lights up group-by-group as each layer lands.
 *
 * `layers` are the two extra layers [macOS, iPad] — each with its clip + aspect, so the frame sizes to the
 * clip (macOS ~16:9, iPad 4:3). macOS stacks first; iPad ends on top as the smallest screen. Time-local to the
 * scene's Sequence.
 */

// Frame 1's on-screen center, derived from the Features flex layout (text 540 + gap 72 + frame slot), so the
// cascade lines up with the real persistent frame.
const TEXT_W = 540;
const GAP = 72;
const GROUP_W = TEXT_W + GAP + FRAME_W_LAND;
const CX = Math.round((1920 - GROUP_W) / 2 + TEXT_W + GAP + FRAME_W_LAND / 2);
const CY = 540;

// Each stacked frame sizes to ITS clip's aspect (macOS ~16:9, iPad 4:3, etc.) — same base height, width derived.
const frameDims = (aspect: number) => {
  const h = FRAME_H_LAND;
  return { w: Math.round((h - FRAME_MAT * 2) * aspect) + FRAME_MAT * 2, h };
};

const STEP_X = 42; // cascade offset per layer (right) — tight so the layers sit close
const STEP_Y = 26; // cascade offset per layer (down)

// When each extra layer reveals (seconds, local to the scene). Layer 1 (TV) is already on screen from 0.
// Kept tight so the scene doesn't linger without dialog: macOS stacks first, then iPad on top.
const REVEAL_1 = 1.6; // macOS layer stacks
const REVEAL_2 = 2.5; // iPad layer stacks (last, smallest, frontmost)
const REVEAL = 0.55; // slide+fade duration

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Tile = { Icon: ComponentType<{ size?: number }>; name: string; group: 0 | 1 | 2 };
const TILES: Tile[] = [
  { Icon: SiApple, name: "Apple TV", group: 0 },
  { Icon: SiAndroid, name: "Android TV", group: 0 },
  { Icon: FaAmazon, name: "Fire TV", group: 0 },
  { Icon: SiLg, name: "webOS", group: 0 },
  { Icon: SiRoku, name: "Roku", group: 0 },
  { Icon: SiApple, name: "macOS", group: 2 },
  { Icon: FaWindows, name: "Windows", group: 2 },
  { Icon: SiGooglechrome, name: "Browser", group: 2 },
  { Icon: SiApple, name: "iPad", group: 1 }, // last — matches the iPad layer stacking on top last
];
const GROUP_ON = [0.6, REVEAL_2, REVEAL_1]; // by group index: 0 TV (early), 1 iPad (last), 2 macOS (first)

const GlassLayer: React.FC<{ src: string; w: number; h: number; dx: number; dy: number; op: number; slide: number; z: number; scale: number }> = ({ src, w, h, dx, dy, op, slide, z, scale }) => (
  <div
    style={{
      position: "absolute",
      left: CX - w / 2 + dx,
      top: CY - h / 2 + dy,
      width: w,
      height: h,
      zIndex: z,
      opacity: op,
      transform: `translateY(${slide}px) scale(${scale})`, // shrinks as it stacks, for depth (scales about its center)
      display: "flex",
      flexDirection: "column",
      borderRadius: 22,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
      boxShadow: "0 44px 120px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.14)",
      backdropFilter: "blur(10px)",
    }}
  >
    <div style={{ position: "relative", flex: 1, margin: FRAME_MAT, borderRadius: 14, overflow: "hidden", background: C.surface }}>
      <OffthreadVideo src={staticFile(src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  </div>
);

export const EverywhereLayers: React.FC<{ layers: { src: string; aspect: number }[] }> = ({ layers }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const layer = (at: number) => {
    const p = interpolate(t, [at, at + REVEAL], [0, 1], { easing: Easing.out(Easing.cubic), ...clamp });
    return { op: p, slide: (1 - p) * 40 };
  };
  const l2 = layer(REVEAL_1); // macOS (stacks first)
  const l3 = layer(REVEAL_2); // iPad (stacks last, on top)
  const d2 = frameDims(layers[0].aspect);
  const d3 = frameDims(layers[1].aspect);

  // Tile strip sits just below the cascade, centered under Frame 1's column.
  const tilesTop = CY + FRAME_H_LAND / 2 + STEP_Y * 2 + 26;

  return (
    <AbsoluteFill>
      {/* Layer 2 (iPad) then Layer 3 (macOS) — later = frontmost. Layer 1 (TV) is the Features frame beneath. */}
      <GlassLayer src={layers[0].src} w={d2.w} h={d2.h} dx={STEP_X} dy={STEP_Y} op={l2.op} slide={l2.slide} z={2} scale={0.9} />
      <GlassLayer src={layers[1].src} w={d3.w} h={d3.h} dx={STEP_X * 2} dy={STEP_Y * 2} op={l3.op} slide={l3.slide} z={3} scale={0.81} />

      {/* Platform tiles — fade + slide up group-by-group as each layer lands. zIndex above the frames so their
          drop shadows don't fall on the tiles. */}
      <div style={{ position: "absolute", top: tilesTop, left: 0, width: 1920, zIndex: 5, display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", gap: 12, transform: `translateX(${CX - 960}px)` }}>
          {TILES.map((tile, i) => {
            const startAt = GROUP_ON[tile.group] + (i % 5) * 0.06;
            const on = interpolate(t, [startAt, startAt + REVEAL], [0, 1], { easing: Easing.out(Easing.cubic), ...clamp });
            const sc = 0.9 + 0.1 * on;
            const slide = (1 - on) * 20; // same fade + slide-up as the frames
            // Gold flash on entrance, then decays back to the normal tile styling.
            const decay = interpolate(t, [startAt + REVEAL, startAt + REVEAL + 0.8], [0, 1], clamp);
            const flash = Math.min(on, 1 - decay);
            const hue = `${Math.round(255 - 15 * flash)},${Math.round(255 - 86 * flash)},${Math.round(255 - 213 * flash)}`; // white → gold(240,169,42)
            return (
              <div
                key={i}
                style={{
                  width: 66,
                  height: 66,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  borderRadius: 12,
                  background: `rgba(${hue}, ${0.05 + 0.16 * flash})`,
                  border: `1px solid rgba(${hue}, ${0.1 + 0.6 * flash})`,
                  color: `rgba(${hue}, 0.9)`,
                  boxShadow: flash > 0.01 ? `0 0 ${18 * flash}px rgba(240,169,42,${0.45 * flash})` : "none",
                  opacity: on,
                  transform: `translateY(${slide}px) scale(${sc})`,
                }}
              >
                <tile.Icon size={22} />
                <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: C.muted, letterSpacing: "0.02em" }}>{tile.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
