/**
 * Find Dolby Vision media on the connected Plex source and confirm our DV capture end-to-end.
 *
 *   Part 1 (Plex): scans HDR movies, fetches each title's Streams, and prints the ones carrying a
 *   Dolby Vision profile — the raw DOVIProfile / DOVIBLCompatID our `detectDovi()` reads. Proves the
 *   source data is there and shows which profiles your library actually has (7, 8.1, 5…).
 *
 *   Part 2 (DB): reports how many `media_item` rows currently have `dovi` stored in their guide JSON —
 *   0 before a re-sync, >0 after — so you can confirm it's landing in the table. Run the metadata sync
 *   between two runs of this script to see it flip.
 *
 *   bun --env-file=.env run scripts/find-dovi.ts
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

/** Full metadata WITH streams for one item (the `/all` listing omits Streams). */
async function fetchMediaWithStreams(base: string, token: string, ratingKey: string | number) {
  const url = `${base}/library/metadata/${ratingKey}?includeElements=Stream`;
  const res = await fetch(url, { headers: H(token) });
  if (!res.ok) return undefined;
  const j: any = await res.json();
  return j?.MediaContainer?.Metadata?.[0]?.Media?.[0];
}

/** Same shape/logic as client.ts `detectDovi` — kept inline so this validates the RAW Plex fields. */
function doviOf(media: any): { profile: number; level?: number; blCompatId?: number } | undefined {
  const vs = media?.Part?.[0]?.Stream?.find((s: any) => s.streamType === 1);
  if (!vs) return undefined;
  const profile = Number(vs.DOVIProfile ?? 0);
  const present = vs.DOVIPresent === 1 || vs.DOVIPresent === true || profile > 0;
  if (!present || !profile) return undefined;
  return {
    profile,
    level: vs.DOVILevel != null ? Number(vs.DOVILevel) : undefined,
    blCompatId: vs.DOVIBLCompatID != null ? Number(vs.DOVIBLCompatID) : undefined,
  };
}

const compatLabel = (id?: number) =>
  id === 1 || id === 6 ? "HDR10 base" : id === 4 ? "HLG base" : id === 2 ? "SDR base" : id === 0 ? "no base (Profile 5)" : "?";

const SCAN_CAP = 50; // per library — cap the per-title stream fetches so a big library stays quick

async function main() {
  const source = await prisma.mediaSource.findFirst({ where: { baseUrl: { not: null } }, orderBy: { isDefault: "desc" } });
  if (!source?.baseUrl) return console.log("No connected source.");
  const base = source.baseUrl;
  const libs = await getLibraries(base, source.token);
  const movieLibs = libs.filter((l: any) => l.type === "movie");
  console.log(`Source: ${source.name} — movie libraries: ${movieLibs.map((l: any) => l.title).join(", ")}\n`);

  // ---- Part 1: Plex — find DV titles + their profile / BL-compat-id ----
  const hits: { title: string; year?: number; rk: string; profile: number; level?: number; blCompatId?: number; lib: string }[] = [];
  for (const lib of movieLibs) {
    const items = await fetchAll(base, source.token, lib.key, "hdr=1"); // DV is a subset of HDR
    let scanned = 0;
    for (const it of items) {
      if (scanned >= SCAN_CAP) break;
      const media = await fetchMediaWithStreams(base, source.token, it.ratingKey);
      scanned++;
      const dovi = doviOf(media);
      if (dovi) hits.push({ title: it.title, year: it.year, rk: String(it.ratingKey), ...dovi, lib: lib.title });
    }
    console.log(`  ${lib.title}: scanned ${scanned}/${items.length} HDR items`);
  }

  console.log(`\n=== Dolby Vision titles from Plex (${hits.length}) ===`);
  for (const h of hits) {
    const lvl = h.level != null ? ` L${h.level}` : "";
    console.log(`  [${h.rk}] ${h.title} (${h.year ?? "?"})  DV profile ${h.profile}${lvl} · BLCompat ${h.blCompatId ?? "?"} (${compatLabel(h.blCompatId)})  · ${h.lib}`);
  }
  if (!hits.length) console.log("  none found in the scanned window — your library may have no DV, or bump SCAN_CAP.");

  // ---- Part 2: DB — how many MediaItems have `dovi` stored yet? ----
  const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM media_item WHERE guide->'dovi' IS NOT NULL`;
  const stored = rows[0]?.n ?? 0;
  console.log(`\n=== MediaItem storage ===`);
  console.log(`  ${stored} media_item row(s) currently carry a stored 'dovi'. ${stored === 0 ? "(Re-run the metadata sync to backfill, then run this again.)" : ""}`);
  if (stored > 0) {
    const sample = await prisma.$queryRaw<{ title: string; dovi: unknown }[]>`SELECT title, guide->'dovi' AS dovi FROM media_item WHERE guide->'dovi' IS NOT NULL LIMIT 10`;
    for (const s of sample) console.log(`  ${s.title}: ${JSON.stringify(s.dovi)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
