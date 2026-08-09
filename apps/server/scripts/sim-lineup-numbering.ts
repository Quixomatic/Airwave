/**
 * Harness for the AI lineup's channel NUMBERING (v0.5.42), run against the real database.
 *
 * READ-ONLY: `assignChannelNumbers` only ever does a `findMany`, so this exercises the real
 * allocator against real occupancy without writing anything. That matters because the tricky
 * cases are all about what's already there — a reused preset package whose channels sit at
 * 1-999 and needs a fresh 1000+ block, a package that already owns a block and should keep
 * it, and collisions with numbers held by channels this run doesn't touch.
 *
 * Run: bun --env-file=.env scripts/sim-lineup-numbering.ts
 */
import prisma from "@airwave/db";

import {
  assignChannelNumbers,
  type LineupPlanDraft,
} from "@airwave/api/services/agent/lineup-plan";

/** Minimal stand-in for a planned channel — numbering ignores everything but identity. */
const channel = (key: string) =>
  ({
    key,
    name: key,
    description: "",
    theme: "",
    targetPoolSize: 10,
    ordering: "SHUFFLE",
    icon: "lucide:Tv",
    mediaTypes: ["movie", "show"],
    filter: { type: "condition", field: "genre", op: "is", value: "Action" },
  }) as unknown as LineupPlanDraft["packages"][number]["channels"][number];

const pkg = (key: string, count: number, existingKey?: string) =>
  ({
    key,
    existingKey,
    name: key,
    description: "",
    icon: "lucide:Folder",
    accent: "blue",
    channels: Array.from({ length: count }, (_, i) => channel(`${key}-ch${i + 1}`)),
  }) as unknown as LineupPlanDraft["packages"][number];

async function main() {
  const existing = await prisma.channel.findMany({
    select: { number: true, packageId: true },
    orderBy: { number: "asc" },
  });
  const packages = await prisma.channelPackage.findMany({
    select: { id: true, key: true, name: true },
    orderBy: { sortIndex: "asc" },
  });

  const taken = new Set(existing.map((c) => c.number));
  console.log(
    `DB: ${existing.length} channels, ${packages.length} packages · ` +
      `numbers ${existing[0]?.number ?? "-"}..${existing[existing.length - 1]?.number ?? "-"} · ` +
      `${existing.filter((c) => c.number >= 1000).length} already in the 1000+ block`,
  );

  // Reuse the first two real packages; add two brand-new ones. The reused ones are the
  // interesting case — they must be given a fresh 1000+ block if their channels are low.
  const reuseA = packages[0];
  const reuseB = packages[1];
  const draft: LineupPlanDraft = {
    packages: [
      ...(reuseA ? [pkg("reuse-a", 3, reuseA.key)] : []),
      pkg("brand-new-1", 4),
      ...(reuseB ? [pkg("reuse-b", 2, reuseB.key)] : []),
      pkg("brand-new-2", 3),
    ],
  };

  // createPackages would map plan key -> real id; reused entries point at the real row.
  const packageIds: Record<string, string> = {
    ...(reuseA ? { "reuse-a": reuseA.id } : {}),
    ...(reuseB ? { "reuse-b": reuseB.id } : {}),
    "brand-new-1": "new-id-1",
    "brand-new-2": "new-id-2",
  };

  const plan = await assignChannelNumbers(prisma, draft, packageIds);

  console.log("\nASSIGNMENT");
  const assigned: number[] = [];
  for (const p of plan.packages) {
    const reused = p.existingKey ? ` (reusing "${p.existingKey}")` : "";
    console.log(`  ${p.key}${reused} — block ${p.numberBase}`);
    for (const c of p.channels) {
      console.log(`      ${c.number}  ${c.key}  accent=${c.accent}`);
      assigned.push(c.number);
    }
  }

  // The three properties that actually matter.
  const collisions = assigned.filter((n) => taken.has(n));
  const dupes = assigned.filter((n, i) => assigned.indexOf(n) !== i);
  const belowBase = assigned.filter((n) => n < 1000);

  console.log("\nCHECKS");
  console.log(`  collides with existing channels : ${collisions.length ? `FAIL ${collisions}` : "ok"}`);
  console.log(`  duplicate numbers within the run: ${dupes.length ? `FAIL ${dupes}` : "ok"}`);
  console.log(`  every number >= 1000            : ${belowBase.length ? `FAIL ${belowBase}` : "ok"}`);

  const blocks = plan.packages.map((p) => p.numberBase);
  console.log(`  one distinct block per package  : ${new Set(blocks).size === blocks.length ? "ok" : `FAIL ${blocks}`}`);

  await prisma.$disconnect();
}

void main();
