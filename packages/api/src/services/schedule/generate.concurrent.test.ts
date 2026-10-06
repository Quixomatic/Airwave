import { describe, expect, test } from "bun:test";

import type { PrismaClient } from "@airwave/db";

process.env.SKIP_ENV_VALIDATION = "1";

const { extendChannelSchedule, generateChannelSchedule, repairChannelSchedule } = await import(
  "./generate"
);

type Mutator = (prisma: PrismaClient, channelId: string) => Promise<unknown>;

const mutators = {
  extend: extendChannelSchedule,
  generate: generateChannelSchedule,
  repair: repairChannelSchedule,
} satisfies Record<string, Mutator>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function nextTurn() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A minimal Prisma mock exercising the DB-field lock (`Channel.scheduleLockedAt`):
 * - `channel.updateMany` emulates acquire (set the lock iff free) and release (clear iff still ours).
 * - `channel.findUnique` records reads; the FIRST one hangs (a build "in flight" holding the lock),
 *   later ones resolve `null` so the build short-circuits with "Channel not found" (we only care about
 *   lock ordering here, not a real build). A `findUnique` therefore only happens once a build has the
 *   lock, so the `reads` array is a proxy for "who got in".
 */
function makeMock(firstRead: Promise<null>) {
  const reads: string[] = [];
  const locks = new Map<string, unknown>();
  let readCount = 0;
  const prisma = {
    channel: {
      findUnique: ({ where }: { where: { id: string } }) => {
        reads.push(where.id);
        return readCount++ === 0 ? firstRead : Promise.resolve(null);
      },
      updateMany: ({ where, data }: { where: { id: string; scheduleLockedAt?: unknown }; data: { scheduleLockedAt: unknown } }) => {
        if (data.scheduleLockedAt != null) {
          // acquire: succeed only if this channel is free
          if (locks.get(where.id) == null) {
            locks.set(where.id, data.scheduleLockedAt);
            return Promise.resolve({ count: 1 });
          }
          return Promise.resolve({ count: 0 });
        }
        // release: clear only if the lock is still ours (token match)
        if (locks.get(where.id) === where.scheduleLockedAt) {
          locks.set(where.id, null);
          return Promise.resolve({ count: 1 });
        }
        return Promise.resolve({ count: 0 });
      },
    },
  } as unknown as PrismaClient;
  return { prisma, reads };
}

describe("channel schedule mutation concurrency", () => {
  const cases = [
    ["extend", "extend"],
    ["extend", "generate"],
    ["extend", "repair"],
    ["generate", "generate"],
  ] as const;

  for (const [firstName, secondName] of cases) {
    test(`${firstName} + ${secondName} serialize for one channel`, async () => {
      const firstRead = deferred<null>();
      const { prisma, reads } = makeMock(firstRead.promise);

      const first = mutators[firstName](prisma, "same-channel").catch((error) => error);
      await nextTurn();
      const second = mutators[secondName](prisma, "same-channel").catch((error) => error);
      await nextTurn();

      // The second build is blocked on the lock (its acquire keeps returning "busy"), so only the
      // first has read the channel so far.
      expect(reads).toEqual(["same-channel"]);

      // Let the first build finish (it releases the lock); the second then acquires on a retry and reads.
      firstRead.resolve(null);
      await first;
      await second;
      expect(reads).toEqual(["same-channel", "same-channel"]);
    });
  }

  test("different channels mutate concurrently", async () => {
    const firstRead = deferred<null>();
    const { prisma, reads } = makeMock(firstRead.promise);

    const first = mutators.extend(prisma, "channel-a").catch((error) => error);
    await nextTurn();
    const second = mutators.generate(prisma, "channel-b").catch((error) => error);
    await nextTurn();

    // Independent locks → the second doesn't wait on the first; both read right away.
    expect(reads).toEqual(["channel-a", "channel-b"]);

    firstRead.resolve(null);
    await Promise.all([first, second]);
  });
});
