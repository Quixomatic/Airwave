import { Text, View } from "react-native";

/**
 * The guide's own structure as static skeletons behind a centered message — ported from tv-web's
 * GuideGhost. Shown when the (filtered) channel list is empty (fresh install, or an empty
 * favorites/package filter) so the screen reads as "the guide, but empty" rather than a blank.
 */
const GHOST_ROWS = [
  [0.3, 0.32, 0.28],
  [0.46, 0.26, 0.22],
  [0.22, 0.5, 0.24],
  [0.36, 0.3, 0.28],
  [0.5, 0.24, 0.2],
  [0.26, 0.38, 0.3],
];

function GBlock({ w, h, r, style }: { w: number | string; h: number | string; r?: number; style?: object }) {
  return <View style={[{ width: w as number, height: h as number, borderRadius: r ?? 10, backgroundColor: "rgba(148,163,184,0.09)" }, style]} />;
}

export function GuideGhost({
  railPx,
  rowPx,
  laneW,
  vw,
  message,
  sub,
}: {
  railPx: number;
  rowPx: number;
  laneW: number;
  vw: (px: number) => number;
  message: string;
  sub?: string;
}) {
  return (
    <View style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <View style={{ position: "absolute", inset: 0, opacity: 0.55 }}>
        {/* featured-panel ghost */}
        <View style={{ flexDirection: "row", gap: vw(30), paddingVertical: vw(44), paddingHorizontal: vw(48), height: vw(520) }}>
          <GBlock w={vw(64)} h={vw(64)} r={vw(32)} />
          <View style={{ gap: vw(18), flex: 1 }}>
            <GBlock w={vw(560)} h={vw(58)} />
            <GBlock w={vw(320)} h={vw(34)} />
            <GBlock w={vw(820)} h={vw(30)} style={{ marginTop: vw(14) }} />
            <GBlock w={vw(700)} h={vw(30)} />
          </View>
        </View>
        {/* channel-row ghosts */}
        {GHOST_ROWS.map((pattern, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", height: rowPx, gap: vw(12), paddingHorizontal: vw(16) }}>
            <View style={{ width: railPx, flexDirection: "row", alignItems: "center", gap: vw(14) }}>
              <GBlock w={vw(60)} h={vw(60)} r={vw(30)} />
              <GBlock w={vw(52)} h={vw(38)} />
            </View>
            <View style={{ flexDirection: "row", gap: vw(12), flex: 1 }}>
              {pattern.map((f, j) => (
                <GBlock key={j} w={Math.max(1, laneW * f)} h={vw(90)} />
              ))}
            </View>
          </View>
        ))}
      </View>
      {/* centered message */}
      <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", padding: vw(48) }}>
        <Text style={{ fontSize: vw(56), fontWeight: "800", color: "#e2e8f0", textAlign: "center" }}>{message}</Text>
        {sub && <Text style={{ marginTop: vw(16), fontSize: vw(30), color: "#94a3b8", maxWidth: vw(1200), lineHeight: vw(30) * 1.45, textAlign: "center" }}>{sub}</Text>}
      </View>
    </View>
  );
}
