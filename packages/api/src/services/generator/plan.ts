import type { PrismaClient } from "@airwave/db";

import { channelAccentAt } from "../accents";
import { normalizeCallsign, uniqueCallsign } from "./callsign";
import { hashPresetChannel, type MediaType, PRESET_PACKAGES, type PresetChannel, type PresetPackage, RECOMMENDED_KEYS } from "./presets";

/**
 * - "all": reconcile every generated package + channel against the selection.
 * - "packages": refresh only package metadata (name/icon/tint/…), leave channels.
 * - { packageKey }: reconcile just that one package's channels.
 */
export type GenerateScope = "all" | "packages" | { packageKey: string };

export function packagesFor(scope: GenerateScope): PresetPackage[] {
  if (typeof scope === "object") return PRESET_PACKAGES.filter((p) => p.key === scope.packageKey);
  return PRESET_PACKAGES;
}

/** Which preset channels the user wants ON. `channelKeys` is the set of enabled preset `key`s. */
export type PresetSelection = { channelKeys: string[] };

export type PresetOpKind = "create" | "update" | "delete" | "unchanged";

/** One reconciliation op the build will apply (or has decided to leave alone, for `unchanged`). */
export type PresetChannelOp = {
  kind: PresetOpKind;
  packageKey: string;
  packageName: string;
  channelKey: string;
  channelName: string;
  /** The number shown/used: assigned free number for create, existing number otherwise. */
  number: number;
  /** Existing channel id (update / delete / unchanged). */
  channelId?: string;
  /** For create: the reserved free number + deduped callsign + cycled accent tint. */
  assignedNumber?: number;
  assignedCallsign?: string;
  tint?: string;
  /** The target preset content hash (create / update). */
  presetRev?: string;
};

export type PresetPlan = {
  create: PresetChannelOp[];
  update: PresetChannelOp[];
  delete: PresetChannelOp[];
  unchanged: PresetChannelOp[];
};

/**
 * The diff-reconcile engine. Compares the preset catalog (filtered to `scope`) and the user's `selection`
 * against the generated channels that already exist for this source, producing the create / update /
 * delete / unchanged ops. This is the single source of truth behind both the staging badges + net-outcome
 * confirm dialog AND the build itself.
 *
 * - enabled + no channel for this `presetKey` → **create** (free number + callsign reserved here)
 * - enabled + exists + `presetRev` equals current hash → **unchanged** (left alone)
 * - enabled + exists + `presetRev` differs → **update**
 * - disabled (not in selection) + exists → **delete**
 * - existing generated channel whose `presetKey` is no longer in the catalog (in scope) → **delete** (orphan)
 *
 * No `selection` means "everything in scope is enabled" (the lazy / scheduled / headless path). Numbers are
 * reserved here (two-pass: preset numbers that are free are claimed first, then collisions probe upward)
 * so the workflow fanout and the sequential job both create at a pre-assigned, non-colliding number.
 */
