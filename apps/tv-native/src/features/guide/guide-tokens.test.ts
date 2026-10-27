/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { AURORA, type GuideTokens, useGuideTokens } from "./guide-tokens";

// The literals the guide components drew with before the look moved into tokens (aurora-grid,
// guide-sidebar, glass-button, guide-ghost and the `C` palette entries they read).
const BEFORE_TOKENS: GuideTokens = {
  bg: "#060a14",
  scrim: "rgba(6,10,20,0.55)",
  now: "#ef4444",
  rowBorder: "rgba(148,163,184,0.12)",
  cellBg: "rgba(148,163,184,0.05)",
  liveCellBg: "transparent",
  cellBorder: "rgba(148,163,184,0.10)",
  cellBorderW: 1,
  ring: "#3b82f6",
  ringW: 2,
  cellRadius: 8,
  liveFill: { elapsed: 0.32, remain: 0.1 },
  liveBar: { w: 3, r: 4 },
  title: "#f1f5f9",
  titleWeight: "600",
  sub: "#94a3b8",
  railFocusAlpha: 0.12,
  circle: { fillA: 0.2, borderA: 0.35 },
  heartOff: "#c3c9d4",
  fav: "#fb7185",
  number: "#94a3b8",
  numberFocused: "#e6eaf1",
  numberWeight: "700",
  name: "#94a3b8",
  headerDay: "#e6eaf1",
  headerTick: "#c3c9d4",
  featured: {
    tagline: "#64748b",
    rule: "rgba(148,163,184,0.14)",
    title: "#f1f5f9",
    episode: "#c3c9d4",
    meta: "#c3c9d4",
    sep: "#475569",
    star: "#f0a92a",
    summary: "#c9cfda",
    status: "#e6eaf1",
    track: "rgba(148,163,184,0.18)",
    numberA: 0.75,
  },
  badge: {
    res: { grad: ["#7fd6de", "#4bb8c9"], text: "#06222a" },
    hdr: { grad: ["#f0c14b", "#e0a020"], text: "#2a1e00" },
    audio: { grad: ["#1e293b", "#334155"], text: "#dfe4ec" },
  },
  sidebar: { bg: "#0b1120", border: "rgba(148,163,184,0.14)", rule: "rgba(255,255,255,0.08)", icon: "#f1f5f9", shadow: "#000" },
  glass: {
    ringA: 0.7,
    litBorderA: 0.4,
    litFillA: 0.28,
    idleBorder: "rgba(255,255,255,0.12)",
    idleFill: "rgba(18,24,38,0.55)",
    labelLit: "#f8fafc",
    label: "#c3c9d4",
    sublabel: "#64748b",
  },
  ghost: { block: "rgba(148,163,184,0.09)", title: "#e2e8f0", sub: "#94a3b8" },
};

describe("Aurora tokens", () => {
  test("reproduce the literals the guide used before tokens", () => {
    expect(AURORA).toEqual(BEFORE_TOKENS);
  });

  test("are what the guide reads", () => {
    expect(useGuideTokens()).toBe(AURORA);
  });

  test("colors are in a format the native painter parses", () => {
    const color = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)|transparent)$/i;
    const bad: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === "string") {
        if (!/^\d{3}$/.test(v) && !color.test(v)) bad.push(`${path}: ${v}`);
      } else if (v && typeof v === "object") {
        for (const [k, child] of Object.entries(v)) walk(child, path ? `${path}.${k}` : k);
      }
    };
    walk(AURORA, "");
    expect(bad).toEqual([]);
  });

  test("accent alphas are within 0..1", () => {
    const { railFocusAlpha, circle, liveFill, featured, glass } = AURORA;
    const alphas = [railFocusAlpha, circle.fillA, circle.borderA, liveFill.elapsed, liveFill.remain, featured.numberA, glass.ringA, glass.litBorderA, glass.litFillA];
    for (const a of alphas) expect(a >= 0 && a <= 1).toBe(true);
  });
});
