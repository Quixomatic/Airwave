import type React from "react";
import { cn } from "@ChannelGuide/ui/lib/utils";

export function Skeleton({
  className,
  animate = true,
  ...props
}: React.ComponentProps<"div"> & {
  /** Set false for a cheap static placeholder (no shimmer) — the animated gradient uses a
   *  `fixed`-attachment background that gets expensive across many elements. */
  animate?: boolean;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "rounded-sm",
        animate
          ? "animate-skeleton [--skeleton-highlight:--alpha(var(--color-white)/64%)] [background:linear-gradient(120deg,transparent_40%,var(--skeleton-highlight),transparent_60%)_var(--color-muted)_0_0/200%_100%_fixed] dark:[--skeleton-highlight:--alpha(var(--color-white)/4%)]"
          : "bg-muted",
        className,
      )}
      data-slot="skeleton"
      {...props}
    />
  );
}
