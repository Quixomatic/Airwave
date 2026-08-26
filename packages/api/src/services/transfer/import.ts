import { Prisma, type PrismaClient } from "@airwave/db";

import { normalizeCallsign } from "../generator/callsign";
import type { FilterNode } from "../plex/filter-fields";
import { type ResolveSource, resolveFilter } from "../plex/resolve";
import { channelSortParam } from "../plex/sort-fields";
import { decryptToken } from "../plex/token";
import { INITIAL_WINDOW_SECONDS, generateChannelSchedule } from "../schedule/generate";
import { sourceReadiness } from "../sources/readiness";
import { LINEUP_EXPORT_VERSION } from "./export";

/**
 * The shape of an uploaded lineup file (produced by `exportLineup`). Kept structural + tolerant — an
 * older/other instance may omit fields. Validation of the envelope happens at the router (zod); here we
 * only read what we need.
 */
export type ImportedDefinition = {
  kind: string; // "PREDICATE" | "PLEX_COLLECTION" | "PLEX_PLAYLIST" | "MANUAL_ITEMS"
  mode?: string;
  sortIndex?: number;
  plexFilter?: unknown;
  plexLibraryTitle?: string | null;
};
export type ImportedChannel = {
  number: number;
  name: string;
  callsign?: string | null;
  description?: string | null;
  icon?: string | null;
  tint?: string | null;
  enabled?: boolean;
  sortIndex?: number;
  ordering?: string;
  sortField?: string;
  sortDir?: string;
  bumperMode?: string;
  packageKey?: string | null;
  definitions?: ImportedDefinition[];
};
export type ImportedPackage = {
  key: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  tint?: string | null;
  sortIndex?: number;
};
export type ImportedLineup = {
  version: number;
  exportedAt?: string;
  packages: ImportedPackage[];
  channels: ImportedChannel[];
};

// Defaults applied when an export omits a field — must match `createChannel`'s so an imported
// channel's signature matches an equivalent existing one that was created with defaults.
const DEFAULT_ORDERING = "SHUFFLE";
const DEFAULT_SORT_FIELD = "title";
const DEFAULT_SORT_DIR = "asc";

/* ---------------- Content signature (dedupe) ----------------------------- */

/**
 * Deterministic JSON — object keys sorted recursively — so two structurally-equal values (a filter
 * tree whose keys were written in a different order) stringify identically and therefore hash the same.
 */
function canonicalJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const norm = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return null; // defensive; export data is a tree, but never loop
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(norm);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val === undefined) continue;
      out[k] = norm(val);
    }
    return out;
  };
  return JSON.stringify(norm(value));
}

/**
 * A channel's content signature — what makes two channels "the same" for dedupe, independent of
 * instance. Deliberately EXCLUDES the number (a re-import preserves numbers, but identical content is
 * the same channel even if the number differs) and appearance-only fields. It's the name, its package,
 * its ordering, and the canonicalized PREDICATE filter(s) — the substance that decides what plays.
 * Non-predicate defs are ignored (they're dropped on import anyway).
 */
function signatureParts(args: {
  name: string;
  packageKey: string | null;
  ordering: string;
  sortField: string;
  sortDir: string;
  predicateFilters: unknown[];
}): string {
  // Sort the canonicalized filters so def order doesn't change the signature.
  const filters = args.predicateFilters.map(canonicalJson).sort();
  return canonicalJson([
    args.name.trim(),
    args.packageKey ?? "",
    args.ordering,
    args.sortField,
    args.sortDir,
    filters,
  ]);
}

/** Signature of an imported channel (from the uploaded file). */
function importedChannelSignature(c: ImportedChannel): string {
  const predicateFilters = (c.definitions ?? [])
    .filter((d) => d.kind === "PREDICATE")
    .map((d) => d.plexFilter ?? null);
  return signatureParts({
    name: c.name,
    packageKey: c.packageKey ?? null,
    ordering: c.ordering ?? DEFAULT_ORDERING,
    sortField: c.sortField ?? DEFAULT_SORT_FIELD,
    sortDir: c.sortDir ?? DEFAULT_SORT_DIR,
    predicateFilters,
  });
}

