import { AnimatePresence, motion } from "framer-motion";
import type React from "react";
import { useEffect, useRef, useState } from "react";

import { C } from "../../lib/theme";
import {
  COLLAPSED_W,
  EXPANDED_W,
  INSET,
  SidebarRow,
  hexA,
  type SidebarItem,
} from "../guide/guide-sidebar";
import { SETTINGS_ACCENT } from "./settings-ui";

/**
 * The settings category rail — the SAME desktop rail we built for the guide (a floating inset panel
 * that collapses to a slim rail and expands on hover or keyboard focus, over a dim scrim), reusing
 * the guide's `SidebarRow` + sizing so the two match exactly. The item model is different (settings
 * SECTIONS, not guide lenses): a "Guide" back-action pinned at the top, a divider, then the sections.
 */

/** Blur the content behind the expanded rail (as the guide does). OFF for settings by request — the
 *  scrim still dims. Flip to `true` to bring the blur back. */
const SCRIM_BLUR = false;

export type SettingsNavItem = { key: string; label: string; icon: React.ReactNode };

export function SettingsSidebar({
  items,
  activeKey,
  expanded,
  focused,
  sel,
  onActivate,
}: {
  /** items[0] is the "Back to Guide" action; the rest are the settings sections. */
  items: SettingsNavItem[];
  activeKey: string;
  expanded: boolean;
  focused: boolean;
  sel: number;
  onActivate: (index: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const open = expanded || hovered; // keyboard focus OR mouse hover expands it
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keep the focused row in view (parity with the guide rail).
  useEffect(() => {
    if (!focused) return;
    itemRefs.current[sel]?.scrollIntoView({ block: "nearest" });
  }, [sel, focused]);

  const toItem = (n: SettingsNavItem): SidebarItem => ({
    key: n.key,
    label: n.label,
    icon: n.icon,
    kind: n.key === "guide" ? "settings" : "lens",
    group: "action",
    accent: SETTINGS_ACCENT,
  });

  const back = items[0];
  const sections = items.slice(1);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="settings-sidebar-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 29,
              background: "rgba(6,10,20,0.45)",
              ...(SCRIM_BLUR ? { backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" } : null),
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
        {back && (
          <SidebarRow
            item={toItem(back)}
            open={open}
            focused={focused && sel === 0}
            active={false}
            onClick={() => onActivate(0)}
            rowRef={(el) => void (itemRefs.current[0] = el)}
          />
        )}

        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "2px 4px", flexShrink: 0 }} />

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {sections.map((it, i) => {
            const idx = i + 1;
            return (
              <SidebarRow
                key={it.key}
                item={toItem(it)}
                open={open}
                focused={focused && sel === idx}
                active={it.key === activeKey}
                onClick={() => onActivate(idx)}
                rowRef={(el) => void (itemRefs.current[idx] = el)}
              />
            );
          })}
        </div>
      </motion.div>
    </>
  );
}
