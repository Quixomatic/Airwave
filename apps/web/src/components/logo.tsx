import { motion } from "framer-motion";

import { APP_NAME } from "@/lib/app-info";

/**
 * The Airwave brand mark (cloud + wave), optionally with the wordmark — ported from tv-web's `Logo`.
 * Unlike the TV version (always white on a dark app), the admin is light/dark theme-aware, so the wordmark
 * uses `currentColor` (inherits the surrounding foreground) instead of a hardcoded white.
 *
 * - `markWidth` — the mark's width in px (height keeps the native 715×517 aspect).
 * - `wordmark` — also render "Airwave" beside / under the mark.
 * - `layout` — `"row"` puts the wordmark beside the mark (default), `"column"` stacks it underneath.
 * - `animate` — play a staggered entrance on mount: the mark fades + scales in, then the wordmark letters
 *   cascade in one by one. Off by default (static) — turn it on where you want the flourish (login).
 *
 * Reads `/logo.png` from `public/`.
 */
export function Logo({
  markWidth = 200,
  wordmark = false,
  layout = "row",
  animate = false,
}: {
  markWidth?: number;
  wordmark?: boolean;
  layout?: "row" | "column";
  animate?: boolean;
}) {
  const mark = (
    <motion.img
      src="/logo.png"
      alt=""
      style={{ width: markWidth, height: "auto", objectFit: "contain", display: "block" }}
      initial={animate ? { opacity: 0, scale: 0.82 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    />
  );
  if (!wordmark) return mark;

  const row = layout === "row";
  const letters = [...APP_NAME];
  // The mark takes ~0.4s; start the letters just before it settles so they cascade out of it.
  const LETTER_START = 0.35;
  const LETTER_STEP = 0.055;

  return (
    <div style={{ display: "flex", flexDirection: row ? "row" : "column", alignItems: "center", gap: Math.round(markWidth * 0.16) }}>
      {mark}
      <div style={{ display: "flex", fontWeight: 700, letterSpacing: "-0.01em", color: "currentColor", fontSize: Math.round(markWidth * 0.66), lineHeight: 1 }}>
        {letters.map((ch, i) => (
          <motion.span
            key={i}
            style={{ display: "inline-block", whiteSpace: "pre" }}
            initial={animate ? { opacity: 0, y: "0.35em" } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: animate ? LETTER_START + i * LETTER_STEP : 0, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {ch}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
