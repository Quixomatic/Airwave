/**
 * Title playback simulator — find cached media by title and resolve each with a real
 * panel's MEASURED caps, printing the delivery mode + Plex's transcode decision (and
 * fetching the stream head). For hunting a specific title's playback/audio issue.
 *
 *   bun --env-file=.env run scripts/sim-title.ts "Anastasia"
 */
import prisma from "@ChannelGuide/db";

import { getDeviceNativeCaps } from "@ChannelGuide/api/services/capabilities/native-caps";
import { getPlaybackInfo } from "@ChannelGuide/api/services/plex/client";

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
  const title = process.argv[2] ?? "Anastasia";
  const capRow = await prisma.deviceCapability.findFirst({ where: { decoded: true } });
  const deviceId = capRow!.deviceId;
  const caps = await getDeviceNativeCaps(prisma, deviceId);
  console.log(`Device: ${deviceId}\nCaps:`, JSON.stringify(caps), "\n");

  const items = await prisma.mediaItem.findMany({
    where: { title: { contains: title, mode: "insensitive" } },
    include: { mediaSource: true },
    take: 10,
  });
  if (!items.length) return console.log(`No cached media matching "${title}".`);

  for (const it of items) {
    const src = it.mediaSource;
    if (!src?.baseUrl || !it.ratingKey) {
      console.log(`"${it.title}" — no source/ratingKey (skip)`);
      continue;
    }
    const clientId = src.clientIdentifier ?? "channelguide-server";
    // Probe at a couple of offsets — start, and deep in (where a cutout would show).
    for (const offset of [30, 3000]) {
      let info: any;
      try {
        info = await getPlaybackInfo(src.baseUrl, src.token, clientId, it.ratingKey, offset, {
          caps: caps ?? undefined,
        });
      } catch (e) {
        console.log(`"${it.title}" @${offset}s ERROR ${(e as Error).message}`);
        continue;
      }
      if (!info) {
        console.log(`"${it.title}" @${offset}s — no playable part`);
        continue;
      }
      const d = info.decision ?? {};
      console.log(
        `"${it.title}" @${offset}s  src=${info.container}/${info.videoCodec}/${info.audioCodec}  MODE=${info.mode}`,
      );
      console.log(
        `   decision: v=${d.videoDecision ?? "?"} a=${d.audioDecision ?? "?"} -> ${d.videoCodec ?? "?"}/${d.audioCodec ?? "?"} container=${d.container ?? "?"}`,
      );
      console.log(`   audioTracks:`, JSON.stringify(info.audioTracks));
      if (info.directAudio) console.log(`   directAudio:`, JSON.stringify(info.directAudio));
      if (info.mode !== "hls") console.log(`   fetch:`, JSON.stringify(await probe(info.url)));
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
