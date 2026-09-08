"use client";

import { useEffect, useState } from "react";
import { Play, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Clip } from "@/components/clip-carousel";
import { GlassFrame } from "@/components/hero-glass";
import { HeroPromo } from "@/components/hero-promo";

const LABEL = "The live-TV layer for your Plex library.";

/**
 * The hero badge above the title — now a clickable button that opens a modal with the YouTube promo in the
 * glass frame. The promo (a YouTube iframe) is only mounted while the modal is open, so it never loads unless
 * a visitor asks for it. `clips`/`poster` feed the promo's clip fallback until the embed is ready.
 */
export function HeroBadge({
  clips,
  poster,
  className,
}: {
  clips: Clip[];
  poster?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-brand/50 bg-fd-background/50 px-3 py-1.5 text-xs font-medium text-brand backdrop-blur-md transition-colors hover:border-brand hover:bg-fd-background/70",
          className,
        )}
      >
        <Play className="size-2.5 fill-current" />
        {LABEL}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Airwave promo video"
          onClick={() => setOpen(false)}
          className="dark fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <div
            className="relative w-full max-w-[min(1600px,94vw)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute -top-3 -right-3 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/80 text-white transition-colors hover:bg-black"
            >
              <X className="size-4" />
            </button>
            <GlassFrame>
              <HeroPromo clips={clips} poster={poster} muted={false} />
            </GlassFrame>
          </div>
        </div>
      )}
    </>
  );
}