type ExistingChannelForSig = {
  name: string;
  ordering: string;
  sortField: string;
  sortDir: string;
  package: { key: string } | null;
  definitions: { kind: string; plexFilter: Prisma.JsonValue }[];
};

/** Signature of a channel already on this instance. */
function existingChannelSignature(c: ExistingChannelForSig): string {
  const predicateFilters = c.definitions
    .filter((d) => d.kind === "PREDICATE")
    .map((d) => d.plexFilter ?? null);
  return signatureParts({
    name: c.name,
    packageKey: c.package?.key ?? null,
    ordering: c.ordering,
    sortField: c.sortField,
    sortDir: c.sortDir,
    predicateFilters,
  });
}

/** Every existing channel's content signature — the set an import dedupes against. */
async function loadExistingSignatures(prisma: PrismaClient): Promise<Set<string>> {
  const rows = await prisma.channel.findMany({
    select: {
      name: true,
      ordering: true,
      sortField: true,
      sortDir: true,
      package: { select: { key: true } },
      definitions: { select: { kind: true, plexFilter: true } },
    },
  });
  return new Set(rows.map(existingChannelSignature));
}

/* ---------------- Staging preview (read-only) ---------------------------- */

/** Per-channel staging annotation — what will happen to this channel if imported. */
export type ChannelPreview = {
  number: number;
  name: string;
  callsign: string | null;
  /** Definition kinds that will be dropped (collections/playlists/manual — per-server, not portable). */
  droppedKinds: string[];
  /** No PREDICATE definition survives → the channel would have an empty pool, so it imports DISABLED. */
  willBeDisabled: boolean;
  /** The channel's number is already taken on this instance → it'll be reassigned to the next free one. */
  numberInUse: boolean;
  /** A predicate filter is scoped to a library this instance doesn't have → it falls back to all libraries. */
  libraryUnmatched: boolean;
  /** An identical channel already exists here (same content signature) → it'll be skipped on import. */
  duplicate: boolean;
};

export type PackagePreview = {
  key: string;
  name: string;
  icon: string | null;
  tint: string | null;
  /** A package with this key already exists here → it'll be reused (channels added to it). */
  exists: boolean;
  channels: ChannelPreview[];
};

export type ImportPreview = {
  version: number;
  supported: boolean; // version we understand
  source: { id: string; name: string; ready: boolean } | null;
  packages: PackagePreview[];
  /** Channels with no package in the file — grouped for selection under "Ungrouped". */
  ungrouped: ChannelPreview[];
  totals: { packages: number; channels: number; duplicates: number };
};

const UNGROUPED = "__ungrouped__";

/**
 * Annotate an uploaded lineup against THIS instance, without writing anything — powers the staging screen
 * (pick which packages/channels to import). Flags per channel: dropped non-portable definitions, whether it
 * would import disabled (no predicate left), number collisions (reassigned on import), unmatched libraries
 * (fall back to all), and whether it's an exact **duplicate** of a channel already here (skipped on import).
 */
