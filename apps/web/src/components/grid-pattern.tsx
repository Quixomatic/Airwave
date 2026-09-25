import { cn } from "@/lib/utils";

/**
 * A decorative grid background — thin CSS grid lines (layered linear-gradients), optionally faded off with a
 * mask. Reusable: by default it fills its positioned parent (`absolute inset-0`), so wrap the parent in
 * `relative` and put real content above it (positioned / higher z). It can also be sized/anchored via
 * `className` (e.g. `h-[50vh] inset-x-0 top-0`) for a top-of-page hero grid.
 *
 * - `cellSize` — grid cell size in px (default 32).
 * - `lineWidth` — grid line thickness in px (default 1).
 * - `color` — line color; defaults to the theme border token so it's light/dark aware.
 * - `opacity` — overall opacity (default 0.5).
 * - `fade` — mask direction so the grid fades to transparent: "top" (strong at top), "bottom", "left",
 *   "right", "radial" (strong center), or "none" (no fade — covers the whole area). Default "none".
 * - `fadeStop` — where the fade reaches full transparency (default "50%"); e.g. "70%" fades more gently.
 */
export type GridFade = "top" | "bottom" | "left" | "right" | "radial" | "none";

const MASK: Record<GridFade, (stop: string) => string | undefined> = {
  top: (s) => `linear-gradient(to bottom, #000, transparent ${s})`,
  bottom: (s) => `linear-gradient(to top, #000, transparent ${s})`,
  left: (s) => `linear-gradient(to right, #000, transparent ${s})`,
  right: (s) => `linear-gradient(to left, #000, transparent ${s})`,
  radial: (s) => `radial-gradient(ellipse at center, #000, transparent ${s})`,
  none: () => undefined,
};

export function GridPattern({
  className,
  cellSize = 32,
  lineWidth = 1,
  color = "var(--border)",
  opacity = 0.5,
  fade = "none",
  fadeStop = "50%",
}: {
  className?: string;
  cellSize?: number;
  lineWidth?: number;
  color?: string;
  opacity?: number;
  fade?: GridFade;
  fadeStop?: string;
}) {
  const mask = MASK[fade](fadeStop);
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{
        opacity,
        backgroundImage: `linear-gradient(to right, ${color} ${lineWidth}px, transparent ${lineWidth}px), linear-gradient(to bottom, ${color} ${lineWidth}px, transparent ${lineWidth}px)`,
        backgroundSize: `${cellSize}px ${cellSize}px`,
        ...(mask ? { maskImage: mask, WebkitMaskImage: mask } : {}),
      }}
    />
  );
}
