import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FEATURES, FRAME_H_PORT, FRAME_MAT, FRAME_W_LAND, frameHeightFor, frameWidthFor } from "../theme";
import { BlobBg } from "./BlobBg";
import { SectionText } from "./SectionText";

// Persistent glass frame on the right (its WIDTH morphs to each media's aspect, height constant);
// the content inside blurs at each boundary and swaps to the next clip. Text section on the left.
export const Features: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const tSec = frame / fps;
  const s = (sec: number) => sec * fps;

  // Frame width keyframes (ramp ~0.3s across each boundary; flat within a feature).
  const ramp = 0.3;
  const wt: number[] = [];
  const wv: number[] = [];
  const hv: number[] = [];
  FEATURES.forEach((f, i) => {
    const w = frameWidthFor(f);
    const h = frameHeightFor(f);
    if (i === 0) { wt.push(0); wv.push(w); hv.push(h); }
    wt.push((f.start + ramp) * fps); wv.push(w); hv.push(h);
    wt.push((f.start + f.dur - ramp) * fps); wv.push(w); hv.push(h);
  });
  const last = FEATURES[FEATURES.length - 1];
  wt.push((last.start + last.dur) * fps); wv.push(frameWidthFor(last)); hv.push(frameHeightFor(last));
  const morphEase = { easing: Easing.inOut(Easing.cubic), extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const width = interpolate(frame, wt, wv, morphEase);
  const height = interpolate(frame, wt, hv, morphEase);

  // Blur peaks at each internal boundary to mask the media swap.
  const boundaries = FEATURES.slice(1).map((f) => f.start);
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
      <BlobBg />
      {/* Left: per-feature section text (fixed 540 wide; only the active one renders). */}
      <div style={{ position: "relative", width: 540, height: "100%" }}>
        {FEATURES.map((f) => (
          <Sequence key={f.id} from={Math.round(f.start * fps)} durationInFrames={Math.round(f.dur * fps)} layout="none">
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
              {FEATURES.map((f) => (
                <Sequence key={f.id} from={Math.round(f.start * fps)} durationInFrames={Math.round(f.dur * fps)}>
                  {f.kind === "video" ? (
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
    </AbsoluteFill>
  );
};
