"use client";

import { useInView } from "framer-motion";
import { useEffect, useRef, type ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * A demo clip that plays itself into view: it starts once when it first scrolls in (Framer Motion's
 * `useInView`), pauses when it scrolls out, and never auto-replays after that — you replay it by hovering or
 * focusing it. Silent + not looping (that's the carousel's job). Keeps a wall of clips from all playing at
 * once and lets the reader re-watch a specific one on demand.
 */
/** The fraction of the clip to rest on when idle/finished — a representative middle frame beats the last
 * frame, which is rarely a useful place to stop. */
const REST_FRACTION = 0.5;

export function InViewVideo({
  src,
  className,
  ...rest
}: ComponentProps<"video"> & { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const hasPlayed = useRef(false);

  const seekRest = () => {
    const v = ref.current;
    if (v && Number.isFinite(v.duration)) v.currentTime = v.duration * REST_FRACTION;
  };

  const play = () => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play().catch(() => {});
  };

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (inView) {
      if (!hasPlayed.current) {
        hasPlayed.current = true;
        play();
      }
    } else {
      v.pause();
    }
  }, [inView]);

  return (
    <video
      ref={ref}
      src={src}
      muted
      playsInline
      preload="metadata"
      tabIndex={0}
      // Rest on the middle frame before it first plays and after it finishes.
      onLoadedMetadata={() => {
        if (!hasPlayed.current) seekRest();
      }}
      onEnded={seekRest}
      onMouseEnter={play}
      onFocus={play}
      className={cn("w-full rounded-xl border border-fd-border shadow-lg outline-none", className)}
      {...rest}
    />
  );
}
