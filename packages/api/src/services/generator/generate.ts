import type { PrismaClient } from "@ChannelGuide/db";

import type { SyncProgress } from "../media/media-item";
import { resolveFilter } from "../plex/resolve";
import { PRESET_PACKAGES } from "./presets";

export type GenerateResult = {
  packagesCreated: number;
  channelsCreated: number;
  skipped: { name: string; count: number; needed: number }[];
};

/**
 * Auto-lineup generator: for one source, evaluate every preset against the library
 * and instantiate the ones with enough matching content into packages + channels.
 * Idempotent — deletes all previously-generated packages/channels first, so manual
 * ones are never touched. Run it as a background job (it's Plex-query heavy).
 */
export async function generateLineup(
  prisma: PrismaClient,
  sourceId: string,
  onProgress?: SyncProgress,
): Promise<GenerateResult> {
  const source = await prisma.mediaSource.findUnique({ where: { id: sourceId } });
  if (!source?.baseUrl) throw new Error("Source is not connected.");
  const src = { id: source.id, baseUrl: source.baseUrl, token: source.token };

  // Idempotent regen: wipe prior generated content (leaves manual channels/packages).
  await prisma.channel.deleteMany({ where: { generated: true, mediaSourceId: sourceId } });
  await prisma.channelPackage.deleteMany({ where: { generated: true } });

  // Avoid channel-number collisions with the surviving (manual) channels.
  const used = new Set(
    (await prisma.channel.findMany({ select: { number: true } })).map((c) => c.number),
  );
  const nextFree = (n: number) => {
    let x = n;
    while (used.has(x)) x++;
    used.add(x);
    return x;
  };

  const total = PRESET_PACKAGES.reduce((s, p) => s + p.channels.length, 0);
  let done = 0;
  let packagesCreated = 0;
  let channelsCreated = 0;
  const skipped: GenerateResult["skipped"] = [];

  for (const pkg of PRESET_PACKAGES) {
    const survivors: (typeof pkg.channels)[number][] = [];
    for (const ch of pkg.channels) {
      onProgress?.({ current: done++, total, label: ch.name });
      const items = await resolveFilter(prisma, src, ch.mediaTypes, ch.filter, "titleSort");
      if (items.length < ch.minItems) {
        skipped.push({ name: ch.name, count: items.length, needed: ch.minItems });
        continue;
      }
      survivors.push(ch);
    }
    if (survivors.length === 0) continue;

    const created = await prisma.channelPackage.create({
      data: {
        key: pkg.key,
        name: pkg.name,
        description: pkg.description,
        icon: pkg.icon,
        tint: pkg.tint,
        sortIndex: pkg.sortIndex,
        generated: true,
      },
    });
    packagesCreated++;

    for (const ch of survivors) {
      await prisma.channel.create({
        data: {
          name: ch.name,
          number: nextFree(ch.number),
          description: ch.description,
          mediaSourceId: sourceId,
          ordering: ch.ordering,
          icon: ch.icon ?? null,
          tint: ch.tint ?? null,
          packageId: created.id,
          generated: true,
          presetKey: ch.key,
          definitions: {
            create: {
              kind: "PREDICATE",
              plexFilter: {
                mediaTypes: ch.mediaTypes,
                ...(ch.filter ? { filter: JSON.parse(JSON.stringify(ch.filter)) } : {}),
              },
            },
          },
        },
      });
      channelsCreated++;
    }
  }

  return { packagesCreated, channelsCreated, skipped };
}
