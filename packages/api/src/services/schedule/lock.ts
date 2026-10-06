import type { PrismaClient } from "@airwave/db";

import { retry } from "../../lib/retry";

/**
 * A schedule build (generate/extend/repair) is already running for this channel and the wait budget
 * was exhausted. Callers decide how to react: background jobs skip the channel (it retries next cycle),
 * the admin UI shows a "try again" message, the workflow SDK retries the step.
 */
export class ScheduleBusyError extends Error {
  constructor(public readonly channelId: string) {
    super(`A schedule build is already in progress for channel ${channelId}`);
    this.name = "ScheduleBusyError";
  }
}

/**
 * A lock older than this is treated as dead (a crashed / killed / in-process-hung build) and can be
 * reclaimed, so a wedged build can't deadlock a channel forever. Must comfortably exceed the slowest
 * legitimate build + Plex resolve (which the lock is held across) — else an active build could be
 * wrongly stolen. 5 min is well clear of any real build.
 */
const STALE_MS = 5 * 60 * 1000;

/**
 * Serialize materialized-schedule builds for one channel (generate/extend/repair) while letting
 * unrelated channels build in parallel. Backed by `Channel.scheduleLockedAt` (not an in-memory map),
 * so it survives process restarts and across instances, and is observable.
 *
 * - **Acquire:** one atomic `UPDATE` that takes the lock only if it's free OR has gone stale. On
 *   contention it backoff-retries (via {@link retry}) for a bounded budget, then throws
 *   {@link ScheduleBusyError}. Different channels never contend (the `where` is keyed on `id`).
 * - **Release** (in `finally`): clears the lock only if it's still OURS — the acquire timestamp is the
 *   fencing token, so a wedged build that wakes up after its lock was reclaimed can't clobber the new
 *   holder (its `UPDATE` matches zero rows).
 *
 * `opts.attempts` tunes the wait budget (short for the admin UI so the button fails fast; the default
 * for jobs/workflow). `opts.signal` lets a cancelled job stop waiting mid-backoff.
 */
export async function withChannelScheduleLock<T>(
  prisma: PrismaClient,
  channelId: string,
  mutate: () => Promise<T>,
  opts: { signal?: AbortSignal; attempts?: number } = {},
): Promise<T> {
  const token = new Date(); // our acquire time — doubles as the ownership / fencing token

  await retry(
    async () => {
      const staleCutoff = new Date(Date.now() - STALE_MS);
      const got = await prisma.channel.updateMany({
        where: {
          id: channelId,
          OR: [{ scheduleLockedAt: null }, { scheduleLockedAt: { lt: staleCutoff } }],
        },
        data: { scheduleLockedAt: token },
      });
      if (got.count === 0) throw new ScheduleBusyError(channelId);
    },
    {
      attempts: opts.attempts ?? 8,
      signal: opts.signal,
      retryable: (e) => e instanceof ScheduleBusyError,
    },
  );

  try {
    return await mutate();
  } finally {
    // Conditional release: only clear the lock if it's still ours (same timestamp). If a later build
    // reclaimed our stale lock, its timestamp differs and this matches zero rows — a no-op.
    await prisma.channel.updateMany({
      where: { id: channelId, scheduleLockedAt: token },
      data: { scheduleLockedAt: null },
    });
  }
}
