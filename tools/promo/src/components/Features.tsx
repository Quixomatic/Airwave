import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FRAME_H_PORT, FRAME_MAT, FRAME_W_LAND, frameHeightFor, frameWidthFor } from "../theme";
import type { FeatureTiming } from "../timeline";
import { BlobBg } from "./BlobBg";
import { EverywhereLayers } from "./EverywhereLayers";
import { SectionText } from "./SectionText";

// Persistent glass frame on the right (its WIDTH morphs to each media's aspect, height constant);
// the content inside blurs at each boundary and swaps to the next clip. Text section on the left.
// Scene timings (`startSec`/`durSec`, LOCAL to the features block) are VO-driven — see timeline.ts.
export const Features: React.FC<{ features: FeatureTiming[] }> = ({ features }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const tSec = frame / fps;
  const s = (sec: number) => sec * fps;
  const everyF = features.find((f) => f.id === "every");

  // Frame width keyframes (ramp ~0.3s across each boundary; flat within a feature).
  const ramp = 0.3;
  const wt: number[] = [];
  const wv: number[] = [];
  const hv: number[] = [];
  features.forEach((f, i) => {
    const w = frameWidthFor(f);
    const h = frameHeightFor(f);
    if (i === 0) { wt.push(0); wv.push(w); hv.push(h); }
    wt.push((f.startSec + ramp) * fps); wv.push(w); hv.push(h);
    wt.push((f.startSec + f.durSec - ramp) * fps); wv.push(w); hv.push(h);
  });
  const last = features[features.length - 1];
  wt.push((last.startSec + last.durSec) * fps); wv.push(frameWidthFor(last)); hv.push(frameHeightFor(last));
  const morphEase = { easing: Easing.inOut(Easing.cubic), extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const width = interpolate(frame, wt, wv, morphEase);
  const height = interpolate(frame, wt, hv, morphEase);

  // Blur peaks at each internal boundary to mask the media swap.
  const boundaries = features.slice(1).map((f) => f.startSec);
  const blurWin = 0.32;
  const BMAX = 20;
  let blur = 0;
  for (const b of boundaries) {
    const d = Math.abs(tSec - b);
    if (d < blurWin) blur = Math.max(blur, BMAX * (1 - d / blurWin));
  }

  // Frame fade + settle in/out at the block edges.
  const frameOp = interpolate(frame, [0, s(0.6), durationInFrames - s(0.5), durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const frameScale = interpolate(frame, [0, s(0.6)], [0.94, 1], { easing: Easing.out(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 72, background: C.bg }}>
      {/* Blob shifts one step around its orbit at each feature boundary, then holds. */}
      <BlobBg steps={boundaries} />
      {/* Left: per-feature section text (fixed 540 wide; only the active one renders). */}
      <div style={{ position: "relative", width: 540, height: "100%" }}>
        {features.map((f) => (
          <Sequence key={f.id} from={Math.round(f.startSec * fps)} durationInFrames={Math.round(f.durSec * fps)} layout="none">
            <SectionText feature={f} />
          </Sequence>
        ))}
      </div>

      {/* Right: a fixed slot (landscape width x tallest height); the morphing frame centers within it. */}
      <div style={{ position: "relative", width: FRAME_W_LAND, height: FRAME_H_PORT, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width,
            height,
            opacity: frameOp,
            transform: `scale(${frameScale})`,
            display: "flex",
            flexDirection: "column",
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
            boxShadow: "0 44px 120px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.14)",
            backdropFilter: "blur(10px)",
          }}
        >
          {/* Screen stays crisp (rounded + clip); an oversized inner layer carries the blur so only
              the CONTENTS blur — the frame's inner edge is retained. */}
          <div style={{ position: "relative", flex: 1, margin: FRAME_MAT, borderRadius: 14, overflow: "hidden", background: C.surface }}>
            <div style={{ position: "absolute", inset: 0, filter: `blur(${blur}px)` }}>
              {features.map((f) => (
                <Sequence key={f.id} from={Math.round(f.startSec * fps)} durationInFrames={Math.round(f.durSec * fps)}>
                  {f.kind === "video" ? (
                    // A demo clip shorter than its (VO-stretched) scene just holds its last frame for the
                    // remainder — fine in the interim; the demos will be re-recorded with extra length.
                    <OffthreadVideo src={staticFile(f.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <Img src={staticFile(f.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  )}
                </Sequence>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Everywhere scene: two extra cascading device layers + lighting platform tiles, over the frame. */}
      {everyF ? (
        <Sequence from={Math.round(everyF.startSec * fps)} durationInFrames={Math.round(everyF.durSec * fps)} layout="none">
          {/* Real device clips [macOS, iPad] — each frame sizes to the clip's aspect. (TV = Frame 1 = every.src.) */}
          <EverywhereLayers
            layers={[
              { src: "video/macos.mp4", aspect: 1556 / 884 },
              { src: "video/ipad.mp4", aspect: 1200 / 900 },
            ]}
          />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
