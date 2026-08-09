/**
 * Playback simulator — resolve "what's on now" for every enabled channel using a real
 * panel's MEASURED capabilities, print the chosen delivery mode + Plex's transcode
 * decision, then actually fetch the resulting stream to confirm Plex serves a real,
 * playable body (not an unplayable stub). Reproduces the TV app's playback path
 * server-side, so codec/transcode issues can be diagnosed without a TV.
 *
 *   bun --env-file=.env run scripts/sim-playback.ts [channelNumber]
 */
import prisma from "@airwave/db";

import { getDeviceNativeCaps } from "@airwave/api/services/capabilities/native-caps";
import { resolveMedia } from "@airwave/api/services/playback/broker";
import { getNowNext } from "@airwave/api/services/schedule/generate";

// Read up to ~64KB off a stream (or a playlist) to see if Plex actually serves it.
async function probe(url: string, opts: { range?: string } = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, {
      headers: opts.range ? { Range: opts.range } : {},
      signal: ctrl.signal,
    });
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
    return {
      status: res.status,
      ct: res.headers.get("content-type"),
      cl: res.headers.get("content-length"),
      cr: res.headers.get("content-range"),
      bytes,
    };
  } catch (e) {
    return { error: (e as Error).message };
  } finally {
    clearTimeout(to);
  }
}

async function probeHls(url: string) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    const lines = text.split("\n").map((l) => l.trim());
    const segs = lines.filter((l) => l && !l.startsWith("#"));
    const info: any = { status: res.status, isPlaylist: text.startsWith("#EXTM3U"), segCount: segs.length };
    if (segs[0]) {
      const segUrl = new URL(segs[0], url).toString();
      info.firstSeg = await probe(segUrl);
    }
    return info;
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function main() {
  const onlyCh = process.argv[2]; // optional channel number filter

  // The onboarded panel (has measured DeviceCapability rows) — the C2.
  const capRow = await prisma.deviceCapability.findFirst({ where: { decoded: true } });
  const deviceId = capRow?.deviceId;
  if (!deviceId) {
    console.log("No onboarded device (no DeviceCapability rows). Run the diagnostic first.");
    return;
  }
  const caps = await getDeviceNativeCaps(prisma, deviceId);
  console.log(`Device: ${deviceId}`);
  console.log(`Measured caps:`, JSON.stringify(caps), "\n");

  const channels = await prisma.channel.findMany({
    where: { enabled: true },
    orderBy: { number: "asc" },
    select: { id: true, number: true, name: true },
  });

  for (const ch of channels) {
    if (onlyCh && String(ch.number) !== onlyCh) continue;
    const nn = await getNowNext(prisma, ch.id).catch(() => null);
    const cur = nn?.current;
    if (!cur || cur.kind !== "PROGRAM" || !cur.ratingKey) {
      console.log(`ch ${ch.number} ${ch.name}: on now = ${cur?.kind ?? "nothing"} (skip)`);
      continue;
    }
    let info: any;
    try {
      info = await resolveMedia(prisma, ch.id, cur.ratingKey, cur.offsetSeconds, { deviceId });
    } catch (e) {
      console.log(`ch ${ch.number} ${ch.name}: resolveMedia ERROR ${(e as Error).message}`);
      continue;
    }
    const d = info.decision ?? {};
    console.log(
      `\nch ${ch.number} ${ch.name}  "${cur.guide?.title ?? ""}"  offset=${Math.round(cur.offsetSeconds)}s`,
    );
    console.log(
      `   src=${info.container}/${info.videoCodec}/${info.audioCodec}  MODE=${info.mode}  capsSource=${info.capsSource}`,
    );
    console.log(
      `   decision: v=${d.videoDecision ?? "?"} a=${d.audioDecision ?? "?"} -> ${d.videoCodec ?? "?"}/${d.audioCodec ?? "?"} container=${d.container ?? "?"}`,
    );
    if (info.mode === "hls") {
      console.log(`   fetch(m3u8):`, JSON.stringify(await probeHls(info.url)));
    } else {
      console.log(`   fetch(stream):`, JSON.stringify(await probe(info.url, { range: "bytes=0-65535" })));
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
