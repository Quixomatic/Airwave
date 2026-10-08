/**
 * De-risk the "keep multi-part episodes together" feature (issue #37): scan the MediaItem cache for episodes
 * whose TITLE encodes a part number, and report the consecutive-part RUNS the detection would group — per
 * show, in season/episode order. Proves the title-regex finds real multi-part episodes in a live library
 * BEFORE we build the scheduler change, and surfaces whatever naming conventions this library actually uses
 * (so we can tune the patterns if needed). Read-only, no writes.
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-multipart-episodes.ts [mediaSourceId]
 *
 * The detection here is a standalone copy of what `services/schedule/timeline.ts` will use (fuseMultiPart).
 */
import prisma from "@airwave/db";

const srcArg = process.argv[2];

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, iix: 8, ix: 9, x: 10 };
const ENGLISH: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const PATTERNS: Array<[RegExp, (m: string) => number | null]> = [
  [/^.*\((\d+)\)( - .*)?$/, (m) => (/^\d+$/.test(m) ? Number(m) : null)],
  [/^.*\(?Part (\d+)\)?$/i, (m) => (/^\d+$/.test(m) ? Number(m) : null)],
  [/^.*\(([MDCLXVI]+)\)( - .*)?$/i, (m) => ROMAN[m.toLowerCase()] ?? null],
  [/^.*\(?Part (\w+)\)?$/i, (m) => ENGLISH[m.toLowerCase()] ?? null],
];
const PATTERN_LABELS = ["(N)", "Part N", "(Roman)", "Part Word"];
/** Returns the part number AND which pattern matched (for coverage reporting), or null. */
function detect(title: string | null | undefined): { num: number; pattern: number } | null {
  if (!title) return null;
  for (let p = 0; p < PATTERNS.length; p++) {
    const [re, conv] = PATTERNS[p]!;
    const m = re.exec(title);
    if (m?.[1] != null) {
      const n = conv(m[1]);
      if (n != null) return { num: n, pattern: p };
    }
  }
  return null;
}
function partNumber(title: string | null | undefined): number | null {
  return detect(title)?.num ?? null;
}

/** A title that LOOKS like it could be multi-part but matched no pattern — so we can spot conventions we
 *  don't yet cover (e.g. "Pt. 1", "1 of 2", "(1/2)", "- Part 1 -"). Heuristic, deliberately loose. */
const NEAR_MISS = /\bpart\b|\bpt\.?\b|\(\s*\d+\s*\)|\d+\s*of\s*\d+|\(\s*\d+\s*\/\s*\d+\s*\)|\bchapter\b|\bconclusion\b/i;

// WIDENED patterns (PREVIEW ONLY — not the real detection): catch "Part N" / "Part Roman" / "Part Word"
// anywhere in the title, not just at the end, so "Green with Evil Part 1: Out of Control" and the Adventure
// Time "Elements/Islands/Stakes Part N: …" sagas would group. Shown as a separate section so James can
// decide whether he actually wants these (some are 8-parters) before we widen the real patterns.
const WIDE_PATTERNS: Array<[RegExp, (m: string) => number | null]> = [
  [/\bPart (\d+)\b/i, (m) => (/^\d+$/.test(m) ? Number(m) : null)],
  [/\bPart ([MDCLXVI]+)\b/i, (m) => ROMAN[m.toLowerCase()] ?? null],
  [/\bPart (\w+)\b/i, (m) => ENGLISH[m.toLowerCase()] ?? null],
];
/** Current detection first, then the widened "Part N anywhere" forms. */
function detectWide(title: string | null | undefined): number | null {
  const base = partNumber(title);
  if (base != null) return base;
  if (!title) return null;
  for (const [re, conv] of WIDE_PATTERNS) {
    const m = re.exec(title);
    if (m?.[1] != null) {
      const n = conv(m[1]);
      if (n != null) return n;
    }
  }
  return null;
}

type Ep = { ratingKey: string; title: string; season: number | null; episode: number | null; showKey: string; showTitle: string };
type Run = { showTitle: string; parts: { ep: Ep; num: number }[] };

/** Walk each show in season/episode order and collect runs (length >= 2) of consecutive part numbers,
 *  using the supplied part-number detector. */
function collectRuns(byShow: Map<string, Ep[]>, detectNum: (t: string) => number | null): Run[] {
  const runs: Run[] = [];
  for (const eps of byShow.values()) {
    eps.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
    let current: { ep: Ep; num: number }[] = [];
    let lastNum = 0;
    const flush = () => {
      if (current.length >= 2) runs.push({ showTitle: current[0]!.ep.showTitle, parts: current });
      current = [];
      lastNum = 0;
    };
    for (const ep of eps) {
      const n = detectNum(ep.title);
      if (n != null && current.length > 0 && n === lastNum + 1) {
        current.push({ ep, num: n });
        lastNum = n;
      } else if (n != null) {
        flush();
        current = [{ ep, num: n }];
        lastNum = n;
      } else {
        flush();
      }
    }
    flush();
  }
  return runs;
}
/** Stable identity of a run (its episode set), for diffing current vs widened detection. */
const runSig = (r: Run) => r.parts.map((p) => p.ep.ratingKey).sort().join(",");

