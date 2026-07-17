import { motion } from "framer-motion";
import * as LucideIcons from "lucide-react";
import { History, ListFilter, Menu, Settings as SettingsIcon, Star, User } from "lucide-react";
import React, { useEffect, useRef } from "react";

import type { Package } from "../../lib/api";
import { C } from "../../lib/theme";
import { accentVivid } from "../../lib/tint";
import { GlassCircleButton } from "../watch/glass-button";

/**
 * The guide's left sidebar — a collapsed sliver of glass circle buttons that expands (PUSHING the
 * grid over, not overlaying) when D-pad focus enters it.
 *
 * Collapsed it stays deliberately quiet: the **actions** (Guide / Settings / Account) plus a SINGLE
 * "Filters" circle standing in for the whole filter group (lit in the active filter's accent when
 * one is applied). Focus it and the real **lenses** — Favorites, Recents, then each channel package
 * in its own tint + icon — fade in, staggered. The filter list scrolls (a full package list is
 * taller than the screen) and keeps the focused item in view.
 *
 * AuroraGrid owns the keyboard/zone machine and drives this via `sel` (index into `items`), `lens`
 * (active), and `onActivate(index)`. Focused ⇒ expanded, so the flat `items` list is always what's
 * navigable. See `.plans/tv-sidebar.md`.
 */

/** Which channels the grid is showing. `packages.ids` is a set so multi-select is a trivial later
 *  extension (the sidebar selects one at a time for now). */
export type Lens =
  | { type: "all" }
  | { type: "favorites" }
  | { type: "recents" }
  | { type: "packages"; ids: string[] };

export type SidebarItem = {
  key: string;
  label: string;
  /** Muted second line under the label (a package's channel count). */
  sublabel?: string;
  icon: React.ReactNode;
  /** For a lens item — selecting it applies this lens. Actions (settings/account) have none. */
  lens?: Lens;
  kind: "settings" | "account" | "lens";
  /** `action` = always-visible top group; `filter` = the lens group that folds into one circle
   *  when collapsed and stagger-reveals when focused. */
  group: "action" | "filter";
  /** Accent color (a package's own tint); defaults to the blue focus color. */
  accent?: string;
};

const LU = LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>;
function pkgIcon(id: string | null): React.ReactNode {
  const Comp = id && id.startsWith("lucide:") ? (LU[id.slice(7)] ?? LucideIcons.Folder) : LucideIcons.Folder;
  return <Comp size={24} />;
}

/** The flat, D-pad-indexable item list (actions first, then filters). Built from the package list;
 *  AuroraGrid uses it to bound the selection and to know what each index does on activate. */
export function buildSidebarItems(packages: Package[]): SidebarItem[] {
  return [
    { key: "guide", label: "Guide", icon: <Menu size={24} />, kind: "lens", lens: { type: "all" }, group: "action" },
    { key: "settings", label: "Settings", icon: <SettingsIcon size={24} />, kind: "settings", group: "action" },
    { key: "account", label: "Account", icon: <User size={24} />, kind: "account", group: "action" },
    { key: "favorites", label: "Favorites", icon: <Star size={24} />, kind: "lens", lens: { type: "favorites" }, group: "filter" },
    { key: "recents", label: "Recents", icon: <History size={24} />, kind: "lens", lens: { type: "recents" }, group: "filter" },
    ...packages.map<SidebarItem>((p) => ({
      key: `pkg:${p.id}`,
      label: p.name,
      sublabel: `${p.channelCount} ${p.channelCount === 1 ? "channel" : "channels"}`,
      icon: pkgIcon(p.icon),
      kind: "lens",
      lens: { type: "packages", ids: [p.id] },
      group: "filter",
      // Small circle → the VIVID swatch (the sidebar is where the saturated value belongs).
      accent: accentVivid(p.tint),
    })),
  ];
}

/** Whether item lens `a` is the currently-active lens `b` (drives the persistent lit indicator). */
export function lensEquals(a: Lens | undefined, b: Lens): boolean {
  if (!a || a.type !== b.type) return false;
  if (a.type === "packages" && b.type === "packages") {
    return a.ids.length === b.ids.length && a.ids.every((id) => b.ids.includes(id));
  }
  return true;
}