export async function previewImport(
  prisma: PrismaClient,
  data: ImportedLineup,
  targetSourceId: string,
): Promise<ImportPreview> {
  const source = await prisma.mediaSource.findUnique({
    where: { id: targetSourceId },
    select: { id: true, name: true, enabled: true, baseUrl: true, syncStatus: true, _count: { select: { mediaItems: true } } },
  });
  const [existingNumbers, existingKeys, libraries, existingSignatures] = await Promise.all([
    prisma.channel.findMany({ select: { number: true } }),
    prisma.channelPackage.findMany({ select: { key: true } }),
    source ? prisma.mediaLibrary.findMany({ where: { mediaSourceId: targetSourceId }, select: { title: true } }) : Promise.resolve([]),
    loadExistingSignatures(prisma),
  ]);
  const numberSet = new Set(existingNumbers.map((c) => c.number));
  const keySet = new Set(existingKeys.map((p) => p.key));
  const libTitles = new Set(libraries.map((l) => l.title.toLowerCase()));

  let duplicates = 0;
  const annotate = (c: ImportedChannel): ChannelPreview => {
    const defs = c.definitions ?? [];
    const predicate = defs.filter((d) => d.kind === "PREDICATE");
    const droppedKinds = defs.filter((d) => d.kind !== "PREDICATE").map((d) => d.kind);
    const libraryUnmatched = predicate.some(
      (d) => d.plexLibraryTitle != null && !libTitles.has(d.plexLibraryTitle.toLowerCase()),
    );
    const duplicate = existingSignatures.has(importedChannelSignature(c));
    if (duplicate) duplicates++;
    return {
      number: c.number,
      name: c.name,
      callsign: c.callsign ?? null,
      droppedKinds,
      willBeDisabled: predicate.length === 0,
      numberInUse: numberSet.has(c.number),
      libraryUnmatched,
      duplicate,
    };
  };

  // Group channels by package key (null → ungrouped).
  const byPkg = new Map<string, ImportedChannel[]>();
  for (const c of data.channels) {
    const k = c.packageKey ?? UNGROUPED;
    (byPkg.get(k) ?? byPkg.set(k, []).get(k)!).push(c);
  }

  const packages: PackagePreview[] = data.packages.map((p) => ({
    key: p.key,
    name: p.name,
    icon: p.icon ?? null,
    tint: p.tint ?? null,
    exists: keySet.has(p.key),
    channels: (byPkg.get(p.key) ?? []).map(annotate),
  }));
  const ungrouped = (byPkg.get(UNGROUPED) ?? []).map(annotate);

  return {
    version: data.version,
    supported: data.version === LINEUP_EXPORT_VERSION,
    source: source ? { id: source.id, name: source.name, ready: sourceReadiness(source).ready } : null,
    packages,
    ungrouped,
    totals: { packages: data.packages.length, channels: data.channels.length, duplicates },
  };
}

/* ---------------- Import plan (deterministic, read-only) ----------------- */

/** A PREDICATE definition resolved against the target: library remapped by title, ready to persist. */
export type ResolvedDefinition = {
  mode: string;
  sortIndex: number;
  plexFilter: unknown;
  /** Remapped from the file's library title to this source's key; null = search all libraries. */
  plexLibraryKey: string | null;
};

export type ChannelPlan = {
  signature: string;
  originalNumber: number;
  /** The number this channel actually gets — original if free, else the next free one. */
  assignedNumber: number;
  numberReassigned: boolean;
  name: string;
  packageKey: string | null;
  /** "create" or "skip-duplicate" (an identical channel already exists). */
  action: "create" | "skip-duplicate";
  /** No PREDICATE definition survives → imports disabled (nothing to schedule). */
  disabled: boolean;
  droppedKinds: string[];
  libraryUnmatched: boolean;
  definitions: ResolvedDefinition[];
  /** The raw channel (appearance fields read at execute time). */
  source: ImportedChannel;
};

export type PackagePlan = {
  key: string;
  name: string;
  /** "reuse" an existing package with this key, or "create" a new one preserving the key. */
  action: "reuse" | "create";
  source: ImportedPackage;
};

export type ImportPlan = {
  targetSourceId: string;
  dryRun: boolean;
  packages: PackagePlan[];
  channels: ChannelPlan[];
  counts: { toCreate: number; skipDuplicate: number; disabled: number; reassigned: number };
};

/**
 * Build the deterministic import plan — resolves package reuse, channel dedupe, number assignment
 * (preserve-or-probe-upward, reserving in-memory across the whole run), and library remap — WITHOUT
 * writing anything. Its own step in the workflow (like the AI lineup's numbering step) so a resumed run
 * replays the identical plan rather than re-deriving it against changed state.
 *
 * `selectedNumbers` (when given) limits the plan to the channels the admin ticked in staging; omit for
 * "everything in the file".
 */
