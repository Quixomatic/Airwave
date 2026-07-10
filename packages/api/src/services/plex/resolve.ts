import type { PrismaClient } from "@ChannelGuide/db";

import { type PlexItem, getSectionGenres, getSectionItems } from "./client";

type ChannelFilter = {
  mediaTypes?: string[]; // "movie" | "show" — which enabled libraries to draw from
  genreTitle?: string; // resolved to each library's own genre id
  unwatched?: boolean;
};

/**
 * Resolve a channel's candidate pool across ALL enabled libraries of the chosen
 * content type(s) — a channel can mix movies + TV. Genre is matched by TITLE and
 * resolved to each library's own genre id (ids differ per library). Movie libs
 * yield movies (type 1); show libs yield episodes (type 4).
 */
export async function resolveChannel(
  prisma: PrismaClient,
  channelId: string,
): Promise<PlexItem[]> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { definitions: { orderBy: { sortIndex: "asc" }, take: 1 }, mediaSource: true },
  });
  const source = channel?.mediaSource;
  const def = channel?.definitions[0];
  if (!channel || !source?.baseUrl || !def) return [];

  const filter = (def.plexFilter as unknown as ChannelFilter | null) ?? {};
  const mediaTypes = filter.mediaTypes?.length ? filter.mediaTypes : ["movie", "show"];

  const libs = await prisma.mediaLibrary.findMany({
    where: { mediaSourceId: source.id, enabled: true, type: { in: mediaTypes } },
  });

  const sort =
    channel.ordering === "SHUFFLE"
      ? "random"
      : channel.ordering === "BY_AIR_DATE"
        ? "originallyAvailableAt"
        : "titleSort";

  const out: PlexItem[] = [];
  for (const lib of libs) {
    let genreId: string | undefined;
    if (filter.genreTitle) {
      const genres = await getSectionGenres(source.baseUrl, source.token, lib.key);
      genreId = genres.find(
        (g) => g.title.toLowerCase() === filter.genreTitle!.toLowerCase(),
      )?.id;
      if (!genreId) continue; // this library has no such genre — skip it
    }
    const type: 1 | 4 = lib.type === "movie" ? 1 : 4;
    const items = await getSectionItems(source.baseUrl, source.token, lib.key, {
      type,
      genreId,
      unwatched: filter.unwatched,
      sort,
    });
    out.push(...items);
  }
  return out;
}