/**
 * The sliver width. This is the ONLY width the sidebar occupies in the layout — the guide reserves
 * exactly this much and never moves. Expanding is a pure **overlay** (the sidebar is absolutely
 * positioned and just grows over the guide), so the layout never shifts and the program blocks /
 * time axis are never reflowed or smooshed.
 */
export const SIDEBAR_SLIVER_W = 92;
const EXPANDED_W = 300;

export function GuideSidebar({
  items,
  expanded,
  focused,
  sel,
  lens,
  onActivate,
}: {
  items: SidebarItem[];
  expanded: boolean;
  focused: boolean;
  sel: number;
  lens: Lens;
  onActivate: (index: number) => void;
}) {
  const actions = items.filter((i) => i.group === "action");
  const filters = items.filter((i) => i.group === "filter");
  // The applied filter (if any) — colors the collapsed stand-in circle so you can see a filter's on.
  const activeFilter = filters.find((f) => f.lens && lensEquals(f.lens, lens));
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Keep the focused circle in view — the package list is taller than the screen.
  useEffect(() => {
    if (!focused) return;
    itemRefs.current[sel]?.scrollIntoView({ block: "nearest" });
  }, [sel, focused]);

  return (
    <motion.div
      initial={false}
      animate={{
        width: expanded ? EXPANDED_W : SIDEBAR_SLIVER_W,
        // Collapsed uses the SAME shadow at zero alpha (rather than "none") so Framer can
        // interpolate it — it fades in/out with the width instead of snapping.
        boxShadow: expanded ? "24px 0px 60px rgba(0,0,0,0.5)" : "24px 0px 60px rgba(0,0,0,0)",
      }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      style={{
        // An OVERLAY: pinned to the left edge, out of flow, growing over the guide. The layout
        // reserves only SIDEBAR_SLIVER_W, so nothing shifts or reflows when this expands.
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "24px 18px",
        // A surface lifted just off the grid backdrop, so the sidebar reads as chrome.
        background: C.sidebarBg,
        borderRight: `1px solid ${C.border}`,
        zIndex: 25,
      }}
    >
      {actions.map((it, i) => (
        <div key={it.key} ref={(el) => void (itemRefs.current[i] = el)} style={{ flexShrink: 0 }}>
          <GlassCircleButton
            icon={it.icon}
            label={it.label}
            expanded={expanded}
            focused={focused && sel === i}
            active={it.lens ? lensEquals(it.lens, lens) : false}
            accent={it.accent}
            onClick={() => onActivate(i)}
          />
        </div>
      ))}

      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0", flexShrink: 0 }} />

      <div
        className="cg-grid-scroll"
        // `overflow-y: auto` makes this a scroll container on BOTH axes, which clipped each circle's
        // focus ring (a 2px box-shadow drawn OUTSIDE the circle) against the left edge, and the
        // top/bottom for the first/last item. Pad the scroll box so the ring has room, then pull
        // that padding back out with a negative margin so the circles stay aligned with the
        // actions above (which aren't in a scroll box, hence why only this list clipped).
        // `scrollPadding` is what saves the FIRST/LAST item: scrollIntoView({block:"nearest"})
        // otherwise scrolls the item flush to the edge — straight past that padding — shaving the
        // ring. scroll-padding makes it leave the clearance instead.
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          margin: "0 -6px",
          padding: 6,
          scrollPadding: 6,
        }}
      >
        {expanded ? (
          filters.map((it, i) => {
            const idx = actions.length + i;
            return (
              <motion.div
                key={it.key}
                ref={(el) => void (itemRefs.current[idx] = el)}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03 * i, duration: 0.18 }}
                style={{ flexShrink: 0 }}
              >
                <GlassCircleButton
                  icon={it.icon}
                  label={it.label}
                  sublabel={it.sublabel}
                  expanded
                  focused={focused && sel === idx}
                  active={it.lens ? lensEquals(it.lens, lens) : false}
                  accent={it.accent}
                  onClick={() => onActivate(idx)}
                />
              </motion.div>
            );
          })
        ) : (
          // Collapsed: the whole filter group folds into one circle so the sliver stays quiet.
          <div style={{ flexShrink: 0 }}>
            <GlassCircleButton
              icon={<ListFilter size={24} />}
              title="Filters"
              expanded={false}
              active={!!activeFilter}
              accent={activeFilter?.accent}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
