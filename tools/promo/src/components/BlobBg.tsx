import { AbsoluteFill } from "remotion";

// The exact "organic" blob SVG from GuideEngine's SectionBackground (integrations/tiles section),
// recolored to our navy/sky-blue theme. Positioned bottom:0 + translate(-50%, -480px) + blur(208px)
// so the soft U-shaped glow sits near the top, just like GuideEngine.
export const BlobBg: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: 1544,
          height: "auto",
          bottom: 0,
          left: "50%",
          transform: "translate(-50%, -480px)",
          filter: "blur(208px)",
          WebkitFilter: "blur(208px)",
          opacity,
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 1544 1351" style={{ width: "100%", height: "auto", display: "block" }}>
          <path
            fill="url(#airwave-blob)"
            opacity={0.34}
            d="M0 1054.3C0 1636.57 322.24 1181 748.53 1181c426.29 0 795.2 455.57 795.2-126.7C1543.73 472.024 1198.16 0 771.866 0 345.577 0 0 472.024 0 1054.3Z"
          />
          <defs>
            <linearGradient id="airwave-blob" x1="70.358" y1="611.063" x2="1367.96" y2="1223.91" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#4a9fe0" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </AbsoluteFill>
  );
};