export async function planImport(
  prisma: PrismaClient,
  data: ImportedLineup,
  opts: { targetSourceId: string; selectedNumbers?: number[]; dryRun?: boolean },
): Promise<ImportPlan> {
  const dryRun = opts.dryRun ?? false;
  const selected = opts.selectedNumbers ? new Set(opts.selectedNumbers) : null;

  const [existingNumbers, existingKeys, libraries, existingSignatures] = await Promise.all([
    prisma.channel.findMany({ select: { number: true } }),
    prisma.channelPackage.findMany({ select: { key: true } }),
    prisma.mediaLibrary.findMany({ where: { mediaSourceId: opts.targetSourceId }, select: { key: true, title: true } }),
    loadExistingSignatures(prisma),
  ]);
  const keySet = new Set(existingKeys.map((p) => p.key));
  // Title (lowercased) → this source's library key, so a def's library travels by name.
  const libByTitle = new Map(libraries.map((l) => [l.title.toLowerCase(), l.key]));
  // Numbers reserved as we assign — starts from what's already on the instance.
  const reserved = new Set(existingNumbers.map((c) => c.number));

  const chosen = data.channels.filter((c) => !selected || selected.has(c.number));

  // First classify each channel (dedupe + resolve defs + disabled), THEN assign numbers in two passes
  // so channels whose original number is free keep it before collisions probe.
  type Draft = ChannelPlan & { keepsOriginal: boolean };
  const drafts: Draft[] = chosen.map((c) => {
    const defs = c.definitions ?? [];
    const predicate = defs.filter((d) => d.kind === "PREDICATE");
    const droppedKinds = [...new Set(defs.filter((d) => d.kind !== "PREDICATE").map((d) => d.kind))];
    let libraryUnmatched = false;
    const definitions: ResolvedDefinition[] = predicate.map((d, i) => {
      let plexLibraryKey: string | null = null;
      if (d.plexLibraryTitle != null) {
        const key = libByTitle.get(d.plexLibraryTitle.toLowerCase());
        if (key) plexLibraryKey = key;
        else libraryUnmatched = true; // scoped to a library we don't have → all libraries
      }
      return {
        mode: d.mode ?? "INCLUDE",
        sortIndex: d.sortIndex ?? i,
        plexFilter: d.plexFilter ?? null,
        plexLibraryKey,
      };
    });
    const signature = importedChannelSignature(c);
    const isDuplicate = existingSignatures.has(signature);
    return {
      signature,
      originalNumber: c.number,
      assignedNumber: c.number, // provisional; set below
      numberReassigned: false,
      name: c.name,
      packageKey: c.packageKey ?? null,
      action: isDuplicate ? "skip-duplicate" : "create",
      disabled: predicate.length === 0,
      droppedKinds,
      libraryUnmatched,
      definitions,
      source: c,
      keepsOriginal: false,
    };
  });

  // Only channels we'll actually create consume numbers. Process ascending original number so lower
  // numbers claim their spot first.
  const toCreate = drafts.filter((d) => d.action === "create").sort((a, b) => a.originalNumber - b.originalNumber);

  // Pass 1: anything whose original number is free keeps it.
  for (const d of toCreate) {
    if (!reserved.has(d.originalNumber)) {
      d.assignedNumber = d.originalNumber;
      d.keepsOriginal = true;
      reserved.add(d.originalNumber);
    }
  }
  // Pass 2: collisions probe upward to the next free (and now-unreserved) number.
  for (const d of toCreate) {
    if (d.keepsOriginal) continue;
    let n = d.originalNumber + 1;
    while (reserved.has(n)) n++;
    d.assignedNumber = n;
    d.numberReassigned = true;
    reserved.add(n);
  }

  // Which packages are needed — only those referenced by a channel we'll create.
  const neededKeys = new Set(
    toCreate.map((d) => d.packageKey).filter((k): k is string => k != null),
  );
  const pkgByKey = new Map(data.packages.map((p) => [p.key, p]));
  const packages: PackagePlan[] = [...neededKeys].map((key) => {
    const src = pkgByKey.get(key) ?? { key, name: key };
    return { key, name: src.name, action: keySet.has(key) ? "reuse" : "create", source: src };
  });

  const channels: ChannelPlan[] = drafts.map(({ keepsOriginal: _k, ...plan }) => plan);
  return {
    targetSourceId: opts.targetSourceId,
    dryRun,
    packages,
    channels,
    counts: {
      toCreate: toCreate.length,
      skipDuplicate: drafts.filter((d) => d.action === "skip-duplicate").length,
      disabled: toCreate.filter((d) => d.disabled).length,
      reassigned: toCreate.filter((d) => d.numberReassigned).length,
    },
  };
}

/* ---------------- Execution brains (dryRun-aware) ------------------------ */

/**
 * Create (or reuse) a package for the import. Reuse by `key` — never duplicated — so a re-import is a
 * no-op at the package level. A created package PRESERVES the file's key (channels link by it, and dedupe
 * needs it stable), unlike the AI generator which mints a fresh slug. Dry-run resolves the id if it
 * already exists but never creates.
 *
 * Returns the package's real id, or null in dry-run when it would have been created.
 */
