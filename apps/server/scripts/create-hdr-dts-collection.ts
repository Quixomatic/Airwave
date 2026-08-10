/**
 * Create/populate a Plex collection "HDR DTS Test" with every HDR + DTS-HD MA movie —
 * the test set for HDR-through-HLS on the C2. Reversible: delete the collection in Plex.
 *
 *   bun --env-file=.env run scripts/create-hdr-dts-collection.ts
 */
import prisma from "@airwave/db";

import { getLibraries } from "@airwave/api/services/plex/client";
import { decryptToken } from "@airwave/api/services/plex/token";

const COLLECTION = "HDR DTS Test";
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
  const token = decryptToken(source.token);
  const libs = await getLibraries(base, token);
  const movieLib = libs.find((l: any) => l.type === "movie");
  if (!movieLib) return console.log("No movie library.");

  const items = await fetchAll(base, token, movieLib.key, "hdr=1");
  const rks = items.filter((it) => isDts(it.Media?.[0]?.audioCodec)).map((it) => String(it.ratingKey));
  console.log(`Found ${rks.length} HDR+DTS movies in "${movieLib.title}".`);
  if (!rks.length) return;

  // Batch-add the collection tag to every item (creates the collection if absent).
  const url =
    `${base}/library/sections/${movieLib.key}/all?type=1&id=${rks.join(",")}` +
    `&collection[0].tag.tag=${encodeURIComponent(COLLECTION)}&X-Plex-Token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: "PUT", headers: H(token) });
  console.log(`PUT collection tag → ${res.status} ${res.statusText}`);

  // Verify.
  const cres = await fetch(`${base}/library/sections/${movieLib.key}/collections`, { headers: H(token) });
  const cj: any = await cres.json();
  const col = (cj?.MediaContainer?.Metadata ?? []).find((c: any) => c.title === COLLECTION);
  if (col) console.log(`✅ Collection "${COLLECTION}" now has ${col.childCount} items (ratingKey ${col.ratingKey}).`);
  else console.log(`⚠️ Collection not found after PUT — check Plex.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
