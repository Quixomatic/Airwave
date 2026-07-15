import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { imageUrl, type GuideMeta } from "../../lib/api";

/**
 * The between-programs interstitial ("Coming up next"). Full-screen blurred cover art of
 * the upcoming program with a heavy dark overlay (always dark), the show/movie title +
 * episode + SxxEyy, and a countdown whose seconds pop-grow with Framer Motion. The
 * countdown runs on a LOCAL clock (captured end-time), reconciling against the server-
 * derived `remaining` only when they drift — so ticks stay smooth regardless of polling.
 */
export function BumperCard({
  channelId,
  guide,
  remaining,
  accent,
}: {
  channelId: string;
  guide: GuideMeta | null;
  remaining: number | null;
  accent: string;
}) {
  const isEpisode = !!guide?.showTitle && guide?.season != null && guide?.episode != null;
  const heading = isEpisode ? guide?.showTitle : guide?.title;
  const episodeLine = isEpisode
    ? `S${guide?.season} · E${guide?.episode}${guide?.title ? ` — ${guide.title}` : ""}`
    : undefined;
  const bg = imageUrl(channelId, guide?.art ?? guide?.thumb, 1280);

  // Local smooth countdown; reconcile the captured end-time only on real drift (>1s).
  const endRef = useRef(Date.now() + (remaining ?? 0) * 1000);
  const [sec, setSec] = useState(remaining ?? 0);
  useEffect(() => {
    if (remaining == null) return;
    const localRemaining = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
    if (Math.abs(localRemaining - remaining) > 1) endRef.current = Date.now() + remaining * 1000;
  }, [remaining]);
  useEffect(() => {
    const id = setInterval(() => setSec(Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000))), 200);
    return () => clearInterval(id);
  }, []);

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
            filter: "blur(48px) saturate(1.15)",
            transform: "scale(1.12)",
            opacity: 0.5,
          }}
        />
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(4,6,12,0.94), rgba(4,6,12,0.74))" }} />

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

        <div style={{ marginTop: 24, position: "relative", height: 150, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AnimatePresence mode="popLayout">
            <motion.div
              key={sec}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 20 }}
              style={{ position: "absolute", fontSize: 124, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums", textShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
            >
              {sec}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
