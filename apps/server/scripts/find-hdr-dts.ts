/**
 * Find HDR + DTS content — HDR video (forces a video COPY) with a DTS default audio track
 * (forces an audio transcode) → the exact case for testing whether HDR survives the HLS
 * transcode path on the C2. Lists titles + ratingKeys so a test channel can be built.
 *
 *   bun --env-file=.env run scripts/find-hdr-dts.ts
 */
import prisma from "@ChannelGuide/db";

import { getLibraries } from "@ChannelGuide/api/services/plex/client";

const H = (token: string) => ({ Accept: "application/json", "X-Plex-Token": token });

async function fetchAll(base: string, token: string, key: string, extra: string) {
  const out: any[] = [];
  let start = 0;
  for (;;) {
    const url = `${base}/library/sections/${key}/all?${extra}&X-Plex-Container-Start=${start}&X-Plex-Container-Size=200`;
    const res = await fetch(url, { headers: H(token) });
    if (!res.ok) return out;
    const j: any = await res.json();
    const items = j?.MediaContainer?.Metadata ?? [];
    out.push(...items);
    const total = j?.MediaContainer?.totalSize ?? out.length;
    start += items.length;
    if (!items.length || start >= total) break;
  }
  return out;
}

const isDts = (c?: string) => !!c && /^dca|^dts/i.test(c);

async function main() {
  const source = await prisma.mediaSource.findFirst({ where: { baseUrl: { not: null } }, orderBy: { isDefault: "desc" } });
  if (!source?.baseUrl) return console.log("No connected source.");
  const base = source.baseUrl;
  const libs = await getLibraries(base, source.token);
  const movieLibs = libs.filter((l: any) => l.type === "movie");
  console.log(`Source: ${source.name} — movie libraries: ${movieLibs.map((l: any) => l.title).join(", ")}\n`);

  const hits: { title: string; year?: number; rk: string; v?: string; a?: string; res?: string; lib: string }[] = [];
  for (const lib of movieLibs) {
    // hdr=1 is Plex's advanced HDR filter; then keep the ones whose default audio is DTS.
    const items = await fetchAll(base, source.token, lib.key, "hdr=1");
    for (const it of items) {
      const m = it.Media?.[0];
      if (isDts(m?.audioCodec)) {
        hits.push({ title: it.title, year: it.year, rk: String(it.ratingKey), v: m?.videoCodec, a: m?.audioCodec, res: m?.videoResolution, lib: lib.title });
      }
    }
    console.log(`  ${lib.title}: ${items.length} HDR items scanned`);
  }

  console.log(`\n=== HDR + DTS titles (${hits.length}) ===`);
  for (const h of hits) {
    console.log(`  [${h.rk}] ${h.title} (${h.year ?? "?"})  ${h.res}/${h.v}/${h.a}  · ${h.lib}`);
  }
  if (!hits.length) console.log("  none — will report what HDR audio codecs DO exist for a fallback.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
