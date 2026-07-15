/**
 * Single-channel playback simulator — scan one channel's timeline (past + upcoming),
 * resolve each distinct program with a real panel's MEASURED caps, and print the
 * delivery mode per program (fetching the stream for DTS-family and any non-direct
 * path to confirm it's real). Handy for hunting codec-specific playback issues
 * without waiting for the content to roll around to "now".
 *
 *   bun --env-file=.env run scripts/sim-channel.ts <channelNumber>
 */
import prisma from "@ChannelGuide/db";

import { getDeviceNativeCaps } from "@ChannelGuide/api/services/capabilities/native-caps";
import { resolveMedia } from "@ChannelGuide/api/services/playback/broker";
import { getChannelTimeline } from "@ChannelGuide/api/services/schedule/generate";

async function probe(url: string) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-65535" }, signal: ctrl.signal });
    let bytes = 0;
    if (res.body) {
      const reader = res.body.getReader();
      while (bytes < 65536) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value?.length ?? 0;
      }
      await reader.cancel().catch(() => {});
    }
    return { status: res.status, ct: res.headers.get("content-type"), bytes };
  } catch (e) {
    return { error: (e as Error).message };
  } finally {
    clearTimeout(to);
  }
}

async function main() {
  const chNum = Number(process.argv[2] ?? "9");
  const capRow = await prisma.deviceCapability.findFirst({ where: { decoded: true } });
  const deviceId = capRow!.deviceId;
  console.log(`Device: ${deviceId}`);
  console.log(`Caps:`, JSON.stringify(await getDeviceNativeCaps(prisma, deviceId)), "\n");

  const ch = await prisma.channel.findFirst({ where: { number: chNum, enabled: true } });
  if (!ch) return console.log(`channel ${chNum} not found`);
  console.log(`Channel ${chNum}: ${ch.name}\n`);

  const now = new Date();
  const slots = await getChannelTimeline(
    prisma,
    ch.id,
    new Date(now.getTime() - 6 * 3600_000),
    new Date(now.getTime() + 6 * 3600_000),
  );
  const programs = slots.filter((s) => s.kind === "PROGRAM" && s.ratingKey);

  const seen = new Set<string>();
  for (const s of programs) {
    if (seen.has(s.ratingKey!)) continue;
    seen.add(s.ratingKey!);
    let info: any;
    try {
      info = await resolveMedia(prisma, ch.id, s.ratingKey!, 60, { deviceId });
    } catch (e) {
      console.log(`  "${s.guide?.title}" resolveMedia ERROR ${(e as Error).message}`);
      continue;
    }
    const flag = /^dca|^dts/i.test(info.audioCodec) ? "  <-- DTS family" : "";
    console.log(
      `  "${(s.guide?.title ?? "").slice(0, 34).padEnd(34)}" src=${info.container}/${info.videoCodec}/${info.audioCodec}  MODE=${info.mode}${flag}`,
    );
    // Prove the stream is real for DTS content and for any transcode path.
    if (flag || info.mode !== "direct") {
      const p = info.mode === "hls" ? { note: "hls playlist (skip)" } : await probe(info.url);
      console.log(`       fetch:`, JSON.stringify(p));
    }
    if (seen.size >= 25) break;
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
