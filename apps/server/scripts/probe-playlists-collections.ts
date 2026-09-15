/**
 * Read-only: probe Plex PLAYLIST and COLLECTION item endpoints to validate the "membership" channel
 * source (playlists & collections) before building it. For a chosen (or first) video playlist and a
 * chosen (or first) collection it reports:
 *   - that /items resolves and honors `includeElements=Stream` (so direct-play caps flow like the
 *     filter path does),
 *   - the item TYPE distribution (leaf movie/episode = directly schedulable, vs container show/season
 *     that would need expansion to episodes),
 *   - the returned ORDER (matters for IN_ORDER),
 *   - whether the source is a smart playlist/collection.
 *
 *   bun --env-file=.env run scripts/probe-playlists-collections.ts
 *   bun --env-file=.env run scripts/probe-playlists-collections.ts --playlist 12345 --collection 67890
 */
import prisma from "@airwave/db";

import {
  getCollectionItems,
  getCollections,
  getLibraries,
  getPlaylistItems,
  getPlaylists,
} from "@airwave/api/services/plex/client";
import { decryptToken } from "@airwave/api/services/plex/token";

const H = (t: string) => ({ Accept: "application/json", "X-Plex-Token": t });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type Meta = {
  ratingKey?: string;
  title?: string;
  type?: string;
  duration?: number;
  leafCount?: number;
  childCount?: number;
  smart?: boolean;
  playlistType?: string;
  Media?: Array<{ Part?: Array<{ Stream?: unknown[] }> }>;
};

async function get(base: string, token: string, path: string): Promise<Meta[]> {
  const res = await fetch(`${base}${path}`, { headers: H(token) });
  if (!res.ok) {
    console.log(`   ! ${res.status} ${res.statusText} for ${path}`);
    return [];
  }
  return ((await res.json()) as { MediaContainer?: { Metadata?: Meta[] } })?.MediaContainer?.Metadata ?? [];
}

function summarizeItems(items: Meta[]) {
  const types = new Map<string, number>();
  for (const it of items) types.set(it.type ?? "?", (types.get(it.type ?? "?") ?? 0) + 1);
  console.log(`   count=${items.length}  types=${JSON.stringify(Object.fromEntries(types))}`);
  for (const it of items.slice(0, 6)) {
    const streams = it.Media?.[0]?.Part?.[0]?.Stream?.length ?? 0;
    const dur = it.duration ? `${Math.round(it.duration / 60000)}m` : "?";
    console.log(
      `     [${it.ratingKey}] type=${(it.type ?? "?").padEnd(7)} streams=${String(streams).padEnd(2)} dur=${dur.padEnd(5)} ${it.title}`,
    );
  }
  if (items.some((it) => it.type === "show" || it.type === "season"))
    console.log("   ⚠ contains container items (show/season) — these would need expansion to episodes.");
  if (items.length && !items[0]?.Media)
    console.log("   ⚠ no Media element on items — includeElements=Stream may not apply here (no direct-play caps).");
}

