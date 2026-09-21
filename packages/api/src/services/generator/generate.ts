import { Prisma, type PrismaClient } from "@airwave/db";

import type { SyncProgress } from "../media/media-item";
import { resolveFilter } from "../plex/resolve";
import { decryptToken } from "../plex/token";
import { INITIAL_WINDOW_SECONDS, generateChannelSchedule } from "../schedule/generate";
import {
  type GenerateScope,
  type PresetChannelOp,
  type PresetSelection,
  packagesFor,
  planPresetBuild,
} from "./plan";
import { clearPresetAbort, finishPresetRun, registerPresetAbort, startChannelTrace, updateChannelTrace } from "./preset-run";
import { PRESET_CHANNELS_BY_KEY, type PresetChannel } from "./presets";

export type { GenerateScope, PresetSelection } from "./plan";

type ResolveSource = { id: string; baseUrl: string; token: string };

export type GenerateResult = {
  scope: string;
  packages: number;
  channelsCreated: number;
  channelsUpdated: number;
  channelsDeleted: number;
  skipped: { name: string; count: number; needed: number }[];
};

export type MaterializeResult =
  | { status: "created"; channelId: string; itemCount: number }
  | { status: "updated"; channelId: string; itemCount: number }
  | { status: "skipped"; itemCount: number; needed: number; reason?: string };

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The PREDICATE definition payload for a preset channel. */
function predicateDef(ch: PresetChannel) {
  return {
    kind: "PREDICATE" as const,
    plexFilter: {
      mediaTypes: ch.mediaTypes,
      ...(ch.filter ? { filter: JSON.parse(JSON.stringify(ch.filter)) } : {}),
    } as Prisma.InputJsonValue,
  };
}

const strategyValue = (ch: PresetChannel) =>
  ch.strategy ? (JSON.parse(JSON.stringify(ch.strategy)) as Prisma.InputJsonValue) : Prisma.JsonNull;

/**
 * Create or update ONE preset channel — the shared per-channel op used by both the workflow fanout step
 * and the sequential job loop. Resolves the filter, then:
 *  - CREATE (op.channelId absent): skip if under `minItems`, else create the channel + PREDICATE def at the
 *    reserved number/callsign, and lay a windowed initial schedule. Idempotent on the unique `number`
 *    (a prior attempt that already created it counts as created).
 *  - UPDATE (op.channelId set): overwrite the preset-defined fields + `presetRev`, replace the PREDICATE
 *    def, and rebuild the schedule. Keeps the channel's number, callsign, tint, and enabled flag.
 *
 * Only ever touches `generated` channels (callers pass ops derived from the diff, never manual/AI channels).
 */
export async function materializePresetChannel(
  prisma: PrismaClient,
  src: ResolveSource,
  op: PresetChannelOp,
): Promise<MaterializeResult> {
  const entry = PRESET_CHANNELS_BY_KEY.get(op.channelKey);
  if (!entry) return { status: "skipped", itemCount: 0, needed: 0, reason: "unknown preset key" };
  const ch = entry.channel;

  const pkg = await prisma.channelPackage.findUnique({ where: { key: op.packageKey }, select: { id: true } });
  if (!pkg) throw new Error(`preset package "${op.packageKey}" not found — upsert packages before materializing`);

  const items = await resolveFilter(prisma, src, ch.mediaTypes, ch.filter, "titleSort");
  const presetRev = op.presetRev!;

  // ---- UPDATE -------------------------------------------------------------
  if (op.channelId) {
    await prisma.channel.update({
      where: { id: op.channelId },
      data: {
        name: ch.name,
        description: ch.description,
        icon: ch.icon ?? null,
        ordering: ch.ordering,
        sortField: ch.sortField ?? "title",
        sortDir: ch.sortDir ?? "asc",
        strategy: strategyValue(ch),
        packageId: pkg.id,
        presetRev,
      },
    });
    // Replace the channel's definition with the current PREDICATE (preset channels are single-def).
    await prisma.channelDefinition.deleteMany({ where: { channelId: op.channelId } });
    await prisma.channelDefinition.create({ data: { channelId: op.channelId, ...predicateDef(ch) } });
    await rebuildSchedule(prisma, op.channelId, ch.name);
    return { status: "updated", channelId: op.channelId, itemCount: items.length };
  }

  // ---- CREATE -------------------------------------------------------------
  if (items.length < ch.minItems) {
    return { status: "skipped", itemCount: items.length, needed: ch.minItems };
  }

  const number = op.assignedNumber!;
  // Idempotent: a prior attempt (WDK re-dispatch / job resume) may already have created this exact channel.
  const already = await prisma.channel.findUnique({
    where: { number },
    select: { id: true, presetKey: true },
  });
  if (already?.presetKey === op.channelKey) {
    return { status: "created", channelId: already.id, itemCount: items.length };
  }

  try {
    const created = await prisma.channel.create({
      data: {
        name: ch.name,
        number,
        callsign: op.assignedCallsign ?? null,
        description: ch.description,
        mediaSourceId: src.id,
        ordering: ch.ordering,
        sortField: ch.sortField ?? "title",
        sortDir: ch.sortDir ?? "asc",
        strategy: strategyValue(ch),
        icon: ch.icon ?? null,
        tint: op.tint ?? null,
        packageId: pkg.id,
        generated: true,
        presetKey: ch.key,
        presetRev,
        definitions: { create: predicateDef(ch) },
      },
      select: { id: true },
    });
    await rebuildSchedule(prisma, created.id, ch.name);
    return { status: "created", channelId: created.id, itemCount: items.length };
  } catch (err) {
    // A unique-constraint hit on `number` means a concurrent attempt won the slot — treat ours as created.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.channel.findUnique({ where: { number }, select: { id: true, presetKey: true } });
      if (existing?.presetKey === op.channelKey) return { status: "created", channelId: existing.id, itemCount: items.length };
    }
    throw err;
  }
}

