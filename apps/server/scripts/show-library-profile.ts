/**
 * Dump the library profile (§7.3a §4.1) — the compact "map" the AI lineup planner
 * reasons over. Useful for sanity-checking that the distillation actually reflects the
 * library before trusting a plan built from it, and for seeing how many tokens the
 * profile costs in the (cached) planning prompt.
 *
 *   bun --env-file=.env run scripts/show-library-profile.ts [sourceId]
 *
 * With no sourceId it uses the first enabled media source.
 */
import prisma from "@ChannelGuide/db";

import {
  buildLibraryProfile,
  formatLibraryProfile,
} from "@ChannelGuide/api/services/agent/library-profile";

const sourceId =
  process.argv[2] ??
  (await prisma.mediaSource.findFirst({ where: { enabled: true }, select: { id: true } }))?.id;

if (!sourceId) throw new Error("No enabled media source found — pass a sourceId explicitly.");

const started = Date.now();
const profile = await buildLibraryProfile(prisma, sourceId);
const elapsed = Date.now() - started;

const text = formatLibraryProfile(profile);
console.log(text);
console.log(
  `\n--- built in ${elapsed}ms · ${text.length} chars (~${Math.ceil(text.length / 4)} tokens) ---`,
);

await prisma.$disconnect();
