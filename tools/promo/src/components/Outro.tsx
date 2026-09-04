import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ComponentType } from "react";
import { FaAmazon, FaDocker, FaLinux, FaWindows } from "react-icons/fa";
import { SiAndroid, SiApple, SiGooglechrome, SiLg, SiRoku } from "react-icons/si";
import { C, FONT_MONO } from "../theme";
import { BlobBg } from "./BlobBg";

const EASE = Easing.out(Easing.cubic);

type Tile = { name: string; Icon: ComponentType<{ size?: number }> };

const CLIENTS: Tile[] = [
  { name: "Apple TV", Icon: SiApple },
  { name: "iPad", Icon: SiApple },
  { name: "Android TV", Icon: SiAndroid },
  { name: "Fire TV", Icon: FaAmazon },
  { name: "LG webOS", Icon: SiLg },
  { name: "Roku", Icon: SiRoku },
  { name: "Windows", Icon: FaWindows },
  { name: "macOS", Icon: SiApple },
  { name: "Browser", Icon: SiGooglechrome },
];

const SERVERS: Tile[] = [
  { name: "Docker", Icon: FaDocker },
  { name: "Windows", Icon: FaWindows },
  { name: "macOS Intel", Icon: SiApple },
  { name: "macOS Silicon", Icon: SiApple },
  { name: "Linux", Icon: FaLinux },
];

const FADE = "linear-gradient(to right, transparent, black 8%, black 92%, transparent)";

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.18em", fontSize: 19, color: C.accent2, textAlign: "center", marginBottom: 18 }}>{children}</div>
);

// A static (non-scrolling) row of icon+name tiles, all fitting, with soft masked edges.
const Row: React.FC<{ items: Tile[]; baseSec: number }> = ({ items, baseSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = (sec: number) => sec * fps;
  return (
    <div style={{ display: "flex", gap: 22, justifyContent: "center", maskImage: FADE, WebkitMaskImage: FADE }}>
      {items.map((t, i) => {
        const center = (items.length - 1) / 2;
        const d = s(baseSec + Math.abs(i - center) * 0.06); // stagger outward from the center tile

        const op = interpolate(frame, [d, d + s(0.4)], [0, 1], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const sc = interpolate(frame, [d, d + s(0.4)], [0.9, 1], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div
            key={i}
            style={{
              flex: "0 0 auto",
              width: 150,
              height: 150,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              borderRadius: 20,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(6px)",
              color: "rgba(255,255,255,0.86)",
              opacity: op,
              transform: `scale(${sc})`,
            }}
          >
            <t.Icon size={46} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 15, color: C.muted, letterSpacing: "0.02em" }}>{t.name}</span>
          </div>
        );
      })}
    </div>
  );
};

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = (sec: number) => sec * fps;

  const lockOp = interpolate(frame, [s(0.3), s(1.1)], [0, 1], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lockY = interpolate(frame, [s(0.3), s(1.1)], [26, 0], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const labelOp = (d: number) => interpolate(frame, [s(d), s(d + 0.6)], [0, 1], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 120% at 50% 38%, ${C.gradCenter} 0%, ${C.gradEdge} 74%)`,
        alignItems: "center",
        justifyContent: "center",
        gap: 56,
      }}
    >
      <BlobBg opacity={0.7} />

      {/* Lockup */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, opacity: lockOp, transform: `translateY(${lockY}px)` }}>
        <Img src={staticFile("brand/wordmark-row-transparent.png")} style={{ width: 420, height: "auto" }} />
        <div style={{ fontFamily: FONT_MONO, fontSize: 30, letterSpacing: "0.06em", color: C.accent2 }}>getairwave.tv</div>
      </div>

      {/* Two static tile rows */}
      <div style={{ width: "100%" }}>
        <div style={{ opacity: labelOp(1.2) }}>
          <Label>Watch on every screen</Label>
        </div>
        <Row items={CLIENTS} baseSec={1.25} />
      </div>
      <div style={{ width: "100%" }}>
        <div style={{ opacity: labelOp(1.7) }}>
          <Label>Run the Airwave server anywhere</Label>
        </div>
        <Row items={SERVERS} baseSec={1.75} />
      </div>
    </AbsoluteFill>
  );
};
