import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// GuideEngine's `shadow-glass` is built for a LIGHT page (dark drop-shadows on white). On our dark navy hero
// those shadows vanish and the frame reads flat, so this is the same glass idea re-tuned for a dark backdrop:
// a bright top-edge highlight + a subtle white inner ring for the frosted sheen, plus deep ambient shadows for
// lift where the frame hangs off the panel.
export const GLASS_SHADOW =
  "inset 0 1px 0 0 rgba(255,255,255,0.35), inset 0 0 0 1px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.35), 0 16px 40px rgba(0,0,0,0.45), 0 36px 70px rgba(0,0,0,0.4)";
// A top-lit sheen over the frosted fill (the second half of the glass look on dark).
export const GLASS_SHEEN = "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03))";

/**
 * The frosted-glass media frame — GuideEngine's frame (no macOS traffic lights), re-tuned for the dark
 * backdrop. Wraps whatever media is passed as children in the inner rounded, opaque container.
 */
export function GlassFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("rounded-2xl border border-white/15 backdrop-blur-2xl", className)}
      style={{ boxShadow: GLASS_SHADOW, background: GLASS_SHEEN }}
    >
      <div className="m-2 overflow-hidden rounded-lg bg-fd-background">{children}</div>
    </div>
  );
}
