import { motion } from "framer-motion";

/**
 * The Airwave brand mark (+ optional wordmark), adapted from the admin's `Logo` for the standalone setup app.
 * Reads `/logo.png` from `public/`. The wordmark uses `currentColor` so it inherits the surrounding text color.
 */
export function Logo({
  markWidth = 200,
  wordmark = false,
  animate = false,
}: {
  markWidth?: number;
  wordmark?: boolean;
  animate?: boolean;
}) {
  const mark = (
    <motion.img
      src="/logo.png"
      alt="Airwave"
      style={{ width: markWidth, height: "auto", objectFit: "contain", display: "block" }}
      initial={animate ? { opacity: 0, scale: 0.82 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    />
  );
  if (!wordmark) return mark;

  const letters = [..."Airwave"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(markWidth * 0.16) }}>
      {mark}
      <div
        style={{
          display: "flex",
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: "currentColor",
          fontSize: Math.round(markWidth * 0.66),
          lineHeight: 1,
        }}
      >
        {letters.map((ch, i) => (
          <motion.span
            key={i}
            style={{ display: "inline-block", whiteSpace: "pre" }}
            initial={animate ? { opacity: 0, y: "0.35em" } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: animate ? 0.35 + i * 0.055 : 0, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {ch}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
