import { describe, expect, test } from "bun:test";

import type { PrismaClient } from "@airwave/db";

import { clearAllScheduleLocks, ScheduleBusyError, withChannelScheduleLock } from "./lock";

/**
 * A mock Prisma whose `channel.updateMany` emulates the lock column: it honors the acquire where-clause
 * (free OR stale), the conditional release (token match), and the startup sweep (clear all set). Backed
 * by a plain Map of channelId → current lock token (a Date) or null.
 */
function makeMock(initial?: Record<string, Date>) {
  const locks = new Map<string, Date | null>(Object.entries(initial ?? {}));
  const prisma = {
    channel: {
      updateMany: ({
        where,
        data,
      }: {
        where: {
          id?: string;
          scheduleLockedAt?: unknown;
          OR?: { scheduleLockedAt: null | { lt: Date } }[];
        };
        data: { scheduleLockedAt: Date | null };
      }) => {
        // Startup sweep: clear every set lock.
        if (where.scheduleLockedAt && typeof where.scheduleLockedAt === "object" && "not" in where.scheduleLockedAt) {
          let count = 0;
          for (const [id, v] of locks) {
            if (v != null) {
              locks.set(id, null);
              count++;
            }
          }
          return Promise.resolve({ count });
        }
        const id = where.id!;
        if (data.scheduleLockedAt != null) {
          // Acquire: free, or stale past the cutoff carried in where.OR[1].
          const current = locks.get(id) ?? null;
          const staleCutoff = where.OR?.find((c) => c.scheduleLockedAt && "lt" in c.scheduleLockedAt)
            ?.scheduleLockedAt as { lt: Date } | undefined;
          const free = current == null;
          const stale = current != null && staleCutoff != null && current < staleCutoff.lt;
          if (free || stale) {
            locks.set(id, data.scheduleLockedAt);
            return Promise.resolve({ count: 1 });
          }
          return Promise.resolve({ count: 0 });
        }
        // Release: clear only if it's still our token.
        if (locks.get(id) === where.scheduleLockedAt) {
          locks.set(id, null);
          return Promise.resolve({ count: 1 });
        }
        return Promise.resolve({ count: 0 });
      },
    },
  } as unknown as PrismaClient;
  return { prisma, locks };
}

describe("withChannelScheduleLock", () => {
  test("acquires, runs the body, then releases", async () => {
    const { prisma, locks } = makeMock();
    const out = await withChannelScheduleLock(prisma, "c1", async () => {
      expect(locks.get("c1")).toBeInstanceOf(Date); // held during the body
      return 42;
    });
    expect(out).toBe(42);
    expect(locks.get("c1")).toBeNull(); // released after
  });

  test("releases even when the body throws", async () => {
    const { prisma, locks } = makeMock();
    await expect(
      withChannelScheduleLock(prisma, "c1", async () => {
        throw new Error("build blew up");
      }),
    ).rejects.toThrow("build blew up");
    expect(locks.get("c1")).toBeNull(); // finally released
  });

  test("throws ScheduleBusyError when the channel is already locked (budget exhausted)", async () => {
    const { prisma } = makeMock({ c1: new Date() }); // a FRESH lock already held
    let ran = false;
    await expect(
      withChannelScheduleLock(
        prisma,
        "c1",
        async () => {
          ran = true;
        },
        { attempts: 1 }, // fail fast
      ),
    ).rejects.toBeInstanceOf(ScheduleBusyError);
    expect(ran).toBe(false); // body never ran
  });

  test("reclaims a stale lock (older than the stale interval)", async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000); // 10 min old > 5 min stale window
    const { prisma, locks } = makeMock({ c1: stale });
    let ran = false;
    await withChannelScheduleLock(
      prisma,
      "c1",
      async () => {
        ran = true;
      },
      { attempts: 1 },
    );
    expect(ran).toBe(true); // stole the dead lock and ran
    expect(locks.get("c1")).toBeNull(); // released after
  });

  test("different channels don't contend", async () => {
    const { prisma } = makeMock({ c1: new Date() }); // c1 held
    // c2 is free, so it acquires immediately even while c1 is locked.
    const out = await withChannelScheduleLock(prisma, "c2", async () => "ok", { attempts: 1 });
    expect(out).toBe("ok");
  });
});

describe("clearAllScheduleLocks", () => {
  test("clears every set lock and returns the count", async () => {
    const { prisma, locks } = makeMock({ c1: new Date(), c2: new Date() });
    const cleared = await clearAllScheduleLocks(prisma);
    expect(cleared).toBe(2);
    expect(locks.get("c1")).toBeNull();
    expect(locks.get("c2")).toBeNull();
  });
});
