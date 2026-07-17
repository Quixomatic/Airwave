import { useEffect, useRef, useState } from "react";

import { imageUrl, type GuideMeta } from "../../lib/api";

/**
 * The between-programs interstitial ("Coming up next"). The countdown is a donut: an accent
 * ring that DRAINS from full to empty (a pie/loader emptying) with the seconds in the middle,
 * driven off a LOCAL clock (captured end-time) so it stays smooth regardless of server polling.
 *
 * Two variants:
 *  - full (default): full-screen blurred cover art + big title/episode + a large donut.
 *  - compact: a small dark overlay for the MINI feed — just the donut + a short "Up next" blurb
 *    (no art), so a bumper hitting while docked in the guide still shows *something*.
 */

/** Accent ring that empties as `fraction` (time remaining / total) falls 1→0, seconds centered. */
function CountdownDonut({
  sec,
  fraction,
  accent,
  size,
  stroke,
  fontSize,
}: {
  sec: number;
  fraction: number;
  accent: string;
  size: number;
  stroke: number;
  fontSize: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(1, fraction)));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.2s linear" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize,
          fontWeight: 800,
          color: "#fff",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {sec}
      </div>
    </div>
  );
}

export function BumperCard({
  channelId,
  guide,
  remaining,
  accent,
  compact = false,
}: {
  channelId: string;
  guide: GuideMeta | null;
  remaining: number | null;
  accent: string;
  compact?: boolean;
}) {
  const isEpisode = !!guide?.showTitle && guide?.season != null && guide?.episode != null;
  const heading = isEpisode ? guide?.showTitle : guide?.title;
  const episodeLine = isEpisode
    ? `S${guide?.season} · E${guide?.episode}${guide?.title ? ` — ${guide.title}` : ""}`
    : undefined;

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
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, []);

  if (compact) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          background: "linear-gradient(to top, rgba(4,6,12,0.96), rgba(4,6,12,0.88))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 18,
          color: "#f1f5f9",
        }}
      >
        <CountdownDonut sec={sec} fraction={frac} accent={accent} size={54} stroke={5} fontSize={22} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: accent }}>
            Up next
          </div>
          {heading && (
            <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {heading}
            </div>
          )}
        </div>
      </div>
    );
  }

  const bg = imageUrl(channelId, guide?.art ?? guide?.thumb, 1280);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#04060c" }}>
      {bg && (
        <div
          style={{
            position: "absolute",
            inset: -60,
            backgroundImage: `url(${bg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(40px) saturate(1.15)",
            transform: "scale(1.12)",
            opacity: 0.62,
          }}
        />
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(4,6,12,0.86), rgba(4,6,12,0.58))" }} />

      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
          color: "#f1f5f9",
          padding: 60,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: accent }}>
          Coming up next
        </div>
        {heading && <div style={{ fontSize: 64, fontWeight: 800, textAlign: "center", lineHeight: 1.05, maxWidth: 1400 }}>{heading}</div>}
        {episodeLine && <div style={{ fontSize: 28, color: "#c3c9d4", textAlign: "center" }}>{episodeLine}</div>}

        <div style={{ marginTop: 24 }}>
          <CountdownDonut sec={sec} fraction={frac} accent={accent} size={190} stroke={9} fontSize={92} />
        </div>
      </div>
    </div>
  );
}