async function main() {
  const src = await prisma.mediaSource.findFirst({
    where: { type: "PLEX", baseUrl: { not: null } },
    orderBy: { isDefault: "desc" },
  });
  if (!src?.baseUrl) return console.log("No PLEX source with a baseUrl.");
  const base = src.baseUrl;
  const token = decryptToken(src.token);
  console.log(`Source: ${src.name}  (${base})`);

  // ── Playlists ──────────────────────────────────────────────────────────────────────────────────
  console.log("\n=== VIDEO PLAYLISTS (GET /playlists?playlistType=video) ===");
  const playlists = await get(base, token, `/playlists?playlistType=video`);
  for (const p of playlists.slice(0, 15))
    console.log(`  [${p.ratingKey}] "${p.title}"  items=${p.leafCount ?? "?"}  smart=${p.smart ? "Y" : "-"}`);

  const plId = arg("playlist") ?? playlists[0]?.ratingKey;
  if (plId) {
    console.log(`\n--- playlist ${plId} items (includeElements=Stream) ---`);
    const plItems = await get(base, token, `/playlists/${plId}/items?includeElements=Stream`);
    summarizeItems(plItems);

    // The pool doesn't need streams re-fetched from Plex — the MediaItem cache (enriched by the media
    // sync) already holds the rich guide. Verify: join these ratingKeys to MediaItem and show whether
    // the stream badges (resolution / hdr / audioChannels) are present, i.e. filter-mode parity for free.
    const keys = plItems.map((it) => it.ratingKey).filter(Boolean) as string[];
    if (keys.length) {
      console.log(`\n--- CACHE JOIN: MediaItem rows for the ${keys.length} playlist items ---`);
      const rows = await prisma.mediaItem.findMany({
        where: { mediaSourceId: src.id, ratingKey: { in: keys } },
        select: { ratingKey: true, title: true, guide: true },
      });
      const byKey = new Map(rows.map((r) => [r.ratingKey, r]));
      let cached = 0;
      let withBadges = 0;
      for (const k of keys) {
        const r = byKey.get(k);
        const g = (r?.guide ?? {}) as { resolution?: string; hdr?: string; audioChannels?: number };
        const hasBadges = g.resolution != null || g.hdr != null || g.audioChannels != null;
        if (r) cached++;
        if (hasBadges) withBadges++;
        console.log(
          `   ${k}: cached=${r ? "Y" : "N"}  res=${g.resolution ?? "-"}  hdr=${g.hdr ?? "-"}  ch=${g.audioChannels ?? "-"}  ${r?.title ?? ""}`,
        );
      }
      console.log(
        `   => ${cached}/${keys.length} in cache, ${withBadges}/${keys.length} carry stream badges (res/hdr/audio) — no Plex re-fetch needed`,
      );
    }
  } else {
    console.log("\n(no video playlists found to probe)");
  }

  // ── Collections (per library) ────────────────────────────────────────────────────────────────
  console.log("\n=== COLLECTIONS (per movie/show library) ===");
  const libs = await getLibraries(base, token);
  let firstCollectionId: string | undefined;
  for (const lib of libs.filter((l: { type?: string }) => l.type === "movie" || l.type === "show")) {
    const cols = await get(base, token, `/library/sections/${(lib as { key: string }).key}/collections`);
    console.log(`  library "${(lib as { title?: string }).title}" (${(lib as { type?: string }).type}): ${cols.length} collections`);
    for (const c of cols.slice(0, 8))
      console.log(`    [${c.ratingKey}] "${c.title}"  children=${c.childCount ?? "?"}  smart=${c.smart ? "Y" : "-"}`);
    if (!firstCollectionId && cols[0]?.ratingKey) firstCollectionId = cols[0].ratingKey;
  }

  const colId = arg("collection") ?? firstCollectionId;
  if (colId) {
    console.log(`\n--- collection ${colId} items (GET /library/collections/${colId}/items?includeElements=Stream) ---`);
    summarizeItems(await get(base, token, `/library/collections/${colId}/items?includeElements=Stream`));
  } else {
    console.log("\n(no collections found to probe)");
  }

  // ── Verify the NEW client methods run end-to-end (getPlaylists/Items, getCollections/Items) ──────
  console.log("\n=== VIA NEW CLIENT METHODS ===");
  const cPlaylists = await getPlaylists(base, token);
  console.log(
    `getPlaylists → ${cPlaylists.length}: ${cPlaylists.map((p) => `"${p.title}"(${p.itemCount}${p.smart ? ",smart" : ""})`).join(", ")}`,
  );
  if (cPlaylists[0]) {
    const items = await getPlaylistItems(base, token, cPlaylists[0].key);
    console.log(`getPlaylistItems(${cPlaylists[0].key}) → ${items.length}: ${items.map((i) => `${i.guide.type}:${i.ratingKey}`).join(", ")}`);
  }
  const movieLib = libs.find((l: { type?: string }) => l.type === "movie") as { key: string } | undefined;
  if (movieLib) {
    const cCols = await getCollections(base, token, movieLib.key);
    console.log(`getCollections(movies) → ${cCols.length}`);
    if (cCols[0]) {
      const citems = await getCollectionItems(base, token, cCols[0].key);
      console.log(
        `getCollectionItems(${cCols[0].key} "${cCols[0].title}") → ${citems.length}: ${citems.slice(0, 4).map((i) => `${i.guide.type}:${i.ratingKey}`).join(", ")}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