/** Delete one generated preset channel (cascades its definitions + schedule). Idempotent. */
export async function removePresetChannel(prisma: PrismaClient, channelId: string): Promise<void> {
  try {
    await prisma.channel.delete({ where: { id: channelId } });
  } catch (err) {
    // Already gone (a prior attempt / concurrent delete) — fine.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return;
    throw err;
  }
}

/** Build the windowed initial schedule so a channel is watchable the moment the build finishes. Best-effort. */
async function rebuildSchedule(prisma: PrismaClient, channelId: string, label: string): Promise<void> {
  try {
    await generateChannelSchedule(prisma, channelId, { windowSeconds: INITIAL_WINDOW_SECONDS });
  } catch (err) {
    console.warn(`[generator] initial schedule build failed for "${label}" (backfill will retry):`, err);
  }
}

/** Load the resolve source (decrypted token) for a media source, or throw if it isn't connected. */
export async function loadPresetSource(prisma: PrismaClient, sourceId: string): Promise<ResolveSource> {
  const source = await prisma.mediaSource.findUnique({ where: { id: sourceId } });
  if (!source?.baseUrl) throw new Error("Source is not connected.");
  return { id: source.id, baseUrl: source.baseUrl, token: decryptToken(source.token) };
}

/** Upsert the generated package metadata for the scope, keeping ids stable across builds. */
export async function upsertPresetPackages(prisma: PrismaClient, scope: GenerateScope): Promise<Map<string, string>> {
  const pkgIdByKey = new Map<string, string>();
  for (const pkg of packagesFor(scope)) {
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
      select: { id: true },
    });
    pkgIdByKey.set(pkg.key, row.id);
  }
  return pkgIdByKey;
}

/**
 * Auto-lineup generator — the SEQUENTIAL (job) executor. Reconciles the generated channel set to the
 * selection via {@link planPresetBuild}: creates new channels, updates changed ones, leaves unchanged ones
 * alone, and deletes turned-off / orphaned ones. Manual + AI channels are never touched. When a `runId` is
 * given, per-channel outcomes are traced into the owned `PresetRun` ledger; the run row itself is created
 * and finished by the caller (job dispatch), except here where we finish it if we own the whole run.
 *
 * The workflow path does NOT go through this function — it fans the same ops out across steps. This is the
 * `WORKFLOW_ENABLED=0` fallback (and race-free, being one-at-a-time on the unique `number`).
 */
