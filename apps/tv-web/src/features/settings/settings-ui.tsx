import React, { createContext, useContext, useEffect, useRef, useState } from "react";

/**
 * Shared bits for the settings subpages: the zone context (is the CONTENT focused, and how to hand
 * focus back to the rail), a per-page D-pad option-nav hook, and the header / row primitives so
 * every subpage looks the same. The rail + shell live in the `/settings` route; pages just render
 * their options and call `useSettingsPage`.
 */

const BACK_KEYS = ["Backspace", "GoBack", "BrowserBack", "XF86Back"];
const isBack = (e: KeyboardEvent) => e.keyCode === 461 || BACK_KEYS.includes(e.key);
export const SETTINGS_ACCENT = "#4a9fe0";

export type SettingsCtxValue = { active: boolean; returnToRail: () => void };
export const SettingsCtx = createContext<SettingsCtxValue>({ active: false, returnToRail: () => {} });

/**
 * Per-subpage D-pad navigation over `count` focusable rows; `onActivate(i)` fires on OK. Live only
 * while the content zone is focused (`active`); ◄/Back hands focus back to the category rail.
 */
export function useSettingsPage(count: number, onActivate: (i: number) => void) {
  const { active, returnToRail } = useContext(SettingsCtx);
  const [sel, setSel] = useState(0);
  const selRef = useRef(0);
  selRef.current = sel;
  const cbRef = useRef(onActivate);
  cbRef.current = onActivate;

  useEffect(() => {
    if (!active) return;
    setSel((s) => Math.min(s, Math.max(0, count - 1)));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSel((s) => Math.max(0, s - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSel((s) => Math.min(count - 1, s + 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        cbRef.current(selRef.current);
      } else if (e.key === "ArrowLeft" || isBack(e)) {
        e.preventDefault();
        e.stopPropagation();
        returnToRail();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, count, returnToRail]);

  return { sel: active ? sel : -1, active };
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.5px" }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 17, color: "#94a3b8", marginTop: 6 }}>{subtitle}</p>}
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
  return (
    <div
      role="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        padding: "16px 22px",
        borderRadius: 14,
        cursor: onClick ? "pointer" : "default",
        background: focused ? "rgba(74,159,224,0.10)" : "rgba(148,163,184,0.06)",
        outline: focused ? `2px solid ${SETTINGS_ACCENT}` : "none",
        outlineOffset: -2,
        marginBottom: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#f1f5f9" }}>{label}</div>
        {sublabel && <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 2 }}>{sublabel}</div>}
      </div>
      {right}
    </div>
  );
}
