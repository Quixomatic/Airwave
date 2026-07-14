import type { PrismaClient } from "@ChannelGuide/db";

import { notFound, preconditionFailed } from "../errors";
import { getPlaybackInfo, stopTranscode } from "../plex/client";
import { QUALITY_PRESETS, type ClientCaps } from "../plex/quality";
import { getChannelTimeline } from "../schedule/generate";

/**
 * Playback brokering — shared by the tRPC admin preview and the REST TV API.
 * Playback for ALL users uses the ADMIN's media-source connection (the token is
 * embedded in the returned URL); see `.docs/architecture.md` §10. Business logic
 * lives here so both transports stay thin. See [[thin-api-endpoints]].
 */

/** Resolve a channel to its (connected) media source + a client id for Plex calls. */
export async function resolveChannelSource(prisma: PrismaClient, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { mediaSource: true },
  });
  if (!channel) throw notFound("Channel not found.");
  const source = channel.mediaSource;
  if (!source?.baseUrl) throw preconditionFailed("Source is not connected.");
  return { channel, source, clientId: source.clientIdentifier ?? "channelguide-server" };
}

export type ResolveMediaOptions = {
  quality?: string;
  audioLang?: string;
  subtitleLang?: string;
  caps?: ClientCaps;
};

/** Resolve a playable URL for one item at one offset (client-driven). */
export async function resolveMedia(
  prisma: PrismaClient,
  channelId: string,
  ratingKey: string,
  offsetSeconds: number,
  opts: ResolveMediaOptions = {},
) {
  const { source, clientId } = await resolveChannelSource(prisma, channelId);
  const info = await getPlaybackInfo(
    source.baseUrl!,
    source.token,
    clientId,
    ratingKey,
    offsetSeconds,
    {
      quality: opts.quality,
      audioLang: opts.audioLang,
      subtitleLang: opts.subtitleLang,
      caps: opts.caps,
    },
  );
  if (!info) throw notFound("No playable media part.");
  return { ...info, offsetSeconds };
}

/** Stop a Plex transcode session (client calls on program change / teardown). */
export async function stopChannelTranscode(
  prisma: PrismaClient,
  channelId: string,
  session: string,
) {
  const { source, clientId } = await resolveChannelSource(prisma, channelId);
  await stopTranscode(source.baseUrl!, source.token, clientId, session);
  return { ok: true as const };
}

/** A window of the channel timeline (past → future) for the client state machine. */
export async function getTimelineWindow(
  prisma: PrismaClient,
  channelId: string,
  backMinutes: number,
  forwardMinutes: number,
) {
  const now = new Date();
  const from = new Date(now.getTime() - backMinutes * 60_000);
  const to = new Date(now.getTime() + forwardMinutes * 60_000);
  const slots = await getChannelTimeline(prisma, channelId, from, to);
  return { serverTime: now, slots };
}

/** The Plex-style quality ladder for the player's quality selector. */
export function qualityList() {
  return QUALITY_PRESETS.map((q) => ({ id: q.id, label: q.label }));
}
