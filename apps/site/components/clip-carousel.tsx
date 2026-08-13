"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export type Clip = { src: string; label?: string; title?: string; subtitle?: string };

/**
 * A timed clip carousel with a story-style segmented progress indicator (Instagram/Apple style): the active
 * segment is a little bar that fills as the clip plays, the others are dots. Advances automatically when each
 * clip ends (so the bar tracks each clip's real length); click a segment to jump. Autoplaying + muted.
 *
 * Two layouts:
 * - `bar` (default): just the player, with the indicator centered underneath.
 * - `split`: one wide box — ~60% player on the left, the active clip's title/subtitle (+ the indicator) on
 *   the right, so the copy narrates whatever's playing.
 */
export function ClipCarousel({
  clips,
  className,
  variant = "bar",
  poster,
}: {
  clips: Clip[];
  className?: string;
  variant?: "bar" | "split" | "bare";
  /** A fallback image shown until the clips are ready (and between remounts) — used by the `bare` variant. */
  poster?: string;
}) {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);

  const go = (i: number) => {
    setProgress(0);
    setActive(((i % clips.length) + clips.length) % clips.length);
  };

  // `bare`: no chrome — a decorative background loop. The poster is the fallback until a clip is ready; then
  // it quietly cycles through them. `className` positions/styles the element (it IS the video).
  if (variant === "bare") {
    return (
      <video
        key={active}
        src={clips[active].src}
        poster={poster}
        autoPlay
        muted
        playsInline
        preload="auto"
        aria-hidden
        onEnded={() => go(active + 1)}
        className={cn("aspect-video object-cover", className)}
      />
    );
  }

  // key={active} remounts the video on slide change so the new clip restarts + autoplays.
  const video = (
    <video
      key={active}
      src={clips[active].src}
      autoPlay
      muted
      playsInline
      preload="auto"
      aria-label={clips[active].label ?? clips[active].title}
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        if (v.duration) setProgress(v.currentTime / v.duration);
      }}
      onEnded={() => go(active + 1)}
      // Fixed 16:9 box reserves the height even while the next clip loads, so remounting on each slide
      // change never collapses the element and shifts the page layout.
      className="aspect-video w-full bg-black object-cover"
    />
  );

  const segments = clips.map((c, i) => (
    <button
      key={i}
      type="button"
      onClick={() => go(i)}
      aria-label={c.title ?? c.label ?? `Clip ${i + 1}`}
      aria-current={i === active}
      className="flex h-4 items-center"
    >
      <span
        className={cn(
          "h-1.5 overflow-hidden rounded-full bg-fd-muted-foreground/25 transition-[width] duration-300",
          i === active ? "w-10" : "w-1.5",
        )}
      >
        {i === active && (
          <span
            className="block h-full rounded-full bg-brand transition-[width] duration-200 ease-linear"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        )}
      </span>
    </button>
  ));

  if (variant === "split") {
    const cur = clips[active];
    return (
      <div className={cn("overflow-hidden rounded-2xl border bg-fd-card shadow-lg", className)}>
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr]">
          <div className="bg-black/30">{video}</div>
          <div className="flex flex-col justify-center gap-8 p-8 lg:p-10">
            {/* key={active} re-triggers the fade on each slide change */}
            <div key={active} className="animate-fd-fade-in">
              <h3 className="text-lg leading-tight font-medium text-fd-foreground lg:text-2xl">
                {cur.title ?? cur.label}
              </h3>
              {cur.subtitle && (
                <p className="mt-3 text-sm text-fd-muted-foreground lg:text-base">{cur.subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2">{segments}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="overflow-hidden rounded-xl border-2 border-fd-border shadow-lg">{video}</div>
      <div className="mt-4 flex items-center justify-center gap-2">{segments}</div>
    </div>
  );
}
