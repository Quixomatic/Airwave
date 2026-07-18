import { motion } from "framer-motion";
import React, { useEffect, useRef } from "react";

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
const EXPANDED_W = 300;

export function SettingsSidebar({
  items,
  expanded,
  focused,
  sel,
  activeKey,
  onActivate,
}: {
  items: SettingsNavItem[];
  expanded: boolean;
  focused: boolean;
  sel: number;
  activeKey: string;
  onActivate: (index: number) => void;
}) {
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    if (focused) refs.current[sel]?.scrollIntoView({ block: "nearest" });
  }, [sel, focused]);

  return (
    <motion.div
      initial={false}
      animate={{
        width: expanded ? EXPANDED_W : SETTINGS_SLIVER_W,
        boxShadow: expanded ? "24px 0px 60px rgba(0,0,0,0.5)" : "24px 0px 60px rgba(0,0,0,0)",
      }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
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
          <div ref={(el) => void (refs.current[i] = el)} style={{ flexShrink: 0 }}>
            <GlassCircleButton
              icon={it.icon}
              label={it.label}
              expanded={expanded}
              focused={focused && sel === i}
              active={it.key === activeKey}
              onClick={() => onActivate(i)}
            />
          </div>
          {/* Separate the "Back to Guide" action from the category circles (matches the guide sidebar). */}
          {i === 0 && <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0", flexShrink: 0 }} />}
        </React.Fragment>
      ))}
    </motion.div>
  );
}
