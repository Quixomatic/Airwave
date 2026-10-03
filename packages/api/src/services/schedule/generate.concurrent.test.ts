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
      const reads: string[] = [];
      const prisma = {
        channel: {
          findUnique: ({ where }: { where: { id: string } }) => {
            reads.push(where.id);
            return reads.length === 1 ? firstRead.promise : Promise.resolve(null);
          },
        },
      } as unknown as PrismaClient;

      const first = mutators[firstName](prisma, "same-channel").catch((error) => error);
      await nextTurn();
      const second = mutators[secondName](prisma, "same-channel").catch((error) => error);
      await nextTurn();

      expect(reads).toEqual(["same-channel"]);

      firstRead.resolve(null);
      await first;
      await nextTurn();
      expect(reads).toEqual(["same-channel", "same-channel"]);
      await second;
    });
  }

  test("different channels can mutate concurrently", async () => {
    const firstRead = deferred<null>();
    const reads: string[] = [];
    const prisma = {
      channel: {
        findUnique: ({ where }: { where: { id: string } }) => {
          reads.push(where.id);
          return where.id === "channel-a" ? firstRead.promise : Promise.resolve(null);
        },
      },
    } as unknown as PrismaClient;

    const first = mutators.extend(prisma, "channel-a").catch((error) => error);
    await nextTurn();
    const second = mutators.generate(prisma, "channel-b").catch((error) => error);
    await nextTurn();

    expect(reads).toEqual(["channel-a", "channel-b"]);

    firstRead.resolve(null);
    await Promise.all([first, second]);
  });
});