export async function executePackagePlan(
  prisma: PrismaClient,
  plan: PackagePlan,
  opts: { dryRun: boolean },
): Promise<{ key: string; id: string | null; action: "reused" | "created" | "would-create" }> {
  if (plan.action === "reuse") {
    const existing = await prisma.channelPackage.findUnique({ where: { key: plan.key }, select: { id: true } });
    if (existing) return { key: plan.key, id: existing.id, action: "reused" };
    // Fell out from under us since planning — fall through to create.
  }
  if (opts.dryRun) return { key: plan.key, id: null, action: "would-create" };

  const sortIndex =
    plan.source.sortIndex ??
    ((await prisma.channelPackage.aggregate({ _max: { sortIndex: true } }))._max.sortIndex ?? 0) + 1;
  const p = await prisma.channelPackage.create({
    data: {
      key: plan.key, // preserved from the file — NOT a fresh slug
      name: plan.source.name,
      description: plan.source.description ?? null,
      icon: plan.source.icon ?? null,
      tint: plan.source.tint ?? null,
      sortIndex,
    },
  });
  return { key: plan.key, id: p.id, action: "created" };
}

export type ChannelImportResult = {
  number: number;
  name: string;
  status: "created" | "skipped" | "failed";
  disabled: boolean;
  /** True when dry-run — "created" means "would create". */
  dryRun: boolean;
  reason?: string;
  channelId?: string;
  poolSize?: number;
  scheduleSlots?: number;
  numberReassigned?: boolean;
};

/**
 * Resolve a dry-run pool size for a set of PREDICATE definitions — the true match count against this
 * source's Plex, so the report/preview shows "channel X → 177 items" (and catches filters that match
 * nothing) without persisting anything. INCLUDE defs add, EXCLUDE defs remove, deduped by ratingKey —
 * the same combining `resolveChannel` does at real build time.
 */
async function resolveDryRunPool(
  prisma: PrismaClient,
  source: ResolveSource,
  defs: ResolvedDefinition[],
): Promise<number> {
  const pool = new Map<string, true>();
  const ordered = [...defs].sort((a, b) => a.sortIndex - b.sortIndex);
  const sort = channelSortParam("SHUFFLE", DEFAULT_SORT_FIELD, DEFAULT_SORT_DIR);
  for (const d of ordered) {
    const pf = (d.plexFilter as { mediaTypes?: string[]; filter?: unknown } | null) ?? {};
    const mediaTypes = pf.mediaTypes ?? ["movie", "show"];
    const tree = pf.filter ? (JSON.parse(JSON.stringify(pf.filter)) as FilterNode) : undefined;
    const items = await resolveFilter(prisma, source, mediaTypes, tree, sort);
    if (d.mode === "EXCLUDE") for (const i of items) pool.delete(i.ratingKey);
    else for (const i of items) pool.set(i.ratingKey, true);
  }
  return pool.size;
}

/**
 * Import one channel per the plan. Skips duplicates outright. In dry-run, resolves the pool size for the
 * report but writes nothing. Otherwise creates the channel + its PREDICATE definitions (library remapped),
 * at the assigned number, then lays a windowed initial schedule so it's watchable immediately — exactly
 * like the AI lineup's `buildChannel`, minus the AI.
 *
 * `packageId` is the resolved id for this channel's package (null → ungrouped / would-create in dry-run).
 */
