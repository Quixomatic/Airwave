import { ACCENT_PALETTE } from "@/lib/accent-palette";

import { ACCENTS } from "./accents";
import { contrastRatio, mixColors, over, parseColor, type Rgba, toHex } from "./color";
import { accentFg, type GuideTokens } from "./guide-tokens";

/**
 * The contrast gate every color variant of every theme has to pass: WCAG 2.x ratios of the exact colors the guide draws,
 * worst case over everything a row can carry. Text needs 4.5:1 (every High Contrast variant 7:1) and graphics and large marks
 * 3:1; guide-themes.test.ts runs it over all variants.
 *
 * The worst case is taken over every accent a variant can put on a row (the 16 palette tints a channel can be given and the 8
 * fallbacks an untinted one gets by position, or the variant's fixed color or cycle), over both ends of the live fill, over each
 * state a cell can be in (resting, live, selected, selected and live), and over the worst speckle of any grain laid over the
 * guide. A multiply overprint (two-ink themes) is applied where a theme uses it. Glyphs are drawn with normal blending.
 *
 * No react-native imports, so bun can load this file in tests.
 */
export const ACCENT_SAMPLES: readonly string[] = [...ACCENT_PALETTE.map((s) => s.tint), ...ACCENTS];

export type Check = {
  /** What is being held to a ratio. */
  label: string;
  kind: "text" | "nontext";
  ratio: number;
  /** The ratio it has to reach. */
  need: number;
  /** The accent or fill position it is worst for (empty when there is only one case). */
  who: string;
};

type Case = { ratio: number; who: string };

