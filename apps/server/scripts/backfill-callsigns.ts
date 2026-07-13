/**
 * Backfill callsigns for auto-generated channels that don't have one (e.g. generated
 * before callsigns existed). Uses the preset's callsign by `presetKey`, falling back
 * to a derived code, de-duped against existing callsigns.
 *
 * Run:  bun --env-file=.env run scripts/backfill-callsigns.ts
 */
import prisma from "@ChannelGuide/db";
import { PRESET_PACKAGES } from "@ChannelGuide/api/services/generator/presets";
import {
  deriveCallsign,
  normalizeCallsign,
  uniqueCallsign,
} from "@ChannelGuide/api/services/generator/callsign";

const presetCallsign = new Map<string, string>();
for (const pkg of PRESET_PACKAGES) {
  for (const ch of pkg.channels) presetCallsign.set(ch.key, ch.callsign);
}

const all = await prisma.channel.findMany({
  select: { id: true, name: true, callsign: true, presetKey: true, generated: true },
});
const used = new Set(all.map((c) => c.callsign).filter((c): c is string => !!c));

// Only backfill generated channels missing a callsign (manual ones are set by hand).
const targets = all.filter((c) => c.generated && !c.callsign);
console.log(`${targets.length} generated channel(s) need a callsign.`);

let updated = 0;
for (const c of targets) {
  const base = normalizeCallsign(
    (c.presetKey && presetCallsign.get(c.presetKey)) || deriveCallsign(c.name),
  );
  const callsign = uniqueCallsign(base, used);
  await prisma.channel.update({ where: { id: c.id }, data: { callsign } });
  console.log(`  ${c.name.padEnd(28)} -> ${callsign}`);
  updated++;
}

console.log(`\nDone — set ${updated} callsign(s).`);
process.exit(0);
