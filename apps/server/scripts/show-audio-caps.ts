/**
 * Dump a device's measured audio-decode verdicts (DeviceCapability.audioOk) and the
 * resulting native caps. Handy for confirming the diagnostic's audio pass — which codecs
 * the panel actually decodes (🔊 true) vs can't (🔇 false) vs untested (· null).
 *
 *   bun --env-file=.env run scripts/show-audio-caps.ts
 */
import prisma from "@ChannelGuide/db";

import { getDeviceNativeCaps } from "@ChannelGuide/api/services/capabilities/native-caps";

async function main() {
  const cap = await prisma.deviceCapability.findFirst({ where: { decoded: true } });
  if (!cap) return console.log("No onboarded device.");
  const deviceId = cap.deviceId;
  const rows = await prisma.deviceCapability.findMany({
    where: { deviceId },
    orderBy: { testId: "asc" },
    select: { testId: true, audio: true, decoded: true, audioOk: true },
  });
  console.log(`Device ${deviceId} — ${rows.length} rows\n`);
  for (const r of rows) {
    if (!r.audio) continue;
    const v = r.audioOk === true ? "🔊 true" : r.audioOk === false ? "🔇 FALSE" : "· null";
    console.log(`  ${r.testId.padEnd(20)} audio=${(r.audio ?? "").padEnd(12)} decoded=${r.decoded ? "Y" : "n"}  audioOk=${v}`);
  }
  console.log("\nResulting native caps:");
  console.log(JSON.stringify(await getDeviceNativeCaps(prisma, deviceId)));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
