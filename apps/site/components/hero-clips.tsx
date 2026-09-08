"use client";

import { useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Clip } from "@/components/clip-carousel";
import { GlassFrame } from "@/components/hero-glass";

/**
 * The hero media: the demo clip reel inside the glass frame, with a story-style segmented progress indicator
 * just below the frame and a small circular play/pause button to its right. Autoplaying + muted; each clip
 * advances when it ends. `className` positions the whole unit; `frameClassName` tweaks the frame itself.
 */
export function HeroClipReel({
  clips,
  poster,
  className,
  frameClassName,
}: {
  clips: Clip[];
  poster?: string;
  className?: string;
  frameClassName?: string;
}) {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const go = (i: number) => {
    setProgress(0);
    setActive(((i % clips.length) + clips.length) % clips.length);
  };

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  };

  return (
    <div className={className}>
      <GlassFrame className={frameClassName}>
        {/* key={active} remounts the video on slide change so the new clip restarts (+ autoplays unless paused). */}
        <video
          key={active}
          ref={videoRef}
          src={clips[active].src}
          poster={poster}
          autoPlay={!paused}
          muted
          playsInline
          preload="auto"
          aria-hidden
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress(v.currentTime / v.duration);
          }}
          onEnded={() => go(active + 1)}
          className="aspect-video w-full bg-black object-cover"
        />
      </GlassFrame>

      {/* Controls just below the frame: segmented progress dots + a circular play/pause to their right. */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <div className="flex items-center gap-2">
          {clips.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={c.label ?? c.title ?? `Clip ${i + 1}`}
              aria-current={i === active}
              className="flex h-4 cursor-pointer items-center"
            >
              <span
                className={cn(
                  "h-1.5 overflow-hidden rounded-full bg-fd-muted-foreground/30 transition-[width] duration-300",
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
          ))}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={paused ? "Play" : "Pause"}
          className="flex size-4 cursor-pointer items-center justify-center rounded-full text-fd-muted-foreground transition-colors hover:text-fd-foreground"
        >
          {paused ? (
            <Play className="size-2.5 translate-x-px fill-current" strokeWidth={0} />
          ) : (
            <Pause className="size-2.5 fill-current" strokeWidth={0} />
          )}
        </button>
      </div>
    </div>
  );
}
