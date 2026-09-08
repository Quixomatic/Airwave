"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { ClipCarousel, type Clip } from "@/components/clip-carousel";

// The uploaded Airwave promo reel on YouTube.
const YT_ID = "RpbLXGi0njk";

/**
 * The YouTube promo (autoplay + looped, BunnyEars-style via youtube-nocookie) with the demo clip reel as the
 * fallback shown underneath until the iframe is ready — so there's never an empty black box while the player
 * boots, and the clips still show if the embed can't load. `muted` defaults on (autoplay-safe); the badge
 * modal opens it unmuted since the click grants autoplay-with-sound activation.
 */
export function HeroPromo({
  clips,
  poster,
  muted = true,
}: {
  clips: Clip[];
  poster?: string;
  muted?: boolean;
}) {
  const [ready, setReady] = useState(false);

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      {/* Fallback: the demo reel, quietly cycling until the promo is up. */}
      <ClipCarousel
        variant="bare"
        poster={poster}
        clips={clips}
        className={cn(
          "absolute inset-0 h-full w-full transition-opacity duration-700",
          ready ? "opacity-0" : "opacity-100",
        )}
      />
      <iframe
        className={cn(
          "absolute inset-0 h-full w-full transition-opacity duration-700",
          ready ? "opacity-100" : "opacity-0",
        )}
        // vq=hd1080 is a best-effort quality hint; YouTube deprecated explicit quality control and mostly
        // decides via bandwidth + player size (the large modal helps more than this param).
        src={`https://www.youtube-nocookie.com/embed/${YT_ID}?autoplay=1&mute=${muted ? 1 : 0}&controls=1&loop=1&playlist=${YT_ID}&playsinline=1&rel=0&cc_load_policy=0&vq=hd1080`}
        title="Airwave promo video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        onLoad={() => setReady(true)}
      />
    </div>
  );
}
