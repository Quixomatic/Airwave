import { Fragment, type ComponentType } from "react";
import { Link, useMatches } from "@tanstack/react-router";

import {
  TintedIconTile,
  type TintedIconTileTint,
} from "@ChannelGuide/ui/components/tinted-icon-tile";

import { useBreadcrumbOverride } from "@/context/breadcrumb-provider";

// Augment TanStack's per-route `staticData` so `breadcrumb` + icon metadata are typed.
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    breadcrumb?: string;
    /** Icon shown to the LEFT of the first breadcrumb — same tile + tint as the
     * sidebar nav entry for this section. */
    breadcrumbIcon?: ComponentType<{ className?: string }>;
    breadcrumbTint?: TintedIconTileTint;
  }
}

/**
 * Renders the active route chain as "Section / Subsection / Page". Pulls labels
 * from each matched route's `staticData.breadcrumb`, with the deepest route's
 * label optionally overridden via `useBreadcrumb(...)` for async-derived labels.
 * The last segment is plain text (current location); earlier segments are Links.
 */
export function Breadcrumbs() {
  const matches = useMatches();
  const override = useBreadcrumbOverride();

  const crumbs = matches
    .filter((m) => m.staticData?.breadcrumb !== undefined)
    .map((m) => ({
      id: m.id,
      label:
        override?.matchId === m.id ? override.label : (m.staticData.breadcrumb as string),
      to: m.pathname,
    }));

  if (crumbs.length === 0) return null;

  const iconMatch = matches.find((m) => m.staticData?.breadcrumbIcon);
  const SectionIcon = iconMatch?.staticData?.breadcrumbIcon;
  const sectionTint = iconMatch?.staticData?.breadcrumbTint;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm font-medium">
      {SectionIcon && <TintedIconTile icon={SectionIcon} tint={sectionTint ?? "gray"} size="md" />}
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <Fragment key={c.id}>
            {i > 0 && (
              <span className="text-muted-foreground mx-0.5" aria-hidden>
                /
              </span>
            )}
            {isLast ? (
              <span>{c.label}</span>
            ) : (
              <Link
                to={c.to}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {c.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