const hex = (c: Rgba): string => toHex(c);
const withAlpha = (css: string, a: number): string => {
  const { r, g, b } = parseColor(css);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+a.toFixed(3)})`;
};
const worst = (list: Case[]): Case => list.reduce((m, x) => (x.ratio < m.ratio ? x : m), { ratio: Number.POSITIVE_INFINITY, who: "" });

/** The accents a variant's rows can carry. */
export function accentSet(tk: GuideTokens): { name: string; hex: string }[] {
  if (tk.accentMode === "fixed" && tk.accentFixed) return [{ name: "fixed", hex: tk.accentFixed }];
  if (tk.accentMode === "cycle" && tk.accentCycle) return tk.accentCycle.map((h, i) => ({ name: `cycle ${i + 1}`, hex: h }));
  return ACCENT_SAMPLES.map((h, i) => ({ name: i < ACCENT_PALETTE.length ? ACCENT_PALETTE[i]!.name : `fallback ${i - ACCENT_PALETTE.length + 1}`, hex: h }));
}

/** Every pair a variant must keep legible, each at its worst case. `need` is the text target (4.5, or 7 for High Contrast). */
export function analyze(tk: GuideTokens, need = 4.5): Check[] {
  const out: Check[] = [];
  const bg = tk.bg;
  const mult = tk.misregister?.blend === "multiply";
  const grain = tk.patterns.overlay;
  const accents = accentSet(tk);

  /** Ratio of text color `fg` on the opaque `bgc`, with the multiply overprint and the worst grain speckle applied. */
  const ratio = (fg: string, bgc: string): number => {
    let f = fg;
    if (mult) {
      const a = parseColor(fg);
      const b = parseColor(bgc);
      f = hex({ r: (a.r * b.r) / 255, g: (a.g * b.g) / 255, b: (a.b * b.b) / 255, a: 1 });
    }
    let r = contrastRatio(f, bgc);
    if (grain) {
      for (const c of grain.colors) r = Math.min(r, contrastRatio(f, mixColors(bgc, c, grain.alpha)), contrastRatio(mixColors(f, c, grain.alpha), bgc));
    }
    return r;
  };
  const opaque = (top: string, under: string): string => hex(over(top, under));
  const push = (label: string, kind: Check["kind"], c: Case, min: number) => out.push({ label, kind, ratio: c.ratio, need: min, who: c.who });

  const lf = tk.liveFill;
  const fillColor = (v: number | string, accent: string): string => (lf.mode === "tint" ? withAlpha(accent, v as number) : (v as string));
  const restBg = opaque(tk.cellBg, bg);
  const liveBase = opaque(tk.liveCellBg, bg);
  const focusBase = tk.cellFocusBg ? opaque(tk.cellFocusBg, bg) : null;

  // Program cells in each state: resting, live, selected, selected and live.
  const titleCol = { rest: tk.title, live: tk.liveText?.title ?? tk.title, focus: tk.focusText?.title ?? tk.title, focusLive: tk.focusText?.title ?? tk.liveText?.title ?? tk.title };
  const subCol = { rest: tk.sub, live: tk.liveText?.sub ?? tk.sub, focus: tk.focusText?.sub ?? tk.sub, focusLive: tk.focusText?.sub ?? tk.liveText?.sub ?? tk.sub };
  const states: Record<"rest" | "live" | "focus" | "focusLive", { who: string; bg: string }[]> = {
    rest: [{ who: "", bg: restBg }],
    live: [],
    focus: [{ who: "", bg: focusBase ?? restBg }],
    focusLive: [],
  };
  for (const a of accents) {
    for (const [end, v] of [["elapsed", lf.elapsed], ["remain", lf.remain]] as const) {
      states.live.push({ who: `${a.name} ${end}`, bg: opaque(fillColor(v, a.hex), liveBase) });
      states.focusLive.push({ who: `${a.name} ${end}`, bg: opaque(fillColor(v, a.hex), focusBase ?? liveBase) });
    }
  }
  for (const k of ["rest", "live", "focus", "focusLive"] as const) {
    push(`title, ${k}`, "text", worst(states[k].map((s) => ({ ratio: ratio(titleCol[k], s.bg), who: s.who }))), need);
    push(`sub-line, ${k}`, "text", worst(states[k].map((s) => ({ ratio: ratio(subCol[k], s.bg), who: s.who }))), need);
  }

  // Art over a full-bleed scrim: worst of both scrim ends over a white or a black picture. With the art beside the text the
  // text stays on the cell's plate, which the states above already cover.
  if (tk.art.layout === "full") {
    const bgs: { who: string; bg: string }[] = [];
    for (const sc of tk.artScrim) for (const pic of ["#ffffff", "#000000"]) bgs.push({ who: `${sc} over ${pic}`, bg: opaque(sc, pic) });
    push("art title over the scrim", "text", worst(bgs.map((s) => ({ ratio: ratio(tk.artTitle, s.bg), who: s.who }))), need);
    push("art sub-line over the scrim", "text", worst(bgs.map((s) => ({ ratio: ratio(tk.artSub, s.bg), who: s.who }))), need);
  }

  // Rail.
  const railBase = opaque(tk.railBg, bg);
  const rf = tk.railFocus;
  const railFocusBgs = rf
    ? [{ who: "", bg: opaque(rf.bg, bg) }]
    : accents.map((a) => ({ who: a.name, bg: opaque(withAlpha(a.hex, tk.railFocusAlpha), railBase) }));
  push("channel number, resting", "text", { ratio: ratio(tk.number, railBase), who: "" }, need);
  push("channel number, focused", "text", worst(railFocusBgs.map((s) => ({ ratio: ratio(rf?.number ?? tk.numberFocused, s.bg), who: s.who }))), need);
  push("channel name, resting", "text", { ratio: ratio(tk.name, railBase), who: "" }, need);
  push("channel name, focused", "text", worst(railFocusBgs.map((s) => ({ ratio: ratio(rf?.name ?? tk.name, s.bg), who: s.who }))), need);

  // The word that says a cell is live.
  const sl = tk.statusLabel;
  if (sl.mode === "plate" || sl.mode === "burst") push(`"${sl.text}" on its ${sl.mode === "plate" ? "tag" : "burst"}`, "text", { ratio: contrastRatio(sl.fg, sl.bg), who: "" }, need);
  if (sl.mode === "kicker") {
    push(
      "kicker text (resting, live, selected)",
      "text",
      worst([
        ...states.rest.map((s) => ({ ratio: ratio(sl.color, s.bg), who: "resting" })),
        ...states.live.map((s) => ({ ratio: ratio(sl.color, s.bg), who: s.who })),
        { ratio: ratio(tk.focusText?.kicker ?? sl.color, focusBase ?? restBg), who: "selected" },
      ]),
      need,
    );
  }

  // The channel glyph on its circle (3:1) over every accent, on the resting and the focused rail.
  const cs = tk.circleStyle;
  const circleFill = (fillSpec: string, accent: string, base: string): string => {
    if (fillSpec === "accent") return opaque(withAlpha(accent, tk.circle.fillA), base);
    if (fillSpec === "accent-solid") return accent;
    if (fillSpec === "none") return base;
    return opaque(fillSpec, base);
  };
  const glyphCases: Case[] = [];
  for (const a of accents) {
    const fg = accentFg(tk, a.hex);
    const one = (fillSpec: string, glyphSpec: string, base: string): Case => {
      const fill = circleFill(fillSpec, a.hex, base);
      const glyph = glyphSpec === "accent" ? fg : glyphSpec === "auto" ? (contrastRatio("#000000", fill) >= contrastRatio("#ffffff", fill) ? "#000000" : "#ffffff") : glyphSpec;
      return { ratio: contrastRatio(glyph, fill), who: a.name };
    };
    glyphCases.push(one(cs.fill, cs.glyph, railBase));
    if (rf && (rf.circle || rf.glyph)) glyphCases.push(one(rf.circle ?? cs.fill, rf.glyph ?? cs.glyph, rf.bg ? opaque(rf.bg, bg) : railBase));
  }
  push("channel glyph on its circle", "nontext", worst(glyphCases), 3);

  // The heart on the focused rail's circle: outline when not a favorite, filled when it is.
  const heart: Case[] = [];
  for (const a of accents) {
    const wash = rf ? opaque(rf.bg, bg) : opaque(withAlpha(a.hex, tk.railFocusAlpha), railBase);
    const fill = circleFill(rf?.circle ?? cs.fill, a.hex, wash);
    heart.push({ ratio: contrastRatio(tk.heartOff, fill), who: `${a.name} outline` });
    heart.push({ ratio: contrastRatio(tk.fav, fill), who: `${a.name} favorite` });
  }
  push("heart on the focused rail's circle", "nontext", worst(heart), 3);

  // The focus ring: its outermost color against the guide behind it and the live cell it can sit on.
  const outer = tk.ringOuter?.color ?? tk.ring;
  push("focus ring against what it sits on", "nontext", worst([{ ratio: contrastRatio(outer, bg), who: "guide background" }, { ratio: contrastRatio(outer, liveBase), who: "live cell" }]), 3);

  // Time header and featured panel text on their surfaces.
  const headBg = tk.headerStyle?.bg ? opaque(tk.headerStyle.bg, bg) : bg;
  const featBg = tk.featuredPlate ? opaque(tk.featuredPlate.bg, bg) : bg;
  const f = tk.featured;
  const names = accents.map((a) => ({ name: a.name, col: tk.featuredName === "accent" ? accentFg(tk, a.hex) : tk.featuredName }));
  const chrome: Case[] = [
    ...names.map((x) => ({ ratio: ratio(x.col, featBg), who: `featured channel name${names.length > 1 ? ` (${x.name})` : ""}` })),
    ...(tk.featuredName === "accent" && tk.accentMode === "channel"
      ? accents.map((a) => ({ ratio: ratio(hex(over(withAlpha(accentFg(tk, a.hex), f.numberA), featBg)), featBg), who: `featured channel number (${a.name})` }))
      : []),
    { ratio: ratio(tk.headerDay, headBg), who: "header day" },
    { ratio: ratio(tk.headerTick, headBg), who: "header time" },
    { ratio: ratio(f.title, featBg), who: "featured title" },
    { ratio: ratio(f.meta, featBg), who: "featured meta" },
    { ratio: ratio(f.episode, featBg), who: "featured episode" },
  ];
  push("header and featured-panel text", "text", worst(chrome), need);

  // Badge text on both stops of each badge's gradient, and the now marker against its header.
  const badges: Case[] = [];
  for (const [k, b] of Object.entries(tk.badge)) for (const g of b.grad) badges.push({ ratio: contrastRatio(b.text, g), who: `${k} chip` });
  push("badge text", "text", worst(badges), need);
  push("now marker against the header", "nontext", { ratio: contrastRatio(tk.now, headBg), who: "" }, 3);

  // The progress fill against its track, over both ends of the live fill.
  const pr = tk.progress;
  if (pr.style === "bar" || pr.style === "band") {
    const rows: Case[] = [];
    for (const a of accents) {
      const fillC = pr.fill === "accent" ? accentFg(tk, a.hex) : pr.fill;
      for (const v of [lf.elapsed, lf.remain]) rows.push({ ratio: contrastRatio(fillC, opaque(pr.track, opaque(fillColor(v, a.hex), liveBase))), who: a.name });
    }
    push("progress fill against its track", "nontext", worst(rows), 3);
  } else if (pr.style === "ticks" && pr.ticks) {
    const rows: Case[] = [];
    for (const v of [lf.elapsed, lf.remain]) rows.push({ ratio: contrastRatio(pr.ticks.color, opaque(fillColor(v, "#000000"), liveBase)), who: "" });
    push("progress ticks against the plate", "nontext", worst(rows), 3);
  }
  return out;
}

/** The checks a variant fails. */
export const failures = (tk: GuideTokens, need = 4.5): Check[] => analyze(tk, need).filter((c) => c.ratio < c.need);

/**
 * The chrome `analyze` does not cover: the sidebar's labels on its panel, the empty state, and the featured panel's tagline, summary
 * and status line. Held to the same targets (`need` for text, 3:1 for the sidebar's icon). guide-themes.test.ts holds every variant
 * of every theme to them, and pins the two Aurora keeps (the look the guide has always had).
 */
export function analyzeChrome(tk: GuideTokens, need = 4.5): Check[] {
  const panel = toHex(over(tk.sidebar.bg, over(tk.bg, "#000000")));
  const featBg = tk.featuredPlate ? toHex(over(tk.featuredPlate.bg, over(tk.bg, "#000000"))) : tk.bg;
  const text = (label: string, fg: string, bg: string): Check => ({ label, kind: "text", ratio: contrastRatio(fg, bg), need, who: "" });
  return [
    text("sidebar label", tk.glass.label, panel),
    text("sidebar label, lit", tk.glass.labelLit, panel),
    text("sidebar sub-label", tk.glass.sublabel, panel),
    { label: "sidebar icon", kind: "nontext", ratio: contrastRatio(tk.sidebar.icon, panel), need: 3, who: "" },
    text("empty-state title", tk.ghost.title, tk.bg),
    text("empty-state sub-line", tk.ghost.sub, tk.bg),
    text("featured tagline", tk.featured.tagline, featBg),
    text("featured summary", tk.featured.summary, featBg),
    text("featured status", tk.featured.status, featBg),
  ];
}

/** The chrome checks a variant fails. */
export const chromeFailures = (tk: GuideTokens, need = 4.5): Check[] => analyzeChrome(tk, need).filter((c) => c.ratio < c.need);
