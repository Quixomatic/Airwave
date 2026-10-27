import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { TvPressable as Pressable } from "@/components/tv-pressable";

import { scaled } from "@/features/guide/layout";
import { LAYER, useKeyLayer } from "@/lib/input";

/**
 * Settings primitives + the per-subpage D-pad hook, ported from tv-web's `settings-ui.tsx`. The
 * shell owns the rail; each page renders its rows and calls `useSettingsPage`, which registers a
 * dispatcher layer (active only while the CONTENT zone is focused) — so D-pad and touch drive the
 * same option list.
 */
export const SETTINGS_ACCENT = "#4a9fe0";

export type SettingsCtxValue = {
  active: boolean;
  returnToRail: () => void;
  /** Ask the shell's ScrollView to snap a focused row into view (no-op if already visible). */
  ensureVisible: (node: View | null) => void;
  /** Scroll the content pane to the very top — used at the first option to reveal the header above it. */
  scrollToTop: () => void;
  /** Show `node` in a panel beside the page, outside its scrolling (the Guide page's preview of a theme); `null` clears it. */
  setDock: (node: ReactNode | null) => void;
};
export const SettingsCtx = createContext<SettingsCtxValue>({ active: false, returnToRail: () => {}, ensureVisible: () => {}, scrollToTop: () => {}, setDock: () => {} });

/**
 * `opts.onBack` sees the selected index when Left or Back is pressed and returns true to handle it itself (a page with a
 * sub-list steps back to the list above it); false leaves the key to return to the rail as usual. `setSel` moves the selection.
 */
export function useSettingsPage(count: number, onActivate: (i: number) => void, opts?: { onBack?: (sel: number) => boolean }) {
  const { active, returnToRail, scrollToTop } = useContext(SettingsCtx);
  const [sel, setSel] = useState(0);
  const selRef = useRef(0);
  selRef.current = sel;
  const cbRef = useRef(onActivate);
  cbRef.current = onActivate;
  const backRef = useRef(opts?.onBack);
  backRef.current = opts?.onBack;

  useEffect(() => {
    if (active) setSel((s) => Math.min(s, Math.max(0, count - 1)));
  }, [active, count]);

  // At the top-most option, scroll the pane fully to the top so the non-focusable header above the first
  // row (page title, the device-info card, etc.) is revealed — otherwise landing on row 0 left it stuck
  // wherever the previous row's snap-scroll had put it. Runs AFTER the row's own ensureVisible (parent
  // effect after child effect), so this wins for sel 0.
  useEffect(() => {
    if (active && sel === 0) scrollToTop();
  }, [active, sel, scrollToTop]);

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
          setSel((s) => Math.min(Math.max(0, count - 1), s + 1));
          return true;
        case "ok":
          cbRef.current(selRef.current);
          return true;
        case "left":
        case "back":
          if (!backRef.current?.(selRef.current)) returnToRail();
          return true;
      }
      return false;
    },
  });

  return { sel: active ? sel : -1, setSel };
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={scaled({ marginBottom: 30 })}>
      <Text style={scaled({ fontSize: 34, fontWeight: "800", letterSpacing: -0.5, color: "#f1f5f9" })}>{title}</Text>
      {subtitle && <Text style={scaled({ fontSize: 17, color: "#94a3b8", marginTop: 6 })}>{subtitle}</Text>}
    </View>
  );
}

export function SettingRow({
  label,
  sublabel,
  focused,
  onPress,
  right,
}: {
  label: string;
  sublabel?: string;
  focused: boolean;
  onPress?: () => void;
  right?: ReactNode;
}) {
  // When the D-pad focuses this row, ask the shell to snap it into view (mirrors the guide grid's
  // "scroll only when off-screen" — the shell no-ops if the row is already fully visible). onLayout Y is
  // parent-relative in this nested layout, so the shell measures the row against the scroll content.
  const rowRef = useRef<View>(null);
  const { ensureVisible } = useContext(SettingsCtx);
  useEffect(() => {
    if (focused) ensureVisible(rowRef.current);
  }, [focused, ensureVisible]);
  return (
    <Pressable
      ref={rowRef}
      onPress={onPress}
      style={scaled({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        paddingVertical: 16,
        paddingHorizontal: 22,
        borderRadius: 14,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: focused ? SETTINGS_ACCENT : "transparent",
        backgroundColor: focused ? "rgba(74,159,224,0.10)" : "rgba(148,163,184,0.06)",
      })}
    >
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text style={scaled({ fontSize: 18, fontWeight: "600", color: "#f1f5f9" })}>{label}</Text>
        {sublabel && <Text style={scaled({ fontSize: 14, color: "#94a3b8", marginTop: 2 })}>{sublabel}</Text>}
      </View>
      {right}
    </Pressable>
  );
}

/**
 * A line of explanatory text under a setting that the D-pad can stop on. Text a remote cannot focus is never scrolled to, so
 * a note below the last row of a long page would sit off the screen for good; as one more stop in the page's list it is
 * scrolled into view and read like a row. Pass `dim` for fine print.
 */
export function SettingNote({ children, focused, dim }: { children: ReactNode; focused: boolean; dim?: boolean }) {
  const ref = useRef<View>(null);
  const { ensureVisible } = useContext(SettingsCtx);
  useEffect(() => {
    if (focused) ensureVisible(ref.current);
  }, [focused, ensureVisible]);
  return (
    <View
      ref={ref}
      style={scaled({
        marginTop: dim ? 18 : 4,
        marginBottom: 8,
        paddingVertical: 8,
        paddingHorizontal: 22,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: focused ? SETTINGS_ACCENT : "transparent",
        backgroundColor: focused ? "rgba(74,159,224,0.10)" : "transparent",
      })}
    >
      <Text style={scaled({ fontSize: 14, lineHeight: 21, color: dim ? "#64748b" : "#94a3b8", maxWidth: 640 })}>{children}</Text>
    </View>
  );
}

export function SectionLabel({ children, small }: { children: ReactNode; small?: boolean }) {
  return (
    <Text
      style={scaled({
        fontSize: small ? 13 : 15,
        fontWeight: "700",
        letterSpacing: 1,
        textTransform: "uppercase",
        color: "#64748b",
        marginTop: small ? 20 : 34,
        marginBottom: small ? 10 : 14,
      })}
    >
      {children}
    </Text>
  );
}

export function Pill({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "warn" | "muted" }) {
  const c = tone === "warn" ? { bg: "rgba(240,169,42,0.16)", fg: "#f0a92a" } : tone === "muted" ? { bg: "rgba(148,163,184,0.16)", fg: "#94a3b8" } : { bg: "rgba(74,159,224,0.16)", fg: SETTINGS_ACCENT };
  return (
    <View style={scaled({ alignSelf: "flex-start", backgroundColor: c.bg, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 })}>
      <Text style={scaled({ fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", color: c.fg })}>{children}</Text>
    </View>
  );
}

export function Toggle({ on, warn }: { on: boolean; warn?: boolean }) {
  const color = warn ? "#f0a92a" : SETTINGS_ACCENT;
  return (
    <View style={scaled({ width: 46, height: 26, borderRadius: 999, backgroundColor: on ? color : "rgba(148,163,184,0.3)", justifyContent: "center" })}>
      <View style={scaled({ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" })} />
    </View>
  );
}
