import { AnimatePresence, motion } from "framer-motion";
import * as LucideIcons from "lucide-react";
import { History, LayoutGrid, ListFilter, Menu, Settings as SettingsIcon, Star, User } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import type { Package } from "../../lib/api";
import { C } from "../../lib/theme";
import { accentVivid } from "../../lib/tint";

/**
 * The guide's left sidebar.
 *
 * ## Desktop REBUILD (not a faithful port)
 * tv-web/tv-native's sidebar is a full-height glass column butted against the rails, sized huge for a
 * 10-foot D-pad UI. This is a normal desktop sidebar: a **floating, inset panel** (offset from
 * top/bottom/left with a gap from the grid, rounded corners) that **collapses to a slim rail and
 * expands on hover** (mouse) — or on keyboard focus (the grid's zone machine still drives it). The
 * DATA MODEL is kept identical to tv-web (`buildSidebarItems` / `Lens` / `lensEquals`) so the grid's
 * driving code ports unchanged; only the visual component is new.
 */

/** Which channels the grid is showing. */
export type Lens =
  | { type: "all" }
  | { type: "favorites" }
  | { type: "recents" }
  | { type: "packages"; ids: string[] };

export type SidebarItem = {
  key: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  lens?: Lens;
  kind: "settings" | "account" | "lens";
  group: "action" | "filter" | "footer";
  accent?: string;
};

const LU = LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>;
function pkgIcon(id: string | null): React.ReactNode {
  const Comp = id && id.startsWith("lucide:") ? (LU[id.slice(7)] ?? LucideIcons.Folder) : LucideIcons.Folder;
  return <Comp size={20} />;
}

/** The flat item list (actions first, then filters). Identical to tv-web — the grid uses it to bound
 *  the selection and know what each index does. A "Show All" filter is prepended when a filter's on. */
export function buildSidebarItems(packages: Package[], lens: Lens): SidebarItem[] {
  const filtered = lens.type !== "all";
  return [
    { key: "guide", label: "Guide", icon: <Menu size={20} />, kind: "lens", lens: { type: "all" }, group: "action" },
    { key: "settings", label: "Settings", icon: <SettingsIcon size={20} />, kind: "settings", group: "action" },
    { key: "account", label: "Account", icon: <User size={20} />, kind: "account", group: "action" },
    { key: "favorites", label: "Favorites", icon: <Star size={20} />, kind: "lens", lens: { type: "favorites" }, group: "filter" },
    { key: "recents", label: "Recents", icon: <History size={20} />, kind: "lens", lens: { type: "recents" }, group: "filter" },
    ...packages.map<SidebarItem>((p) => ({
      key: `pkg:${p.id}`,
      label: p.name,
      sublabel: `${p.channelCount} ${p.channelCount === 1 ? "channel" : "channels"}`,
      icon: pkgIcon(p.icon),
      kind: "lens",
      lens: { type: "packages", ids: [p.id] },
      group: "filter",
      accent: accentVivid(p.tint),
    })),
    // "Show All" clears any active filter. Kept LAST so keyboard order matches its sticky-bottom
    // position, and only when a filter is applied (the "Guide" action covers the unfiltered case).
    ...(filtered
      ? [
          {
            key: "show-all",
            label: "Show All",
            icon: <LayoutGrid size={20} />,
            kind: "lens" as const,
            lens: { type: "all" as const },
            group: "footer" as const,
          },
        ]
      : []),
  ];
}

/** Whether item lens `a` is the currently-active lens `b`. */
export function lensEquals(a: Lens | undefined, b: Lens): boolean {
  if (!a || a.type !== b.type) return false;
  if (a.type === "packages" && b.type === "packages") {
    return a.ids.length === b.ids.length && a.ids.every((id) => b.ids.includes(id));
  }
  return true;
}

/** Layout reservation: the collapsed rail (COLLAPSED_W) + its left inset + a gap before the grid. The
 *  grid reserves exactly this; expanding is a pure overlay (the sidebar grows over the grid). */
// Collapsed rail width. The panel pads 8px each side, so the rows get `COLLAPSED_W - 16` of width;
// at 60 that's 44px — square with the rows' h-11 (44px) height, so a collapsed item reads as a circle-
// in-a-square rather than a squished pill.
export const COLLAPSED_W = 60;
export const EXPANDED_W = 240;
export const INSET = 12;
const GAP = 16;
export const SIDEBAR_SLIVER_W = INSET + COLLAPSED_W + GAP;

