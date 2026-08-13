"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * The "one app, three screens" preview switcher — a small framed screenshot (guide / playback chrome /
 * bumper) with a segmented control straddling its bottom edge (half over the frame, half below). The shader
 * backgrounds live in `@/components/shaders`.
 */
export function PreviewImages() {
  const [active, setActive] = useState(0);
  const previews = [
    { src: "/screenshots/appletv-guide.webp", name: "Guide" },
    { src: "/screenshots/appletv-fullchrome.webp", name: "Playing" },
    { src: "/screenshots/appletv-bumper.webp", name: "Bumper" },
  ];

  // pb reserves room so the control's lower half isn't clipped by whatever sits below.
  return (
    <div className="relative w-full pb-7">
      <div className="relative w-full rounded-2xl border border-fd-border bg-fd-card/40 p-2 shadow-lg">
        <div className="grid w-full overflow-hidden rounded-xl">
          {previews.map((item, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={item.name}
              src={item.src}
              alt={`Airwave — ${item.name}`}
              className={cn(
                "col-start-1 row-start-1 w-full select-none transition-opacity duration-500",
                active === i ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            />
          ))}
        </div>

        {/* Segmented control straddling the frame's bottom edge. */}
        <div className="absolute inset-x-0 bottom-0 flex translate-y-1/2 justify-center">
          <div className="relative isolate flex flex-row rounded-full border bg-fd-card p-1 shadow-xl">
            <div
              role="none"
              aria-hidden
              className="absolute z-[-1] h-9 w-24 rounded-full bg-fd-primary transition-transform"
              style={{ transform: `translateX(calc(6rem * ${active}))` }}
            />
            {previews.map((item, i) => (
              <button
                key={item.name}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "h-9 w-24 rounded-full text-sm font-medium transition-colors",
                  active === i ? "text-fd-primary-foreground" : "text-fd-muted-foreground",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
