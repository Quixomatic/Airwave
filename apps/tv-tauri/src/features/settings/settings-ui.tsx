import React, { createContext, useContext, useEffect, useRef, useState } from "react";

import { LAYER, useKeyLayer } from "../../lib/input";

/**
 * Shared bits for the settings subpages — a faithful port of tv-web `features/settings/settings-ui.tsx`:
 * the zone context (is the CONTENT focused, and how to hand focus back to the rail), a per-page D-pad
 * option-nav hook, and the header / row primitives so every subpage looks the same. The rail + shell
 * live in `settings-screen.tsx`; pages just render their options and call `useSettingsPage`.
 *
 * tv-tauri seam: `PageHeader` is STICKY (the "main header section stays put while the rest scrolls" —
 * James's ask). Everything else is the tv-web port; the desktop cleanup pass tightens the sizing later.
 */

export const SETTINGS_ACCENT = "#4a9fe0";

export type SettingsCtxValue = { active: boolean; returnToRail: () => void };
export const SettingsCtx = createContext<SettingsCtxValue>({ active: false, returnToRail: () => {} });

/**
 * Per-subpage D-pad navigation over `count` focusable rows; `onActivate(i)` fires on OK. Live only
 * while the content zone is focused (`active`); ◄/Back hands focus back to the category rail. Mouse
 * click still works on every row independently of this.
 */
export function useSettingsPage(count: number, onActivate: (i: number) => void) {
  const { active, returnToRail } = useContext(SettingsCtx);
  const [sel, setSel] = useState(0);
  const selRef = useRef(0);
  selRef.current = sel;
  const cbRef = useRef(onActivate);
  cbRef.current = onActivate;

  // Keep the cursor in range when the row count shrinks under it (or the page becomes active).
  useEffect(() => {
    if (!active) return;
    setSel((s) => Math.min(s, Math.max(0, count - 1)));
  }, [active, count]);

  useKeyLayer({
    id: "settings-page",
    priority: LAYER.BASE,
    active,
    onKey(e) {
      switch (e.key) {
        case "up":
          setSel((s) => Math.max(0, s - 1));
          return true;
        case "down":
          // max() guards a zero-row page (an info-only subpage like About): `count - 1` would be
          // -1 and drive sel negative. Clamped at 0, nothing focuses and ◄/Back still works.
          setSel((s) => Math.min(Math.max(0, count - 1), s + 1));
          return true;
        case "ok":
          cbRef.current(selRef.current);
          return true;
        case "left":
        case "back":
          returnToRail();
          return true;
      }
      return false;
    },
  });

  return { sel: active ? sel : -1, active };
}

/**
 * A two-tap confirm for a destructive action (sign out / change server): the first trigger arms it
 * (shows a "Confirm" pill), the second within `ms` runs it. Auto-disarms after `ms` so it works the
 * same whether armed by mouse click or D-pad OK (unlike tv-web's focus-leave disarm, which needs a
 * D-pad cursor). `action` is held in a ref so a late confirm always calls the current closure.
 */
export function useArmedAction(action: () => void, ms = 4000) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(0);
  const actionRef = useRef(action);
  actionRef.current = action;
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const trigger = () => {
    window.clearTimeout(timer.current);
    if (armed) {
      setArmed(false);
      actionRef.current();
    } else {
      setArmed(true);
      timer.current = window.setTimeout(() => setArmed(false), ms);
    }
  };
  return { armed, trigger };
}

/** The page's title/subtitle — STICKY: it stays pinned at the top of the scroll column while the rows
 *  scroll under it. Its own opaque background masks the scrolled content; a hairline divider grounds it. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      // Opaque navy at the top (masks rows scrolling up) fading to transparent at the bottom — a soft
      // grounding instead of a hard, full-width divider that overhung the padded content.
      className="bg-linear-to-b from-[#060a14] from-90% to-transparent"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        padding: "36px 64px 28px",
      }}
    >
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 16, color: "#94a3b8", marginTop: 6 }}>{subtitle}</p>}
    </div>
  );
}

export function SettingRow({
  label,
  sublabel,
  focused,
  onClick,
  right,
}: {
  label: string;
  sublabel?: string;
  focused: boolean;
  onClick?: () => void;
  right?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the focused row on screen as D-pad focus moves down a long page (the content area scrolls).
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest" });
  }, [focused]);
  return (
    <div
      ref={ref}
      role="button"
      onClick={onClick}
      className={onClick && !focused ? "settings-row-hoverable" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        padding: "15px 20px",
        borderRadius: 14,
        cursor: onClick ? "pointer" : "default",
        background: focused ? "rgba(74,159,224,0.10)" : "rgba(148,163,184,0.06)",
        outline: focused ? `2px solid ${SETTINGS_ACCENT}` : "none",
        outlineOffset: -2,
        marginBottom: 12,
        scrollMarginBlock: 28,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: "#f1f5f9" }}>{label}</div>
        {sublabel && <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 2 }}>{sublabel}</div>}
      </div>
      {right}
    </div>
  );
}

export function SectionLabel({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <div
      style={{
        fontSize: small ? 13 : 15,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: "#64748b",
        margin: small ? "20px 0 10px" : "30px 0 14px",
      }}
    >
      {children}
    </div>
  );
}

/** A small status pill. `accent` = an active override; `warn` = a risky forced-on; `muted` = info. */
export function Pill({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "warn" | "muted" }) {
  const c =
    tone === "warn" ? { bg: "rgba(240,169,42,0.16)", fg: "#f0a92a" } : tone === "muted" ? { bg: "rgba(148,163,184,0.16)", fg: "#94a3b8" } : { bg: "rgba(74,159,224,0.16)", fg: SETTINGS_ACCENT };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", padding: "3px 9px", borderRadius: 999, background: c.bg, color: c.fg, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

/* The device page's cap toggles now use the real `@airwave/ui` Switch (read-only, row-driven) — the old
   custom `Toggle` visual was removed. */

/** Small info column used by the Server + Device summary cards. */
export function InfoStat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", marginBottom: 3 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 600, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis" }}>
        {icon}
        {value}
      </div>
    </div>
  );
}
