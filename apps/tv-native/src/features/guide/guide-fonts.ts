import type { GuideFontWeight } from "./guide-tokens";

/**
 * Which weights of the bundled theme fonts exist, and which one a piece of text asked for in a weight the family lacks gets.
 *
 * A theme's own text roles name weights the family has (guide-fonts.test.ts holds them to that). The guide also sets text in weights of
 * its own that no theme chose (a kicker in 700, the empty guide's title in 800, a glass button's label in 600): a family that lacks one
 * would leave the choice to the platform. They are resolved here instead, by one rule, so a face never falls back by accident.
 *
 * No react-native imports, so `bun test` can load it.
 */

/** The weights each bundled family has, by style. `app.json`'s expo-font plugin is the truth (guide-fonts.test.ts checks this table against it). */
export const FONT_FACES: Readonly<Record<string, { normal: readonly number[]; italic: readonly number[] }>> = {
  "Atkinson Hyperlegible": { normal: [400, 700], italic: [] },
  "Bangers": { normal: [400], italic: [] },
  "Bricolage Grotesque": { normal: [400, 500, 600, 700, 800], italic: [] },
  "Comic Neue": { normal: [400, 700], italic: [] },
  "Epilogue": { normal: [400, 500, 700, 800, 900], italic: [] },
  "Fraunces": { normal: [700], italic: [600] },
  "IBM Plex Sans Condensed": { normal: [400, 600, 700], italic: [] },
  "Inter Tight": { normal: [400, 500, 700, 800], italic: [] },
  "Source Sans 3": { normal: [400, 600, 700], italic: [] },
};

/**
 * The weight, of those `have`, that stands in for `wanted`: CSS Fonts Level 4's matching (section 5.2), the rule browsers and Android's own
 * font matching follow. An exact weight wins. Between 400 and 500 it looks up to 500 first, then down from `wanted`, then above 500; below
 * 400 it looks down, then up; above 500 it looks up, then down. So a missing 500 becomes 400 (never a bolder 600 or 700), and a missing 800
 * becomes the heaviest weight below it. `have` is empty: `wanted` comes back as it was.
 */
export function matchWeight(have: readonly number[], wanted: number): number {
  if (have.length === 0 || have.includes(wanted)) return wanted;
  const asc = [...have].sort((a, b) => a - b);
  const desc = [...asc].reverse();
  const up = (from: number, to = Infinity) => asc.find((w) => w >= from && w <= to);
  const down = (from: number) => desc.find((w) => w < from);
  if (wanted >= 400 && wanted <= 500) return up(wanted, 500) ?? down(wanted) ?? up(501) ?? asc[0]!;
  if (wanted < 400) return down(wanted) ?? up(wanted) ?? asc[0]!;
  return up(wanted) ?? down(wanted) ?? asc[0]!;
}

/**
 * `wanted` as the weight to ask React Native for in `family`: the weight the family has that stands in for it (see [matchWeight]), from
 * its italic faces when `italic` and it has any, else from its upright ones (a slant it lacks is synthesized by the platform). A family
 * that is not a bundled one (the system font: no family) keeps `wanted`.
 */
export function resolveFontWeight(family: string | null | undefined, wanted: GuideFontWeight, italic = false): GuideFontWeight {
  const faces = family ? FONT_FACES[family] : undefined;
  if (!faces) return wanted;
  const have = italic && faces.italic.length > 0 ? faces.italic : faces.normal;
  return String(matchWeight(have, Number(wanted))) as GuideFontWeight;
}

/**
 * The weights the guide sets text in on its own, outside the theme's text roles, and the face each is set in (`featured` is whichever
 * face the theme gave the featured panel's title). `faceText` resolves each through [resolveFontWeight], so what a theme's family lacks is
 * chosen on purpose; guide-fonts.test.ts walks every theme's faces through this table.
 */
export const FIXED_WEIGHTS = {
  /** The kicker line over a title, the status plate and the burst, and the featured panel's badges. */
  status: { face: "text", weight: "700" },
  /** The empty guide's message. */
  ghost: { face: "display", weight: "800" },
  /** A glass button's label, and the line under it. */
  glassLabel: { face: "text", weight: "600" },
  glassSub: { face: "text", weight: "500" },
  /** The episode part of the featured title (S1, E2 and its name), set lighter than the show's name. */
  episode: { face: "featured", weight: "400" },
} as const satisfies Record<string, { face: "text" | "display" | "featured"; weight: GuideFontWeight }>;