export async function planPresetBuild(
  prisma: PrismaClient,
  sourceId: string,
  opts: { scope?: GenerateScope; selection?: PresetSelection } = {},
): Promise<PresetPlan> {
  const scope = opts.scope ?? "all";
  const targets = packagesFor(scope);
  const enabled = opts.selection ? new Set(opts.selection.channelKeys) : null; // null = all enabled

  // Existing generated channels for this source (the diff basis).
  const existing = await prisma.channel.findMany({
    where: { generated: true, mediaSourceId: sourceId },
    select: {
      id: true,
      name: true,
      number: true,
      presetKey: true,
      presetRev: true,
      package: { select: { key: true, name: true } },
    },
  });
  const byKey = new Map<string, (typeof existing)[number]>();
  for (const c of existing) if (c.presetKey) byKey.set(c.presetKey, c);

  // Reserve against ALL channels (manual + generated), not just this source's — `number` is globally unique.
  const allNumbers = await prisma.channel.findMany({ select: { number: true, callsign: true } });
  const reservedNumbers = new Set(allNumbers.map((c) => c.number));
  const reservedCallsigns = new Set(allNumbers.map((c) => c.callsign).filter((c): c is string => !!c));

  const create: PresetChannelOp[] = [];
  const update: PresetChannelOp[] = [];
  const del: PresetChannelOp[] = [];
  const unchanged: PresetChannelOp[] = [];
  const catalogKeys = new Set<string>();

  // Collect creates first so numbers/callsigns can be reserved in two passes below.
  const pendingCreates: { pkg: PresetPackage; ch: PresetChannel }[] = [];

  for (const pkg of targets) {
    for (const ch of pkg.channels) {
      catalogKeys.add(ch.key);
      const isEnabled = enabled ? enabled.has(ch.key) : true;
      const found = byKey.get(ch.key);
      const meta = { packageKey: pkg.key, packageName: pkg.name, channelKey: ch.key, channelName: ch.name };

      if (!isEnabled) {
        if (found) del.push({ ...meta, kind: "delete", number: found.number, channelId: found.id });
        continue;
      }
      if (!found) {
        pendingCreates.push({ pkg, ch });
        continue;
      }
      const hash = hashPresetChannel(ch);
      if (found.presetRev === hash) {
        unchanged.push({ ...meta, kind: "unchanged", number: found.number, channelId: found.id });
      } else {
        update.push({ ...meta, kind: "update", number: found.number, channelId: found.id, presetRev: hash });
      }
    }
  }

  // Orphans: in-scope generated channels whose preset was removed from the catalog entirely.
  for (const c of existing) {
    if (!c.presetKey || catalogKeys.has(c.presetKey)) continue;
    const inScope = scope === "all" || (typeof scope === "object" && c.package?.key === scope.packageKey);
    if (!inScope) continue;
    del.push({
      packageKey: c.package?.key ?? "",
      packageName: c.package?.name ?? "",
      channelKey: c.presetKey,
      channelName: c.name,
      kind: "delete",
      number: c.number,
      channelId: c.id,
    });
  }

  // Two-pass number reservation for creates: preset numbers that are free are claimed first, then
  // collisions probe upward from the lowest free slot. Callsigns dedupe against the live set.
  const claimFree = (from: number): number => {
    let n = from;
    while (reservedNumbers.has(n)) n++;
    reservedNumbers.add(n);
    return n;
  };
  const numberFor = new Map<string, number>();
  for (const { ch } of pendingCreates) {
    if (!reservedNumbers.has(ch.number)) {
      reservedNumbers.add(ch.number);
      numberFor.set(ch.key, ch.number);
    }
  }
  for (const { ch } of pendingCreates) {
    if (!numberFor.has(ch.key)) numberFor.set(ch.key, claimFree(1));
  }

  let accentIndex = 0;
  for (const { pkg, ch } of pendingCreates) {
    const assignedNumber = numberFor.get(ch.key)!;
    const assignedCallsign = uniqueCallsign(normalizeCallsign(ch.callsign), reservedCallsigns);
    create.push({
      packageKey: pkg.key,
      packageName: pkg.name,
      channelKey: ch.key,
      channelName: ch.name,
      kind: "create",
      number: assignedNumber,
      assignedNumber,
      assignedCallsign,
      tint: ch.tint ?? channelAccentAt(accentIndex++),
      presetRev: hashPresetChannel(ch),
    });
  }

  return { create, update, delete: del, unchanged };
}

// --- catalog (staging grid, badges before any resolve) ---------------------

export type PresetCatalogChannel = {
  key: string;
  name: string;
  callsign: string;
  number: number;
  description: string;
  icon?: string;
  tint?: string;
  mediaTypes: MediaType[];
  /** A generated channel with this preset key already exists for the source. */
  exists: boolean;
  /** It exists AND its stored `presetRev` differs from the current preset hash (would be updated). */
  presetChanged: boolean;
  /** Part of the curated "recommended" starter lineup (pre-selected on a first run). */
  recommended: boolean;
};

export type PresetCatalogPackage = {
  key: string;
  name: string;
  description: string;
  icon: string;
  tint: string;
  sortIndex: number;
  channels: PresetCatalogChannel[];
};

/**
 * The full preset catalog annotated with each channel's current diff state (`exists`, `presetChanged`), so
 * the staging grid can render package cards + New/Update/Unchanged/Remove badges BEFORE resolving any filter.
 */
export async function getPresetCatalog(
  prisma: PrismaClient,
  sourceId: string,
): Promise<PresetCatalogPackage[]> {
  const existing = await prisma.channel.findMany({
    where: { generated: true, mediaSourceId: sourceId },
    select: { presetKey: true, presetRev: true },
  });
  const revByKey = new Map<string, string | null>();
  for (const c of existing) if (c.presetKey) revByKey.set(c.presetKey, c.presetRev);

  return PRESET_PACKAGES.map((pkg) => ({
    key: pkg.key,
    name: pkg.name,
    description: pkg.description,
    icon: pkg.icon,
    tint: pkg.tint,
    sortIndex: pkg.sortIndex,
    channels: pkg.channels.map((ch) => {
      const exists = revByKey.has(ch.key);
      return {
        key: ch.key,
        name: ch.name,
        callsign: ch.callsign,
        number: ch.number,
        description: ch.description,
        icon: ch.icon,
        tint: ch.tint,
        mediaTypes: ch.mediaTypes,
        exists,
        presetChanged: exists && revByKey.get(ch.key) !== hashPresetChannel(ch),
        recommended: RECOMMENDED_KEYS.has(ch.key),
      };
    }),
  }));
}
