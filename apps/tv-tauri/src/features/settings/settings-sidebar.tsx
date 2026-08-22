import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";

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
 * The settings category rail — a PERSISTENT desktop rail (unlike the guide's hover-to-expand overlay):
 * it's expanded by default, sits IN the layout (the content pane is pushed over by its width, not
 * overlaid), and a Collapse/Expand toggle pinned at the bottom folds it to a slim icon rail. Reuses the
 * guide's `SidebarRow` + sizing so the two match. Item model: a "Guide" back-action pinned at the top, a
 * divider, the settings sections, then a divider + the collapse toggle.
 */

export type SettingsNavItem = { key: string; label: string; icon: React.ReactNode };

export function SettingsSidebar({
  items,
  activeKey,
  collapsed,
  focused,
  sel,
  onActivate,
  onToggleCollapse,
}: {
  /** items[0] is the "Back to Guide" action; the rest are the settings sections. */
  items: SettingsNavItem[];
  activeKey: string;
  /** Persistent collapse state (driven by the bottom toggle) — this is the rail's WIDTH. */
  collapsed: boolean;
  /** Keyboard focus is on the rail (highlights the selected row) — separate from width. */
  focused: boolean;
  sel: number;
  onActivate: (index: number) => void;
  onToggleCollapse: () => void;
}) {
  const open = !collapsed;
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

  const divider = (
    <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "2px 4px", flexShrink: 0 }} />
  );

  return (
    <motion.div
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

      {divider}

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

      {divider}

      {/* Collapse/expand toggle — mouse affordance (like the guide's "show all"): folds the rail to the
          slim icon width and back. Not part of the D-pad section list. */}
      <SidebarRow
        item={{
          key: "collapse",
          label: open ? "Collapse" : "Expand",
          icon: open ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />,
          kind: "settings",
          group: "action",
          accent: SETTINGS_ACCENT,
        }}
        open={open}
        focused={focused && sel === items.length}
        active={false}
        onClick={onToggleCollapse}
      />
    </motion.div>
  );
}
