/**
 * Read-only: show a title's Media bitrate + every audio track (codec/channels/label/default),
 * to decide delivery — e.g. is a high-bitrate 4K HDR movie carrying a DECODABLE secondary
 * audio track we could direct-play instead of transcoding.
 *
 *   bun --env-file=.env run scripts/probe-title-streams.ts "Avatar"
 */
import prisma from "@airwave/db";

import { getLibraries } from "@airwave/api/services/plex/client";
import { decryptToken } from "@airwave/api/services/plex/token";

const H = (t: string) => ({ Accept: "application/json", "X-Plex-Token": t });

async function main() {
  const title = process.argv[2] ?? "Avatar";
  const src = await prisma.mediaSource.findFirst({ where: { baseUrl: { not: null } }, orderBy: { isDefault: "desc" } });
  if (!src?.baseUrl) return console.log("No source.");
  const base = src.baseUrl;
  const token = decryptToken(src.token);
  const libs = await getLibraries(base, token);
  const movie = libs.find((l: any) => l.type === "movie");
  if (!movie) return console.log("No movie lib.");

  const res = await fetch(`${base}/library/sections/${movie.key}/all?title=${encodeURIComponent(title)}`, { headers: H(token) });
  const items: any[] = ((await res.json()) as any)?.MediaContainer?.Metadata ?? [];
  if (!items.length) return console.log(`No match for "${title}".`);

  for (const it of items.slice(0, 6)) {
    const meta: any = ((await (await fetch(`${base}/library/metadata/${it.ratingKey}`, { headers: H(token) })).json()) as any)?.MediaContainer?.Metadata?.[0];
    const m = meta?.Media?.[0];
    const mbps = m?.bitrate ? (m.bitrate / 1000).toFixed(1) : "?";
    console.log(`\n[${it.ratingKey}] ${it.title} (${it.year ?? "?"})  ${m?.videoResolution}/${m?.videoCodec}  bitrate=${mbps} Mbps  defaultAudio=${m?.audioCodec}`);
    const streams: any[] = m?.Part?.[0]?.Stream ?? [];
    for (const s of streams.filter((x) => x.streamType === 2)) {
      console.log(
        `   audio: codec=${s.codec} ch=${s.channels} lang=${s.language ?? s.languageCode ?? "?"}` +
          ` default=${s.default ? "Y" : "-"} selected=${s.selected ? "Y" : "-"}  "${s.extendedDisplayTitle ?? s.displayTitle ?? ""}"`,
      );
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
