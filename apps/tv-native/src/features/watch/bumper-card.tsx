import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Image, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { imageUrl, type GuideMeta } from "@/lib/api";

/**
 * The between-programs interstitial ("Coming up next") — a mechanical port of tv-web's `bumper-card`.
 * The countdown is a donut: an accent ring that DRAINS from full to empty with the seconds centered,
 * driven off a LOCAL clock (captured end-time) so it stays smooth regardless of server polling.
 *
 *  - full (default): full-screen blurred cover art + big title/episode + a large donut.
 *  - compact: a small dark overlay for the MINI feed — just the donut + a short "Up next" blurb.
 */

/** Accent ring that empties as `fraction` (time remaining / total) falls 1→0, seconds centered. */
function CountdownDonut({ sec, fraction, accent, size, stroke, fontSize }: { sec: number; fraction: number; accent: string; size: number; stroke: number; fontSize: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(1, fraction)));
  return (
    <View style={{ width: size, height: size, flexShrink: 0 }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} />
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accent} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
      </Svg>
      <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize, fontWeight: "800", color: "#fff", fontVariant: ["tabular-nums"] }}>{sec}</Text>
      </View>
    </View>
  );
}

export function BumperCard({ channelId, guide, remaining, accent, compact = false }: { channelId: string; guide: GuideMeta | null; remaining: number | null; accent: string; compact?: boolean }) {
  const isEpisode = !!guide?.showTitle && guide?.season != null && guide?.episode != null;
  const heading = isEpisode ? guide?.showTitle : guide?.title;
  const episodeLine = isEpisode ? `S${guide?.season} · E${guide?.episode}${guide?.title ? ` — ${guide.title}` : ""}` : undefined;

  // Local smooth countdown; reconcile the captured end-time only on real drift (>1s). `totalRef`
  // captures the bumper's full length (the largest remaining seen) so the donut drains from full.
  const endRef = useRef(Date.now() + (remaining ?? 0) * 1000);
  const totalRef = useRef(Math.max(1, remaining ?? 0));
  const [sec, setSec] = useState(remaining ?? 0);
  const [frac, setFrac] = useState(1);
  useEffect(() => {
    if (remaining == null) return;
    const localRemaining = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
    if (Math.abs(localRemaining - remaining) > 1) endRef.current = Date.now() + remaining * 1000;
    if (remaining > totalRef.current) totalRef.current = remaining;
  }, [remaining]);
  useEffect(() => {
    const tick = () => {
      const remS = Math.max(0, (endRef.current - Date.now()) / 1000);
      setSec(Math.ceil(remS));
      setFrac(totalRef.current > 0 ? remS / totalRef.current : 0);
    };
    tick();
    // 80ms (vs tv-web's 200ms + CSS transition) so the ring drains smoothly without a transition API.
    const id = setInterval(tick, 80);
    return () => clearInterval(id);
  }, []);

  if (compact) {
    return (
      <LinearGradient colors={["rgba(4,6,12,0.88)", "rgba(4,6,12,0.96)"]} style={{ position: "absolute", inset: 0, overflow: "hidden", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, padding: 18 }}>
        <CountdownDonut sec={sec} fraction={frac} accent={accent} size={54} stroke={5} fontSize={22} />
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", color: accent }}>Up next</Text>
          {heading && (
            <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: "700", lineHeight: 21, color: "#f1f5f9" }}>
              {heading}
            </Text>
          )}
        </View>
      </LinearGradient>
    );
  }

  const bg = imageUrl(channelId, guide?.art ?? guide?.thumb, 1280);
  return (
    <View style={{ position: "absolute", inset: 0, overflow: "hidden", backgroundColor: "#04060c" }}>
      {bg && <Image source={{ uri: bg }} blurRadius={40} resizeMode="cover" style={{ position: "absolute", top: -60, left: -60, right: -60, bottom: -60, opacity: 0.62, transform: [{ scale: 1.12 }] }} />}
      <LinearGradient colors={["rgba(4,6,12,0.58)", "rgba(4,6,12,0.86)"]} style={{ position: "absolute", inset: 0 }} />

      <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", gap: 22, padding: 60 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", letterSpacing: 4, textTransform: "uppercase", color: accent }}>Coming up next</Text>
        {heading && (
          <Text style={{ fontSize: 64, fontWeight: "800", textAlign: "center", lineHeight: 67, color: "#f1f5f9", maxWidth: 1400 }}>
            {heading}
          </Text>
        )}
        {episodeLine && <Text style={{ fontSize: 28, color: "#c3c9d4", textAlign: "center" }}>{episodeLine}</Text>}
        <View style={{ marginTop: 24 }}>
          <CountdownDonut sec={sec} fraction={frac} accent={accent} size={190} stroke={9} fontSize={92} />
        </View>
      </View>
    </View>
  );
}
