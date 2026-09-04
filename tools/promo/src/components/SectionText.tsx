import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT_BODY, FONT_DISPLAY, FONT_MONO, Feature } from "../theme";

const EASE = Easing.out(Easing.cubic);

// apps/site SectionHeader styling: muted pill + display title (accent word) + muted description.
// Slides in from the left, staggered; fades out near the end of the feature window.
export const SectionText: React.FC<{ feature: Feature }> = ({ feature }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const s = (sec: number) => sec * fps;

  const rowIn = (i: number) => {
    const d = s(0.35 + i * 0.12);
    const op = interpolate(frame, [d, d + s(0.55)], [0, 1], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const x = interpolate(frame, [d, d + s(0.55)], [-34, 0], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return { opacity: op, transform: `translateX(${x}px)` };
  };
  const blockOut = interpolate(frame, [durationInFrames - s(0.5), durationInFrames - s(0.13)], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: blockOut, justifyContent: "center" }}>
      <div style={{ width: "100%" }}>
        <div style={rowIn(0)}>
          <span
            style={{
              display: "inline-block",
              marginBottom: 24,
              borderRadius: 999,
              background: C.surface2,
              color: C.muted,
              fontFamily: FONT_MONO,
              fontWeight: 700,
              letterSpacing: "0.03em",
              fontSize: 18,
              padding: "11px 20px",
            }}
          >
            {feature.pill}
          </span>
        </div>
        <h2
          style={{
            ...rowIn(1),
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 74,
            lineHeight: 0.96,
            letterSpacing: "-0.045em",
            color: C.fg,
            margin: "0 0 24px",
          }}
        >
          {feature.pre}
          <span style={{ color: C.accent }}>{feature.hl}</span>
          {feature.post}
        </h2>
        <p style={{ ...rowIn(2), fontFamily: FONT_BODY, fontSize: 27, lineHeight: 1.6, color: C.muted, maxWidth: 560, margin: 0 }}>
          {feature.desc}
        </p>
      </div>
    </AbsoluteFill>
  );
};