async function main() {
  const source = srcArg
    ? await prisma.mediaSource.findUnique({ where: { id: srcArg }, select: { id: true, name: true } })
    : await prisma.mediaSource.findFirst({ select: { id: true, name: true } });
  if (!source) {
    console.error("No media source found.");
    process.exit(1);
  }

  const rows = await prisma.mediaItem.findMany({
    where: { mediaSourceId: source.id, type: "episode", available: true },
    select: { ratingKey: true, title: true, guide: true },
  });
  console.log(`Source: ${source.name} — ${rows.length} available episodes\n`);

  // Normalize + group by show, tallying which pattern matched and collecting near-misses.
  const byShow = new Map<string, Ep[]>();
  const patternCounts = [0, 0, 0, 0];
  const nearMisses = new Set<string>();
  for (const r of rows) {
    const g = (r.guide as Record<string, unknown> | null) ?? {};
    const title = (typeof g.title === "string" ? g.title : r.title) ?? "";
    const d = detect(title);
    if (d) patternCounts[d.pattern]!++;
    else if (NEAR_MISS.test(title)) nearMisses.add(title);

    const showKey = typeof g.showRatingKey === "string" ? g.showRatingKey : null;
    if (!showKey) continue;
    const ep: Ep = {
      ratingKey: r.ratingKey,
      title,
      season: typeof g.season === "number" ? g.season : null,
      episode: typeof g.episode === "number" ? g.episode : null,
      showKey,
      showTitle: typeof g.showTitle === "string" ? g.showTitle : "(unknown show)",
    };
    (byShow.get(showKey) ?? byShow.set(showKey, []).get(showKey)!).push(ep);
  }
  const titled = patternCounts.reduce((a, b) => a + b, 0);
  console.log(`Episodes whose title encodes a part number: ${titled}`);
  console.log(`   by pattern: ${PATTERN_LABELS.map((l, i) => `${l}×${patternCounts[i]}`).join(", ")}\n`);

  // Runs of length >= 2 under the CURRENT (end-anchored) detection — the ones that would be kept together.
  const runs = collectRuns(byShow, partNumber);
  runs.sort((a, b) => b.parts.length - a.parts.length || a.showTitle.localeCompare(b.showTitle));
  console.log(`── Multi-part runs detected (length ≥ 2): ${runs.length} ──`);
  const byLen = new Map<number, number>();
  for (const run of runs) byLen.set(run.parts.length, (byLen.get(run.parts.length) ?? 0) + 1);
  console.log(`   by length: ${[...byLen.entries()].sort((a, b) => a[0] - b[0]).map(([l, c]) => `${l}-part×${c}`).join(", ") || "(none)"}\n`);

  for (const run of runs.slice(0, 40)) {
    const se = (e: Ep) => `S${e.season ?? "?"}E${e.episode ?? "?"}`;
    console.log(`  ${run.showTitle} — ${run.parts.length} parts`);
    for (const { ep, num } of run.parts) console.log(`     [part ${num}] ${se(ep)}  "${ep.title}"`);
  }
  if (runs.length > 40) console.log(`  … and ${runs.length - 40} more`);

  // Near-misses: titles that look multi-part-ish but matched no pattern — conventions we may want to add.
  const nm = [...nearMisses].sort();
  console.log(`\n── Near-misses (look multi-part, matched NO pattern): ${nm.length} distinct ──`);
  for (const t of nm.slice(0, 30)) console.log(`     "${t}"`);
  if (nm.length > 30) console.log(`  … and ${nm.length - 30} more`);

  // WIDENED-PATTERN PREVIEW: runs that a broader "Part N anywhere in the title" detection would ADD on top
  // of the current end-anchored detection. NOT active — just so James can see what widening would pull in
  // (e.g. the 8-part Adventure Time sagas) before deciding.
  const wideRuns = collectRuns(byShow, detectWide);
  const currentSigs = new Set(runs.map(runSig));
  const added = wideRuns.filter((r) => !currentSigs.has(runSig(r)));
  added.sort((a, b) => b.parts.length - a.parts.length || a.showTitle.localeCompare(b.showTitle));
  console.log(`\n── WIDENED-pattern preview (NOT active): ${added.length} ADDITIONAL run(s) "Part N" could catch ──`);
  const addedByLen = new Map<number, number>();
  for (const r of added) addedByLen.set(r.parts.length, (addedByLen.get(r.parts.length) ?? 0) + 1);
  console.log(`   by length: ${[...addedByLen.entries()].sort((a, b) => a[0] - b[0]).map(([l, c]) => `${l}-part×${c}`).join(", ") || "(none)"}`);
  for (const run of added.slice(0, 40)) {
    const se = (e: Ep) => `S${e.season ?? "?"}E${e.episode ?? "?"}`;
    console.log(`  ${run.showTitle} — ${run.parts.length} parts`);
    for (const { ep, num } of run.parts) console.log(`     [part ${num}] ${se(ep)}  "${ep.title}"`);
  }
  if (added.length > 40) console.log(`  … and ${added.length - 40} more`);

  console.log(
    `\nVerdict: ${runs.length > 0 ? `detection found ${runs.length} multi-part run(s) — spot-check the titles above` : "NO runs detected — either no multi-part episodes, or the titles use a convention the patterns don't catch (paste some example episode titles and we can tune)"}.`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Probe crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
