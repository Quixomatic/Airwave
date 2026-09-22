/**
 * Iterate on preset channels against the REAL library. Give it channel keys, `pkg:<packageKey>`, or `all`,
 * and it resolves each channel's ACTUAL filter (the one currently in presets.ts) and prints the exact count,
 * the show/movie split, a SKIP flag if it's under its floor, a domination warning if one show owns too much
 * of the pool, and sample titles so you can eyeball whether the channel is any good. Edit presets.ts, re-run,
 * repeat — no server restart needed.
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-preset.ts prestige-tv sitcom-city
 *   cd apps/server && bun --env-file=.env run scripts/probe-preset.ts pkg:drama
 *   cd apps/server && bun --env-file=.env run scripts/probe-preset.ts all --skips
 *   cd apps/server && bun --env-file=.env run scripts/probe-preset.ts hbo --titles 15
 */
import prisma from "@airwave/db";

import { previewFilter } from "@airwave/api/services/agent/tools";
import { PRESET_CHANNELS_BY_KEY, PRESET_PACKAGES, type PresetChannel } from "@airwave/api/services/generator/presets";
import { resolveFilter } from "@airwave/api/services/plex/resolve";
import { channelSortParam } from "@airwave/api/services/plex/sort-fields";
import { decryptToken } from "@airwave/api/services/plex/token";
import { buildSchedule } from "@airwave/api/services/schedule/timeline";
import type { OrderingStrategy } from "@airwave/api/services/schedule/timeline";

function parseArgs(argv: string[]) {
  const keys: string[] = [];
  let titles = 6;
  let skipsOnly = false;
  let sim = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--skips") skipsOnly = true;
    else if (a === "--sim") sim = true;
    else if (a === "--titles") titles = Number(argv[++i]) || 6;
    else keys.push(a);
  }
  return { keys, titles, skipsOnly, sim };
}

/** Resolve the arg list to an ordered, de-duped set of preset channels. */
function collect(keys: string[]): { pkgName: string; ch: PresetChannel }[] {
  const out: { pkgName: string; ch: PresetChannel }[] = [];
  const seen = new Set<string>();
  const push = (pkgName: string, ch: PresetChannel) => {
    if (seen.has(ch.key)) return;
    seen.add(ch.key);
    out.push({ pkgName, ch });
  };
  const wantAll = keys.length === 0 || keys.includes("all");
  if (wantAll) {
    for (const pkg of PRESET_PACKAGES) for (const ch of pkg.channels) push(pkg.name, ch);
    return out;
  }
  for (const key of keys) {
    if (key.startsWith("pkg:")) {
      const pkg = PRESET_PACKAGES.find((p) => p.key === key.slice(4));
      if (!pkg) console.log(`(no package "${key.slice(4)}")`);
      else for (const ch of pkg.channels) push(pkg.name, ch);
    } else {
      const entry = PRESET_CHANNELS_BY_KEY.get(key);
      if (!entry) console.log(`(no channel "${key}")`);
      else push(entry.pkg.name, entry.channel);
    }
  }
  return out;
}

/**
 * Air the first ~30 items the way the real scheduler would (base ordering + the channel's strategy), so we
 * can SEE rotation working — no single show should hog consecutive slots. previewFilter can't show this
 * because it resolves the pool, not the play order.
 */
async function simulate(ch: PresetChannel, src: { id: string; baseUrl: string; token: string }): Promise<void> {
  const sort = channelSortParam(ch.ordering as OrderingStrategy, ch.sortField ?? "title", ch.sortDir ?? "asc");
  const pool = await resolveFilter(prisma, src, ch.mediaTypes, ch.filter, sort, { includeStreams: false });
  const label = new Map(pool.map((i) => [i.ratingKey, i.guide.showTitle ?? i.title]));
  const built = buildSchedule(pool, ch.ordering as OrderingStrategy, 12345, new Date(), 6 * 3600, null, { strategy: ch.strategy ?? null });
  const seq = built.entries
    .filter((e) => e.kind === "PROGRAM" && e.ratingKey)
    .slice(0, 30)
    .map((e) => label.get(e.ratingKey!) ?? e.ratingKey!);
  // longest run of the same label back-to-back (1 = perfect rotation)
  let maxRun = 1;
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    run = seq[i] === seq[i - 1] ? run + 1 : 1;
    maxRun = Math.max(maxRun, run);
  }
  console.log(`   SIM (${ch.strategy ? "rotation on" : "no strategy"}, longest same-show run ${maxRun}):`);
  console.log(`     ${seq.join(" → ")}`);
}

async function main() {
  const { keys, titles, skipsOnly, sim } = parseArgs(process.argv.slice(2));
  const source = await prisma.mediaSource.findFirst({ where: { baseUrl: { not: null }, enabled: true }, orderBy: { isDefault: "desc" } });
  if (!source) return console.log("No connected source.");
  const sid = source.id;
  const src = { id: source.id, baseUrl: source.baseUrl!, token: decryptToken(source.token) };

  const channels = collect(keys);
  let skipCount = 0;

  for (const { pkgName, ch } of channels) {
    let r;
    try {
      r = await previewFilter(prisma, {
        mediaSourceId: sid,
        mediaTypes: ch.mediaTypes,
        filter: ch.filter,
        sortField: ch.sortField,
        sortDir: ch.sortDir,
        detail: "tiles",
        includeStreams: false,
      });
    } catch (e) {
      console.log(`\n#${ch.number} ${ch.name}  [${pkgName}]  ERROR ${e instanceof Error ? e.message : e}`);
      continue;
    }

    const skip = r.totalItems < ch.minItems;
    if (skipsOnly && !skip) continue;
    if (skip) skipCount++;

    // Domination: the single biggest show as a share of all matched items (episodes + movies). High share on
    // a channel WITHOUT show rotation = one series will hog the airtime.
    const topShow = r.items.find((i) => i.episodes != null);
    const domShare = topShow?.episodes ? Math.round((topShow.episodes / r.totalItems) * 100) : 0;
    const hasRotation = ch.strategy ? " rot" : "";

    const flags = [
      skip ? `SKIP<${ch.minItems}` : "",
      domShare >= 25 && !ch.strategy ? `DOMINATED ${domShare}% ${topShow?.title}` : "",
    ].filter(Boolean).join("  ");

    console.log(
      `\n#${ch.number} ${ch.name}  [${pkgName}]  (${ch.mediaTypes.join("+")}${hasRotation})` +
        `\n   total=${r.totalItems}  shows=${r.showCount}  movies=${r.movieCount}  floor=${ch.minItems}` +
        (flags ? `  ⚠ ${flags}` : "  ✓"),
    );
    console.log(`   "${ch.description}"`);
    const sample = r.items.slice(0, titles).map((i) => (i.episodes != null ? `${i.title} (${i.episodes}ep)` : i.title));
    if (sample.length) console.log(`   ${sample.join(" · ")}`);
    if (sim) await simulate(ch, src);
  }

  console.log(`\n— ${channels.length} channel(s), ${skipCount} would skip —`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
