import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { card } from "@/components/landing";

export type BentoItem = {
  /** Optional small uppercase label above the title (plezy's `.card-eyebrow`). */
  eyebrow?: string;
  title: string;
  /** The copy under the title. Optional — some cards are mostly mockup. */
  body?: string;
  /**
   * Title size. `"lg"` = the big hero title (plezy's `.card-title.large`, a fluid clamp); `"md"` (default)
   * = the compact small-card title (~17px, the section-title face). Override further with `titleClassName`.
   */
  titleSize?: "lg" | "md";
  /** Per-card class override merged onto the title (win over the size variant). */
  titleClassName?: string;
  /** Per-card class override merged onto the body/caption. */
  bodyClassName?: string;
  /**
   * A bespoke mock/visual for the card (a channel-guide skeleton, format chips, a scrubber, …). It sits
   * below the copy and grows to fill the card's remaining height; a mock can bleed past the card edges
   * (the card clips + can mask it). Omit for a text-only tile.
   */
  content?: ReactNode;
  /**
   * lg-and-up placement/size classes for the bento, e.g. `"lg:col-start-1 lg:col-span-2 lg:row-start-1
   * lg:row-span-2"` (a 2x2 hero) or `"lg:col-start-1 lg:col-span-4 lg:row-start-4"` (a full-width banner).
   * Omit for a 1x1. Below lg these don't apply and tiles flow in array order.
   */
  span?: string;
  /**
   * lg corner-radius override. Only the four tiles at the bento's outer corners get the full radius on that
   * corner; inner corners are `lg:rounded-md`. Applied at lg only (tiles stack with normal rounding below).
   */
  radius?: string;
  /** Background override for subtle variation between sub-cards, e.g. `"bg-fd-secondary"`. */
  bg?: string;
  /** When set, the whole tile is a link to this href. */
  href?: string;
  /** Optional call-to-action shown at the bottom of a linked tile (defaults to "Learn more"). */
  cta?: string;
};

// Title size variants. `lg` mirrors plezy's `.card-title.large` (fluid clamp, tight line-height, capped
// width); `md` mirrors their default `.card-title` (~17px). Both use the section-title display face.
const TITLE = {
  lg: "font-display font-bold tracking-[-0.02em] leading-none text-[clamp(1.5rem,3vw,2.25rem)] max-w-[16ch] mb-3",
  md: "font-display font-bold tracking-tight leading-snug text-[1.0625rem] mb-1",
} as const;

/**
 * A bento grid (plezy-style): a stack on mobile, two columns at sm, and a 4-column grid at lg where tiles
 * take different spans via each item's `span` classes. Row heights are **content-driven** (no fixed row
 * track sizes): each grid row sizes to the tallest card in it and cards stretch to fill, so the layout
 * shapes itself around each card's mock content — a tall hero mock makes its rows tall, a short banner row
 * stays short. Cards clip their overflow so a mock can bleed past an edge (and mask itself soft).
 */
export function Bento({
  items,
  className,
  bordered = true,
}: {
  items: BentoItem[];
  className?: string;
  /** Draw each card's border. Off = borderless (tiles separated by background only). */
  bordered?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-1", className)}>
      {items.map((it) => {
        // Body size follows the title variant (plezy: hero copy 14px, small-card caption 12px), overridable.
        const bodyCls = it.titleSize === "lg" ? "text-sm leading-relaxed" : "text-xs leading-snug";
        const inner = (
          <>
            {it.eyebrow ? (
              <p className="mb-2 text-[0.6875rem] font-bold tracking-[0.05em] text-fd-muted-foreground uppercase">
                {it.eyebrow}
              </p>
            ) : null}
            <h3 className={cn(TITLE[it.titleSize ?? "md"], "text-fd-foreground", it.titleClassName)}>
              {it.title}
            </h3>
            {it.body ? (
              <p className={cn("text-fd-muted-foreground", bodyCls, it.bodyClassName)}>{it.body}</p>
            ) : null}
            {it.content ? <div className="mt-4 min-h-0 flex-1">{it.content}</div> : null}
            {it.href ? (
              <span className="mt-auto pt-4 text-sm font-medium text-brand group-hover:underline">
                {it.cta ?? "Learn more"} →
              </span>
            ) : null}
          </>
        );
        const cls = cn(
          card(),
          "relative flex h-full flex-col overflow-hidden",
          !bordered && "!border-0",
          it.bg,
          it.radius,
          it.href && "group transition-colors hover:border-brand/50",
          it.span,
        );
        return it.href ? (
          <Link key={it.title} href={it.href} className={cls}>
            {inner}
          </Link>
        ) : (
          <div key={it.title} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
