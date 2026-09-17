import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import { IS_BROWSER } from "../../lib/browser-mode";
import { C } from "../../lib/theme";
import { GlassCircleButton } from "../watch/glass-button";

/**
 * The settings shell's left sidebar — the same sliver-of-glass-circles treatment as the guide
 * sidebar (`GuideSidebar`), but its buttons are the settings categories + a Guide circle to get
 * back to live TV. Collapsed it's a quiet sliver of circles; when the rail is focused it expands as
 * an OVERLAY (the content reserves only the sliver width and never shifts). The route shell owns the
 * D-pad zone machine and drives this via `sel` / `activeKey` / `onActivate`.
 */

export type SettingsNavItem = { key: string; label: string; icon: React.ReactNode };

export const SETTINGS_SLIVER_W = 92;
export const SETTINGS_EXPANDED_W = 300;

export function SettingsSidebar({
  items,
  expanded,
  focused,
  sel,
  activeKey,
  onActivate,
  collapsed = false,
  onToggleCollapse,
}: {
  items: SettingsNavItem[];
  expanded: boolean;
  focused: boolean;
  sel: number;
  activeKey: string;
  onActivate: (index: number) => void;
  /** Browser only: the rail is PINNED open (this is its width), with a bottom toggle to fold it to the
   *  sliver — unlike TV, where width follows D-pad focus (`expanded`). */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  // Browser: mouse hover highlights a row (there's no persistent D-pad focus on a pinned rail).
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // Width: browser pins it (driven by the collapse toggle), TV follows D-pad focus.
  const open = IS_BROWSER ? !collapsed : expanded;
  useEffect(() => {
    if (focused) refs.current[sel]?.scrollIntoView({ block: "nearest" });
  }, [sel, focused]);

  return (
    <motion.div
      initial={false}
      animate={{
        width: open ? SETTINGS_EXPANDED_W : SETTINGS_SLIVER_W,
        boxShadow: open ? "24px 0px 60px rgba(0,0,0,0.5)" : "24px 0px 60px rgba(0,0,0,0)",
      }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      onMouseLeave={IS_BROWSER ? () => setHoverIdx(null) : undefined}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "24px 18px",
        background: C.sidebarBg,
        borderRight: `1px solid ${C.border}`,
        zIndex: 25,
      }}
    >
      {items.map((it, i) => (
        <React.Fragment key={it.key}>
          <div
            ref={(el) => void (refs.current[i] = el)}
            onMouseEnter={IS_BROWSER ? () => setHoverIdx(i) : undefined}
            style={{ flexShrink: 0 }}
          >
            <GlassCircleButton
              icon={it.icon}
              label={it.label}
              expanded={open}
              focused={(focused && sel === i) || (IS_BROWSER && hoverIdx === i)}
              active={it.key === activeKey}
              onClick={() => onActivate(i)}
            />
          </div>
          {/* Separate the "Back to Guide" action from the category circles (matches the guide sidebar). */}
          {i === 0 && <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0", flexShrink: 0 }} />}
        </React.Fragment>
      ))}

      {/* Browser: a collapse/expand toggle pinned at the bottom, folding the rail to the sliver and back.
          A divider above it mirrors the one under "Back to Guide"; its `marginTop:auto` pushes the pair down. */}
      {IS_BROWSER && onToggleCollapse && (
        <>
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0", marginTop: "auto", flexShrink: 0 }} />
          <div onMouseEnter={() => setHoverIdx(-1)} style={{ flexShrink: 0 }}>
            <GlassCircleButton
              icon={open ? <PanelLeftClose size={24} /> : <PanelLeftOpen size={24} />}
              label={open ? "Collapse" : "Expand"}
              expanded={open}
              focused={hoverIdx === -1}
              active={false}
              onClick={onToggleCollapse}
            />
          </div>
        </>
      )}
    </motion.div>
  );
}
