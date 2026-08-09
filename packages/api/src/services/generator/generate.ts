import type { PrismaClient } from "@airwave/db";

import { channelAccentAt } from "../accents";
import type { SyncProgress } from "../media/media-item";
import { resolveFilter } from "../plex/resolve";
import { INITIAL_WINDOW_SECONDS, generateChannelSchedule } from "../schedule/generate";
import { normalizeCallsign, uniqueCallsign } from "./callsign";
import { PRESET_PACKAGES, type PresetPackage } from "./presets";

/**
 * - "all": rebuild every generated package + channel.
 * - "packages": refresh only package metadata (name/icon/tint/…), leave channels.
 * - { packageKey }: rebuild just that one package's channels.
 */
export type GenerateScope = "all" | "packages" | { packageKey: string };

export type GenerateResult = {
  scope: string;
  packages: number;
  channelsCreated: number;
  skipped: { name: string; count: number; needed: number }[];
};

function packagesFor(scope: GenerateScope): PresetPackage[] {
  if (typeof scope === "object") return PRESET_PACKAGES.filter((p) => p.key === scope.packageKey);
  return PRESET_PACKAGES;
}

/**
 * Auto-lineup generator. Presets are evaluated against the library and instantiated
 * into packages + channels where enough content matches. Idempotent: packages upsert
 * by key (stable ids), generated channels in scope are wiped + rebuilt — manual
 * channels/packages are never touched.
 */
export async function generateLineup(
  prisma: PrismaClient,
  sourceId: string,
  opts: { scope?: GenerateScope; onProgress?: SyncProgress } = {},
): Promise<GenerateResult> {
  const scope = opts.scope ?? "all";
  const source = await prisma.mediaSource.findUnique({ where: { id: sourceId } });
  if (!source?.baseUrl) throw new Error("Source is not connected.");
  const src = { id: source.id, baseUrl: source.baseUrl, token: source.token };
  const targets = packagesFor(scope);

  // Upsert package metadata (all scopes) — keeps ids stable across regens.
  const pkgIdByKey = new Map<string, string>();
  for (const pkg of targets) {
    const row = await prisma.channelPackage.upsert({
      where: { key: pkg.key },
      create: {
        key: pkg.key,
        name: pkg.name,
        description: pkg.description,
        icon: pkg.icon,
        tint: pkg.tint,
        sortIndex: pkg.sortIndex,
        generated: true,
      },
      update: {
        name: pkg.name,
        description: pkg.description,
        icon: pkg.icon,
        tint: pkg.tint,
        sortIndex: pkg.sortIndex,
        generated: true,
      },
    });
    pkgIdByKey.set(pkg.key, row.id);
  }

  if (scope === "packages") {
    return { scope: "packages", packages: targets.length, channelsCreated: 0, skipped: [] };
  }

  // Wipe the generated channels in scope (all, or just this package's).
  await prisma.channel.deleteMany({
    where: {
      generated: true,
      mediaSourceId: sourceId,
      ...(typeof scope === "object" ? { package: { key: scope.packageKey } } : {}),
    },
  });

  // Reserve numbers used by the surviving (manual + other-scope) channels.
  const existing = await prisma.channel.findMany({ select: { number: true, callsign: true } });
  const used = new Set(existing.map((c) => c.number));
  const nextFree = (n: number) => {
    let x = n;
    while (used.has(x)) x++;
    used.add(x);
    return x;
  };
  const usedCallsigns = new Set(
    existing.map((c) => c.callsign).filter((c): c is string => !!c),
  );

  const total = targets.reduce((s, p) => s + p.channels.length, 0);
  let done = 0;
  let channelsCreated = 0;
  const skipped: GenerateResult["skipped"] = [];

  for (const pkg of targets) {
    for (const ch of pkg.channels) {
      opts.onProgress?.({ current: done++, total, label: ch.name });
      const items = await resolveFilter(prisma, src, ch.mediaTypes, ch.filter, "titleSort");
      if (items.length < ch.minItems) {
        skipped.push({ name: ch.name, count: items.length, needed: ch.minItems });
        continue;
      }
      const created = await prisma.channel.create({
        data: {
          name: ch.name,
          number: nextFree(ch.number),
          callsign: uniqueCallsign(normalizeCallsign(ch.callsign), usedCallsigns),
          description: ch.description,
          mediaSourceId: sourceId,
          ordering: ch.ordering,
          sortField: ch.sortField ?? "title",
          sortDir: ch.sortDir ?? "asc",
          icon: ch.icon ?? null,
          // Per-channel accent for guide VARIANCE: cycle the palette by a running index so
          // adjacent channels contrast, instead of every channel inheriting its package's one
          // color (which banded the guide). A preset that sets its own `tint` still wins.
          tint: ch.tint ?? channelAccentAt(channelsCreated),
          packageId: pkgIdByKey.get(pkg.key)!,
          generated: true,
          presetKey: ch.key,
          definitions: {
            create: {
              kind: "PREDICATE",
              plexFilter: {
                mediaTypes: ch.mediaTypes,
                ...(ch.filter ? { filter: JSON.parse(JSON.stringify(ch.filter)) } : {}),
              },
            },
          },
        },
      });
      // Build a WINDOWED initial schedule inline (like the AI + manual paths) so each generated
      // channel is watchable the moment generation finishes rather than trickling in via
      // schedule-backfill (25/10min); `schedule-refresh` grows it out from the stored cursor.
      // Best-effort — a failure leaves it for backfill instead of aborting the whole run. (Note: the
      // filter resolves twice here — once above for the min-items check, once inside — the same
      // double-resolve the AI path has; passing the pool through is a future optimisation.)
      try {
        await generateChannelSchedule(prisma, created.id, { windowSeconds: INITIAL_WINDOW_SECONDS });
      } catch (err) {
        console.warn(`[generator] initial schedule build failed for "${ch.name}" (backfill will retry):`, err);
      }
      channelsCreated++;
    }
  }

  // Drop any generated package that ended up with no channels.
  await prisma.channelPackage.deleteMany({ where: { generated: true, channels: { none: {} } } });

  return {
    scope: typeof scope === "object" ? scope.packageKey : scope,
    packages: pkgIdByKey.size,
    channelsCreated,
    skipped,
  };
}
