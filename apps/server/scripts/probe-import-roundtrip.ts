/**
 * Dry-run round-trip of the lineup export → import for MANUAL / MEMBERSHIP channels (P3b). Read-only: exports
 * the current lineup, then plans + executes an import in DRY-RUN (writes nothing, the GUID remap runs with
 * persist disabled). Checks two scenarios:
 *   SAME server  (sourceServerId == target) → MEMBERSHIP stays MEMBERSHIP (original container keys), MANUAL
 *                 keeps its original ratingKeys. No remap needed.
 *   CROSS server (sourceServerId forced different) → both become MANUAL_ITEMS, remapped by GUID to this
 *                 library; matched should ≈ total (same library).
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-import-roundtrip.ts [targetSourceId]
 */
import prisma from "@airwave/db";

import { exportLineup } from "../../../packages/api/src/services/transfer/export";
import { type ImportedLineup, executeChannelPlan, loadResolveSource, planImport } from "../../../packages/api/src/services/transfer/import";

const srcArg = process.argv[2];
const ok = (b: boolean) => (b ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m");

async function run(label: string, data: ImportedLineup, targetSourceId: string) {
  const plan = await planImport(prisma, data, { targetSourceId, dryRun: true });
  const source = (await loadResolveSource(prisma, targetSourceId)) ?? undefined;
  // Only the manual/membership channels (predicate ones dedupe against themselves as duplicates).
  const interesting = plan.channels.filter(
    (c) => c.action === "create" && c.definitions.some((d) => d.kind !== "PREDICATE" || d.remapItems),
  );
  console.log(`\n═══ ${label} ═══  (${interesting.length} manual/membership channels to import)`);
  for (const c of interesting) {
    const kinds = c.definitions.map((d) => d.kind).join("+");
    const res = await executeChannelPlan(prisma, c, {
      packageId: null,
      targetSourceId,
      userId: "probe",
      dryRun: true,
      source,
    });
    const matchLine = res.itemsTotal != null ? `remap ${res.itemsMatched}/${res.itemsTotal}` : "as-is (no remap)";
    const good = res.itemsTotal == null || res.itemsMatched === res.itemsTotal;
    console.log(`  ${ok(good)} "${c.name}" → defs=[${kinds}]  ${matchLine}`);
  }
  return interesting;
}

async function main() {
  const target = srcArg
    ? await prisma.mediaSource.findUnique({ where: { id: srcArg }, select: { id: true, name: true, machineIdentifier: true } })
    : await prisma.mediaSource.findFirst({ select: { id: true, name: true, machineIdentifier: true } });
  if (!target) {
    console.error("No media source found.");
    process.exit(1);
  }
  console.log(`Target: ${target.name} (machineId=${target.machineIdentifier ?? "none"})`);

  const data = (await exportLineup(prisma)) as unknown as ImportedLineup;
  const manualMembership = data.channels.filter((c) => (c.definitions ?? []).some((d) => d.kind !== "PREDICATE"));
  console.log(`Exported ${data.channels.length} channels (${manualMembership.length} manual/membership), schemaVersion=${data.schemaVersion}`);

  // SAME server: the export's sourceServerId already equals the target's machineIdentifier.
  await run("SAME SERVER — keep membership/manual as-is", data, target.id);

  // CROSS server: force a different sourceServerId so the importer must remap by GUID.
  const cross = JSON.parse(JSON.stringify(data)) as ImportedLineup;
  for (const c of cross.channels) c.sourceServerId = "different-server-000";
  await run("CROSS SERVER — remap GUIDs → manual snapshot", cross, target.id);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Probe crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