export const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function SidebarRow({
  item,
  open,
  focused,
  active,
  onClick,
  rowRef,
}: {
  item: SidebarItem;
  open: boolean;
  focused: boolean;
  active: boolean;
  onClick: () => void;
  rowRef?: (el: HTMLButtonElement | null) => void;
}) {
  const accent = item.accent ?? C.ring;
  // Inline bg only for the ACTIVE (dynamic-accent) state; otherwise a class so hover works (inline
  // styles beat hover classes). Collapsed → center the icon (no padding); expanded → left-align + label.
  const bgClass = active ? "" : focused ? "bg-white/[0.07]" : "hover:bg-white/[0.06]";
  return (
    <button
      ref={rowRef}
      onClick={onClick}
      title={!open ? item.label : undefined}
      className={`flex h-11 w-full shrink-0 cursor-pointer items-center rounded-xl border-none text-left transition-colors ${open ? "justify-start gap-3 px-3" : "justify-center px-0"} ${bgClass}`}
      style={{
        background: active ? hexA(accent, 0.16) : undefined,
        color: active ? accent : "#e6eaf1",
        outline: focused ? `2px solid ${accent}` : "none",
        outlineOffset: -2,
      }}
    >
      <span className="flex size-6 shrink-0 items-center justify-center" style={{ color: active ? accent : "#c3c9d4" }}>
        {item.icon}
      </span>
      {open && (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium leading-tight">{item.label}</span>
          {item.sublabel && <span className="truncate text-xs text-[#94a3b8]">{item.sublabel}</span>}
        </span>
      )}
    </button>
  );
}

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
  const [hovered, setHovered] = useState(false);
  const open = expanded || hovered; // keyboard focus OR mouse hover expands it
  const actions = items.filter((i) => i.group === "action");
  const filters = items.filter((i) => i.group === "filter");
  const activeFilter = filters.find((f) => f.lens && lensEquals(f.lens, lens));
  // "Show All" — a footer item pinned to the bottom (present only while a filter is applied).
  const footer = items.find((i) => i.group === "footer");
  const footerIdx = items.findIndex((i) => i.group === "footer");
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keep the focused row in view (the package list can be taller than the panel).
  useEffect(() => {
    if (!focused) return;
    itemRefs.current[sel]?.scrollIntoView({ block: "nearest" });
  }, [sel, focused]);

  return (
    <>
      {/* Backdrop: while the sidebar is open (hover or keyboard focus), dim + blur the rest of the
          guide so the sidebar reads as the focused layer. Covers the whole guide root; sits just under
          the panel (z30). pointer-events:none so it never blocks the grid or the hover-collapse. */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="sidebar-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 29,
              background: "rgba(6,10,20,0.45)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>

      <motion.div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        initial={false}
        animate={{ width: open ? EXPANDED_W : COLLAPSED_W }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      style={{
        position: "absolute",
        left: INSET,
        top: INSET,
        bottom: INSET,
        zIndex: 30,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 8,
        borderRadius: 18,
        background: hexA(C.navBg, 0.96),
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
      }}
    >
      {actions.map((it, i) => (
        <SidebarRow
          key={it.key}
          item={it}
          open={open}
          focused={focused && sel === i}
          active={it.lens ? lensEquals(it.lens, lens) : false}
          onClick={() => onActivate(i)}
          rowRef={(el) => void (itemRefs.current[i] = el)}
        />
      ))}

      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "2px 4px", flexShrink: 0 }} />

      <div
        className="cg-grid-scroll"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}
      >
        {open ? (
          filters.map((it, i) => {
            const idx = actions.length + i;
            return (
              <motion.div
                key={it.key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.02 * i, duration: 0.16 }}
                style={{ flexShrink: 0 }}
              >
                <SidebarRow
                  item={it}
                  open
                  focused={focused && sel === idx}
                  active={it.lens ? lensEquals(it.lens, lens) : false}
                  onClick={() => onActivate(idx)}
                  rowRef={(el) => void (itemRefs.current[idx] = el)}
                />
              </motion.div>
            );
          })
        ) : (
          // Collapsed: the whole filter group folds into one "Filters" circle, lit if a filter's on.
          <div
            className="flex h-11 w-full shrink-0 items-center justify-center rounded-xl"
            title="Filters"
            style={{
              color: activeFilter ? (activeFilter.accent ?? C.ring) : "#c3c9d4",
              background: activeFilter ? hexA(activeFilter.accent ?? C.ring, 0.16) : "transparent",
            }}
          >
            <ListFilter size={20} />
          </div>
        )}
      </div>

      {/* "Show All" — sticky to the bottom (the flex-1 scroll above pushes it down). Only present
          while a filter is applied; clears the filter. */}
      {footer && (
        <>
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "2px 4px", flexShrink: 0 }} />
          <SidebarRow
            item={footer}
            open={open}
            focused={focused && sel === footerIdx}
            active={false}
            onClick={() => onActivate(footerIdx)}
            rowRef={(el) => void (itemRefs.current[footerIdx] = el)}
          />
        </>
      )}
      </motion.div>
    </>
  );
}
