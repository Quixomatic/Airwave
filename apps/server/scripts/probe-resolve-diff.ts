/**
 * Correctness + speed diff between the live `resolveFilter` (fan-out + client-side combine) and the v2
 * `resolveFilterAdvanced` (one advanced-filter query per library). For each preset channel it resolves BOTH
 * ways and compares the ratingKey SETS (they must be identical) and the wall-clock time. This is the gate:
 * v2 only replaces v1 once every channel MATCHES and it's measurably faster.
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-resolve-diff.ts            # all channels
 *   cd apps/server && bun --env-file=.env run scripts/probe-resolve-diff.ts pkg:drama  # one package
 *   cd apps/server && bun --env-file=.env run scripts/probe-resolve-diff.ts prime-time love-stories
 */
import prisma from "@airwave/db";

import { PRESET_CHANNELS_BY_KEY, PRESET_PACKAGES } from "@airwave/api/services/generator/presets";
import type { FilterNode } from "@airwave/api/services/plex/filter-fields";
import { channelSortParam } from "@airwave/api/services/plex/sort-fields";
import { resolveFilter } from "@airwave/api/services/plex/resolve";
import { resolveFilterAdvanced } from "@airwave/api/services/plex/resolve-advanced";
import { decryptToken } from "@airwave/api/services/plex/token";
import type { OrderingStrategy } from "@airwave/api/services/schedule/timeline";

/** Uniform shape the diff loop resolves — from either the preset catalog or real saved channels. */
type Case = {
  label: string;
  mediaTypes: string[];
  filter?: FilterNode;
  ordering: OrderingStrategy;
  sortField?: string;
  sortDir?: "asc" | "desc";
};

function collectPresets(keys: string[]): Case[] {
  const chans =
    keys.length === 0 || keys.includes("all")
      ? PRESET_PACKAGES.flatMap((p) => p.channels)
      : keys.flatMap((key) =>
          key.startsWith("pkg:")
            ? (PRESET_PACKAGES.find((p) => p.key === key.slice(4))?.channels ?? [])
            : ((e) => (e ? [e.channel] : []))(PRESET_CHANNELS_BY_KEY.get(key)),
        );
  return chans.map((ch) => ({ label: ch.key, mediaTypes: ch.mediaTypes, filter: ch.filter, ordering: ch.ordering, sortField: ch.sortField, sortDir: ch.sortDir }));
}

/** Real saved PREDICATE channels for this source (preset, AI-generated, and manual filter channels alike).
 *  MEMBERSHIP / MANUAL_ITEMS channels don't use `resolveFilter`, so they're skipped. */
async function collectLive(sourceId: string): Promise<Case[]> {
  const rows = await prisma.channel.findMany({
    where: { mediaSourceId: sourceId },
    select: {
      name: true,
      ordering: true,
      sortField: true,
      sortDir: true,
      generated: true,
      aiGenerated: true,
      definitions: { orderBy: { sortIndex: "asc" }, take: 1, select: { kind: true, plexFilter: true } },
    },
    orderBy: { number: "asc" },
  });
  const cases: Case[] = [];
  for (const c of rows) {
    const def = c.definitions[0];
    if (!def || def.kind !== "PREDICATE") continue; // membership/manual don't hit resolveFilter
    const pf = (def.plexFilter as { mediaTypes?: string[]; filter?: FilterNode } | null) ?? {};
    const prov = c.aiGenerated ? "ai" : c.generated ? "preset" : "manual";
    cases.push({
      label: `[${prov}] ${c.name}`.slice(0, 30),
      mediaTypes: pf.mediaTypes ?? ["movie", "show"],
      filter: pf.filter,
      ordering: c.ordering as OrderingStrategy,
      sortField: c.sortField ?? undefined,
      sortDir: (c.sortDir as "asc" | "desc" | null) ?? undefined,
    });
  }
  return cases;
}

const keySet = (items: { ratingKey: string }[]) => new Set(items.map((i) => i.ratingKey));

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const keys = args.filter((a) => a !== "--live");
  const s = await prisma.mediaSource.findFirst({ where: { baseUrl: { not: null }, enabled: true }, orderBy: { isDefault: "desc" } });
  if (!s?.baseUrl) return console.log("No connected source.");
  const src = { id: s.id, baseUrl: s.baseUrl, token: decryptToken(s.token) };

  const channels = live ? await collectLive(src.id) : collectPresets(keys);
  console.log(`${live ? "LIVE saved channels" : "preset catalog"}: ${channels.length} PREDICATE channels\n`);
  let matched = 0;
  let differed = 0;
  let oldTotalMs = 0;
  let newTotalMs = 0;

  for (const ch of channels) {
    const sort = channelSortParam(ch.ordering, ch.sortField ?? "title", ch.sortDir ?? "asc");

    const t0 = performance.now();
    // Force v1 explicitly — resolveFilter now defaults to v2, so this pins the legacy fan-out for the diff.
    const oldItems = await resolveFilter(prisma, src, ch.mediaTypes, ch.filter, sort, { includeStreams: false, resolver: "v1" });
    const t1 = performance.now();
    const newItems = await resolveFilterAdvanced(prisma, src, ch.mediaTypes, ch.filter, sort, { includeStreams: false });
    const t2 = performance.now();

    const oldMs = t1 - t0;
    const newMs = t2 - t1;
    oldTotalMs += oldMs;
    newTotalMs += newMs;

    const a = keySet(oldItems);
    const b = keySet(newItems);
    const onlyOld = [...a].filter((k) => !b.has(k));
    const onlyNew = [...b].filter((k) => !a.has(k));
    const same = onlyOld.length === 0 && onlyNew.length === 0;
    if (same) matched++;
    else differed++;

    const speed = newMs > 0 ? (oldMs / newMs).toFixed(1) : "-";
    const flag = same ? "✓ MATCH" : `✗ DIFF (+${onlyNew.length}/-${onlyOld.length})`;
    console.log(
      `${ch.label.padEnd(30)} old=${String(a.size).padStart(5)} new=${String(b.size).padStart(5)}  ` +
        `${Math.round(oldMs)}ms→${Math.round(newMs)}ms (${speed}x)  ${flag}`,
    );
    if (!same) {
      const lbl = (items: { ratingKey: string; title: string; guide: { showTitle?: string } }[], k: string) => {
        const it = items.find((i) => i.ratingKey === k);
        return it ? `${it.guide.showTitle ?? it.title}#${k}` : k;
      };
      if (onlyOld.length) console.log(`    only in OLD: ${onlyOld.slice(0, 5).map((k) => lbl(oldItems, k)).join(", ")}`);
      if (onlyNew.length) console.log(`    only in NEW: ${onlyNew.slice(0, 5).map((k) => lbl(newItems, k)).join(", ")}`);
    }
  }

  console.log(
    `\n— ${channels.length} channels: ${matched} match, ${differed} differ · ` +
      `total ${Math.round(oldTotalMs)}ms → ${Math.round(newTotalMs)}ms ` +
      `(${(oldTotalMs / Math.max(1, newTotalMs)).toFixed(2)}x) —`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
