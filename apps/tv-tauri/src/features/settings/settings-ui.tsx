import { cn } from "@airwave/ui/lib/utils";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

import { LAYER, useKeyLayer } from "../../lib/input";

/**
 * Shared bits for the settings subpages — a faithful port of tv-web `features/settings/settings-ui.tsx`:
 * the zone context (is the CONTENT focused, and how to hand focus back to the rail), a per-page D-pad
 * option-nav hook, and the header / row primitives so every subpage looks the same. The rail + shell
 * live in `settings-screen.tsx`; pages just render their options and call `useSettingsPage`.
 *
 * tv-tauri seam: `PageHeader` is STICKY (the "main header section stays put while the rest scrolls" —
 * James's ask). Static styling is Tailwind; only focus/tone-dependent styling stays inline.
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
      className="sticky top-0 z-[5] bg-linear-to-b from-[#060a14] from-90% to-transparent px-16 pt-9 pb-7"
    >
      <h1 className="text-3xl font-extrabold tracking-[-0.5px]">{title}</h1>
      {subtitle && <p className="mt-1.5 text-base text-muted-foreground">{subtitle}</p>}
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
      className={cn(
        "mb-3 flex scroll-my-7 items-center justify-between gap-5 rounded-[14px] px-5 py-[15px]",
        onClick ? "cursor-pointer" : "cursor-default",
        onClick && !focused && "settings-row-hoverable",
      )}
      // Focus-dependent surface + ring stay inline.
      style={{
        background: focused ? "rgba(74,159,224,0.10)" : "rgba(148,163,184,0.06)",
        outline: focused ? `2px solid ${SETTINGS_ACCENT}` : "none",
        outlineOffset: -2,
      }}
    >
      <div className="min-w-0">
        <div className="text-[17px] font-semibold text-foreground">{label}</div>
        {sublabel && <div className="mt-0.5 text-sm text-muted-foreground">{sublabel}</div>}
      </div>
      {right}
    </div>
  );
}

export function SectionLabel({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <div
      className={cn(
        "font-bold uppercase tracking-[1px] text-[#64748b]",
        small ? "mt-5 mb-2.5 text-[13px]" : "mt-[30px] mb-3.5 text-[15px]",
      )}
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
    <span
      className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-bold uppercase tracking-[0.5px]"
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  );
}

/* The device page's cap toggles now use the real `@airwave/ui` Switch (read-only, row-driven) — the old
   custom `Toggle` visual was removed. */

/** Small info column used by the Server + Device summary cards. */
export function InfoStat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-[3px] text-xs uppercase tracking-[1px] text-[#64748b]">{label}</div>
      <div className="flex items-center gap-2 overflow-hidden text-ellipsis text-[17px] font-semibold text-foreground">
        {icon}
        {value}
      </div>
    </div>
  );
}