export async function executeChannelPlan(
  prisma: PrismaClient,
  plan: ChannelPlan,
  opts: { packageId: string | null; targetSourceId: string; userId: string; dryRun: boolean; source?: ResolveSource },
): Promise<ChannelImportResult> {
  const base = {
    number: plan.assignedNumber,
    name: plan.name,
    disabled: plan.disabled,
    dryRun: opts.dryRun,
    numberReassigned: plan.numberReassigned,
  };

  if (plan.action === "skip-duplicate") {
    return { ...base, status: "skipped", reason: "identical channel already exists" };
  }

  // Resolve a real pool size when we can reach Plex (always in dry-run; also nice for the real report).
  let poolSize: number | undefined;
  if (opts.source && plan.definitions.length > 0) {
    try {
      poolSize = await resolveDryRunPool(prisma, opts.source, plan.definitions);
    } catch (err) {
      // Non-fatal: a filter that can't resolve just leaves the pool size unknown in the report.
      console.warn(`[import] ${plan.name}: pool resolve failed:`, err);
    }
  }

  if (opts.dryRun) {
    return {
      ...base,
      status: "created", // "would create"
      poolSize,
      reason: plan.disabled ? "no portable filter — would import disabled" : undefined,
    };
  }

  // Idempotent retry — same pattern as the AI builder's channel reservation. `planImport` assigns
  // `assignedNumber` from the FREE set, so a channel already sitting at that number can only be one a
  // PRIOR attempt of this step created (WDK re-dispatches an in-flight step, or retries a crashed one).
  // Treat it as already-created rather than colliding on the unique number and failing the run.
  const already = await prisma.channel.findUnique({
    where: { number: plan.assignedNumber },
    select: { id: true },
  });
  if (already) return { ...base, status: "created", channelId: already.id, poolSize };

  try {
    const c = await prisma.channel.create({
      data: {
        name: plan.source.name,
        callsign: plan.source.callsign ? normalizeCallsign(plan.source.callsign) : null,
        number: plan.assignedNumber,
        description: plan.source.description ?? null,
        icon: plan.source.icon ?? null,
        tint: plan.source.tint ?? null,
        // Import disabled if there's nothing to schedule, else honor the file (default enabled).
        enabled: plan.disabled ? false : (plan.source.enabled ?? true),
        sortIndex: plan.source.sortIndex ?? 0,
        ordering: (plan.source.ordering as never) ?? DEFAULT_ORDERING,
        sortField: plan.source.sortField ?? DEFAULT_SORT_FIELD,
        sortDir: plan.source.sortDir ?? DEFAULT_SORT_DIR,
        bumperMode: (plan.source.bumperMode as never) ?? undefined,
        mediaSourceId: opts.targetSourceId,
        packageId: opts.packageId,
        createdById: opts.userId,
        definitions: {
          create: plan.definitions.map((d) => ({
            kind: "PREDICATE" as const,
            mode: (d.mode as never) ?? "INCLUDE",
            sortIndex: d.sortIndex,
            plexFilter: (d.plexFilter ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            plexLibraryKey: d.plexLibraryKey,
          })),
        },
      },
    });

    // Windowed initial schedule so it's watchable the moment the run finishes; the hourly
    // schedule-refresh grows it from the stored cursor. Disabled channels have no pool → skip.
    let scheduleSlots: number | undefined;
    if (!plan.disabled) {
      try {
        const summary = await generateChannelSchedule(prisma, c.id, { windowSeconds: INITIAL_WINDOW_SECONDS });
        scheduleSlots = summary.itemCount;
        poolSize = summary.poolSize;
      } catch (err) {
        // The channel is real; only its initial timeline failed. schedule-backfill retries any
        // enabled channel with no schedule.
        console.warn(`[import] ${plan.name}: schedule build failed (backfill will retry):`, err);
      }
    }

    return { ...base, status: "created", channelId: c.id, poolSize, scheduleSlots };
  } catch (err) {
    // Retry-safety: WDK re-runs a step whose result wasn't checkpointed (a crash after the write, or two
    // workers racing the same queued step in dev). The plan's assigned number is deterministic, so a
    // unique-constraint hit on `number` means a PRIOR attempt already created this channel — treat it as
    // created (idempotent) rather than failing the whole run.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.channel.findUnique({ where: { number: plan.assignedNumber }, select: { id: true } });
      if (existing) return { ...base, status: "created", channelId: existing.id, poolSize };
    }
    return { ...base, status: "failed", reason: err instanceof Error ? err.message : String(err), poolSize };
  }
}

/** Load a ResolveSource for pool resolution — null if the source has no base URL (can't reach Plex). */
export async function loadResolveSource(
  prisma: PrismaClient,
  sourceId: string,
): Promise<ResolveSource | null> {
  const s = await prisma.mediaSource.findUnique({ where: { id: sourceId }, select: { id: true, baseUrl: true, token: true } });
  if (!s?.baseUrl) return null;
  return { id: s.id, baseUrl: s.baseUrl, token: decryptToken(s.token) };
}