export async function generateLineup(
  prisma: PrismaClient,
  sourceId: string,
  opts: {
    scope?: GenerateScope;
    selection?: PresetSelection;
    onProgress?: SyncProgress;
    runId?: string;
    signal?: AbortSignal;
  } = {},
): Promise<GenerateResult> {
  const scope = opts.scope ?? "all";
  const src = await loadPresetSource(prisma, sourceId);

  const pkgIdByKey = await upsertPresetPackages(prisma, scope);

  if (scope === "packages") {
    return { scope: "packages", packages: pkgIdByKey.size, channelsCreated: 0, channelsUpdated: 0, channelsDeleted: 0, skipped: [] };
  }

  const plan = await planPresetBuild(prisma, sourceId, { scope, selection: opts.selection });
  const { runId } = opts;

  let created = 0;
  let updated = 0;
  let deleted = 0;
  const skipped: GenerateResult["skipped"] = [];

  const total = plan.delete.length + plan.create.length + plan.update.length;
  let done = 0;

  // Deletes first (frees numbers, though the plan already reserved around current state).
  for (const op of plan.delete) {
    if (opts.signal?.aborted) break;
    opts.onProgress?.({ current: done++, total, label: op.channelName });
    const traceId = runId ? await startChannelTrace(prisma, runId, op) : null;
    try {
      await removePresetChannel(prisma, op.channelId!);
      deleted++;
      await updateChannelTrace(prisma, traceId, { status: "done" });
    } catch (err) {
      console.warn(`[generator] delete failed for "${op.channelName}":`, err);
      await updateChannelTrace(prisma, traceId, { status: "failed", reason: errMsg(err) });
    }
  }

  for (const op of [...plan.create, ...plan.update]) {
    if (opts.signal?.aborted) break;
    opts.onProgress?.({ current: done++, total, label: op.channelName });
    const traceId = runId ? await startChannelTrace(prisma, runId, op) : null;
    try {
      const r = await materializePresetChannel(prisma, src, op);
      if (r.status === "created") {
        created++;
        await updateChannelTrace(prisma, traceId, { status: "done", itemCount: r.itemCount });
      } else if (r.status === "updated") {
        updated++;
        await updateChannelTrace(prisma, traceId, { status: "done", itemCount: r.itemCount });
      } else {
        skipped.push({ name: op.channelName, count: r.itemCount, needed: r.needed });
        await updateChannelTrace(prisma, traceId, {
          status: "done",
          reason: `only ${r.itemCount} of ${r.needed} needed`,
          itemCount: r.itemCount,
        });
      }
    } catch (err) {
      console.warn(`[generator] build failed for "${op.channelName}":`, err);
      await updateChannelTrace(prisma, traceId, { status: "failed", reason: errMsg(err) });
    }
  }

  // Drop any generated package that ended up with no channels.
  await prisma.channelPackage.deleteMany({ where: { generated: true, channels: { none: {} } } });

  if (runId) {
    await finishPresetRun(prisma, runId, {
      status: opts.signal?.aborted ? "cancelled" : "done",
      created,
      updated,
      deleted,
      skipped,
    });
  }

  return {
    scope: typeof scope === "object" ? scope.packageKey : scope,
    packages: pkgIdByKey.size,
    channelsCreated: created,
    channelsUpdated: updated,
    channelsDeleted: deleted,
    skipped,
  };
}

/**
 * Resume any JOB-mode preset build left `running` by a process that died mid-run — called once on server
 * startup (regardless of `WORKFLOW_ENABLED`, since job runs happen when the engine is off). Recomputes the
 * diff from CURRENT state and finishes the remainder: already-applied ops drop out naturally (created/updated
 * channels now match their `presetRev` → unchanged; deleted ones are already gone), so it is idempotent with
 * no wipe/bookkeeping to reconcile. Workflow-mode runs resume via the WDK itself, not here.
 */
export async function resumePresetJobRuns(prisma: PrismaClient): Promise<void> {
  const stuck = await prisma.presetRun.findMany({
    where: { status: "running", mode: "job" },
    select: { id: true, sourceId: true, selection: true },
  });
  if (stuck.length === 0) return;
  console.log(`[preset] resuming ${stuck.length} interrupted job run(s)`);
  for (const run of stuck) {
    const sel = run.selection as { channelKeys?: string[] } | null;
    const selection = sel?.channelKeys ? { channelKeys: sel.channelKeys } : undefined;
    const controller = registerPresetAbort(run.id);
    void generateLineup(prisma, run.sourceId, { selection, runId: run.id, signal: controller.signal })
      .catch(async (err) => {
        console.error(`[preset] resume failed for ${run.id}:`, err);
        await finishPresetRun(prisma, run.id, { status: "failed" });
      })
      .finally(() => clearPresetAbort(run.id));
  }
}
