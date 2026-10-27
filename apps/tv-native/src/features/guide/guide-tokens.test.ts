/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { parseColor } from "./color";
import { tokenProblems } from "./guide-token-checks";
import { AURORA, accentFg, rowAccent, type GuideTokens } from "./guide-tokens";

// The literals the guide components drew with before the look moved into tokens (aurora-grid,
// guide-sidebar, glass-button, guide-ghost and the `C` palette entries they read). The on-now fill and bar had fewer
// fields then; `x` and `inset` are the offsets the rows hard-coded.
const BEFORE_TOKENS = {
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
    const { liveFill, liveBar, ...before } = BEFORE_TOKENS;
    for (const [key, value] of Object.entries(before)) expect(AURORA[key as keyof GuideTokens], key).toEqual(value as never);
    expect(AURORA.liveFill).toEqual({ mode: "tint", ...liveFill });
    expect(AURORA.liveBar).toEqual({ ...liveBar, x: 3, inset: 10, color: null });
  });

  test("what themes added is neutral, so the rows draw Aurora exactly as before", () => {
    expect([AURORA.accentShade, AURORA.accentFixed, AURORA.logoPlate, AURORA.fontScale, AURORA.ringOuter]).toEqual([0, null, "transparent", 1, null]);
    expect([AURORA.artScrim.length, typeof AURORA.artTitle, typeof AURORA.artSub]).toEqual([2, "string", "string"]);
    expect([AURORA.accentMode, AURORA.accentCycle]).toEqual(["channel", null]);
  });

  test("is a valid token set, with colors in a format the native painter parses", () => {
    expect(tokenProblems(AURORA)).toEqual([]);
    const color = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)|transparent)$/i;
    const bad: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === "string") {
        if (/^(accent|accent-solid|auto|none|channel|aurora|text|full|tint|\d{3})$/.test(v) || path.startsWith("typeStyle") || path.startsWith("statusLabel") || path.startsWith("art.placeholder")) return;
        if (!color.test(v)) bad.push(`${path}: ${v}`);
      } else if (v && typeof v === "object") {
        for (const [k, child] of Object.entries(v)) walk(child, path ? `${path}.${k}` : k);
      }
    };
    walk(AURORA, "");
    expect(bad).toEqual([]);
  });

  test("accent alphas are within 0..1", () => {
    const { railFocusAlpha, circle, liveFill, featured, glass } = AURORA;
    const alphas = [railFocusAlpha, circle.fillA, circle.borderA, featured.numberA, glass.ringA, glass.litBorderA, glass.litFillA];
    if (liveFill.mode === "tint") alphas.push(liveFill.elapsed, liveFill.remain);
    for (const a of alphas) expect(a >= 0 && a <= 1).toBe(true);
  });
});

describe("accentFg", () => {
  const accent = "#5b8fd6";

  test("is the accent itself when there is no shade and no fixed color", () => {
    expect(accentFg(AURORA, accent)).toBe(accent);
  });

  test("a fixed color wins over the accent and the shade", () => {
    expect(accentFg({ accentFixed: "#ffffff", accentShade: 0.5, title: "#000000" }, accent)).toBe("#ffffff");
  });

  test("a shade moves the accent toward the title color", () => {
    const ink = "#1d2430";
    const half = parseColor(accentFg({ accentFixed: null, accentShade: 0.5, title: ink }, accent));
    const a = parseColor(accent);
    const t = parseColor(ink);
    // Each channel lands halfway, within the rounding to an integer.
    expect(Math.abs(half.r - (a.r + t.r) / 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(half.g - (a.g + t.g) / 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(half.b - (a.b + t.b) / 2)).toBeLessThanOrEqual(0.5);
    expect(accentFg({ accentFixed: null, accentShade: 1, title: ink }, accent)).toBe(ink);
  });
});

describe("rowAccent", () => {
  const channel = "#5b8fd6";

  test("channel mode (Aurora) keeps the channel's own accent", () => {
    expect(rowAccent(AURORA, channel, 0)).toBe(channel);
    expect(rowAccent(AURORA, channel, 41)).toBe(channel);
  });

  test("fixed mode is one color on every row", () => {
    const tk = { accentMode: "fixed", accentFixed: "#ffe600", accentCycle: null } as const;
    expect(rowAccent(tk, channel, 0)).toBe("#ffe600");
    expect(rowAccent(tk, "#d05a52", 7)).toBe("#ffe600");
  });

  test("cycle mode hands out the theme's colors by row index, round and round", () => {
    const tk = { accentMode: "cycle", accentFixed: null, accentCycle: ["#e0161e", "#1f4fd8", "#ffd91a"] } as const;
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => rowAccent(tk, channel, i))).toEqual(["#e0161e", "#1f4fd8", "#ffd91a", "#e0161e", "#1f4fd8", "#ffd91a", "#e0161e"]);
    expect(rowAccent(tk, channel, -1)).toBe("#ffd91a"); // never undefined for an index before the list
  });

  test("a mode without its colors falls back to the channel's accent", () => {
    expect(rowAccent({ accentMode: "fixed", accentFixed: null, accentCycle: null }, channel, 3)).toBe(channel);
    expect(rowAccent({ accentMode: "cycle", accentFixed: null, accentCycle: null }, channel, 3)).toBe(channel);
    expect(rowAccent({ accentMode: "cycle", accentFixed: null, accentCycle: [] }, channel, 3)).toBe(channel);
  });
});
