/**
 * Backfill the accent-palette migration directly in the DB — so you DON'T have to regenerate all
 * packages/channels. Idempotent; safe to re-run.
 *
 *   bun --env-file=.env run scripts/backfill-accents.ts          # dry run (prints the plan)
 *   bun --env-file=.env run scripts/backfill-accents.ts --write  # apply
 *
 * What it does:
 *  - PACKAGES: map the stored legacy tint token → accent key (e.g. gray→slate); every other current
 *    token is already a valid key, so most are unchanged.
 *  - GENERATED channels: assign the per-channel VARIANCE accent (the same cycle the generator now
 *    uses), by channel number, so the guide gets colour variance instead of package-colour bands.
 *  - MANUAL channels (generated=false): preserve intent — map an existing tint token → key; leave a
 *    null (package-inherited) channel null. We never impose the variance cycle on a hand-made channel.
 */
import prisma from "@airwave/db";

import { channelAccentAt, toAccentKey } from "@airwave/api/services/accents";

async function main() {
  const write = process.argv.includes("--write");
  console.log(write ? "APPLYING accent backfill…\n" : "DRY RUN (pass --write to apply)\n");

  // ── Packages ──
  const packages = await prisma.channelPackage.findMany({ select: { id: true, name: true, tint: true } });
  let pkgChanged = 0;
  for (const p of packages) {
    const key = toAccentKey(p.tint);
    if (key !== p.tint) {
      pkgChanged++;
      console.log(`  package "${p.name}": ${p.tint ?? "null"} → ${key}`);
      if (write) await prisma.channelPackage.update({ where: { id: p.id }, data: { tint: key } });
    }
  }
  console.log(`packages: ${pkgChanged}/${packages.length} retinted\n`);

  // ── Generated channels: variance cycle by number (stable + deterministic) ──
  const generated = await prisma.channel.findMany({
    where: { generated: true },
    select: { id: true, number: true, name: true, tint: true },
    orderBy: { number: "asc" },
  });
  let genChanged = 0;
  generated.forEach((c, i) => {
    const key = channelAccentAt(i);
    if (key !== c.tint) {
      genChanged++;
      if (write) void 0; // batched below
    }
  });
  if (write) {
    // Sequential updates keep the running index aligned with the printed plan.
    for (let i = 0; i < generated.length; i++) {
      const c = generated[i]!;
      const key = channelAccentAt(i);
      if (key !== c.tint) await prisma.channel.update({ where: { id: c.id }, data: { tint: key } });
    }
  }
  console.log(`generated channels: ${genChanged}/${generated.length} given the variance accent`);

  // ── Manual channels: preserve intent (map token→key; leave null null) ──
  const manual = await prisma.channel.findMany({
    where: { generated: false },
    select: { id: true, name: true, tint: true },
  });
  let manChanged = 0;
  for (const c of manual) {
    if (!c.tint) continue; // inherits its package — leave alone
    const key = toAccentKey(c.tint);
    if (key !== c.tint) {
      manChanged++;
      console.log(`  manual channel "${c.name}": ${c.tint} → ${key}`);
      if (write) await prisma.channel.update({ where: { id: c.id }, data: { tint: key } });
    }
  }
  console.log(`manual channels: ${manChanged}/${manual.length} retinted (null/inherited left as-is)\n`);

  console.log(write ? "Done." : "Dry run complete — re-run with --write to apply.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
