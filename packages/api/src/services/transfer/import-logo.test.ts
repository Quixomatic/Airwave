import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@airwave/db";

import type { ChannelPlan, ImportedChannel } from "./import";

// import.ts reaches the schedule generator, which reads the server env at load; nothing here needs a real one.
process.env.SKIP_ENV_VALIDATION = "1";

const { executeChannelPlan } = await import("./import");

/** A prisma that has no channel at the number and records what is created. `disabled` plans lay no schedule, so nothing else is touched. */
function recorder() {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    channel: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: "ch-1" };
      },
    },
  } as unknown as PrismaClient;
  return { prisma, created };
}

const plan = (logo: ImportedChannel["logo"]): ChannelPlan => ({
  signature: "sig",
  originalNumber: 7,
  assignedNumber: 7,
  numberReassigned: false,
  name: "News",
  packageKey: null,
  action: "create",
  disabled: true,
  droppedKinds: [],
  libraryUnmatched: false,
  definitions: [],
  source: { number: 7, name: "News", ...(logo === undefined ? {} : { logo }) },
});

const OPTS = { packageId: null, targetSourceId: "src-1", userId: "u-1", dryRun: false } as const;

async function importedLogo(logo: ImportedChannel["logo"]): Promise<unknown> {
  const { prisma, created } = recorder();
  const r = await executeChannelPlan(prisma, plan(logo), OPTS);
  expect(r.status).toBe("created");
  expect(created.length).toBe(1);
  return created[0]?.logo;
}

describe("import: the channel logo (the same rule as export, portableChannelLogo)", () => {
  test("an https logo is kept, in its canonical form", async () => {
    expect(await importedLogo("https://logos.example.com/news.png")).toBe("https://logos.example.com/news.png");
    expect(await importedLogo("HTTPS://Logos.example.com/news.png")).toBe("https://logos.example.com/news.png");
  });

  test("a path on a server is dropped: it names something that exists only on the server that exported it", async () => {
    expect(await importedLogo("/img/ch1?path=%2Flibrary%2Fmetadata%2F42%2Fthumb")).toBeNull();
    expect(await importedLogo("/logos/news.png")).toBeNull();
  });

  test("an address that is not a usable logo is dropped", async () => {
    for (const bad of ["http://logos.example.com/a.png", "javascript:alert(1)", "//logos.example.com/a.png", "not an address", ""]) {
      expect(await importedLogo(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  test("a channel with no logo (or a null one) imports with none", async () => {
    expect(await importedLogo(undefined)).toBeNull();
    expect(await importedLogo(null)).toBeNull();
  });
});
