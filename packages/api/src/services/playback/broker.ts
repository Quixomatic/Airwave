import type { PrismaClient } from "@ChannelGuide/db";

import { getDeviceNativeCaps } from "../capabilities/native-caps";
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
  audioStreamId?: string;
  subtitleStreamId?: string;
  /** The client's canPlayType self-report — a fallback used only until the device
   * has run the capability diagnostic (canPlayType lies on TVs). */
  caps?: ClientCaps;
  /** The reporting device — if it has a MEASURED capability map, that overrides the
   * canPlayType guess and becomes the source of truth for the Plex profile. */
  deviceId?: string;
  /** Set by the client after a NATIVE attempt errored → force the hls.js/MSE path. */
  forceHls?: boolean;
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
  // Prefer the device's MEASURED native-decode map (from the onboarding diagnostic)
  // over its canPlayType self-report — measure, don't guess. See
  // capabilities/native-caps.ts + [[project-tv-playback-protocol]].
  const measured = opts.deviceId ? await getDeviceNativeCaps(prisma, opts.deviceId) : null;
  const info = await getPlaybackInfo(
    source.baseUrl!,
    source.token,
    clientId,
    ratingKey,
    offsetSeconds,
    {
      quality: opts.quality,
      audioStreamId: opts.audioStreamId,
      subtitleStreamId: opts.subtitleStreamId,
      caps: measured ?? opts.caps,
      forceHls: opts.forceHls,
    },
  );
  if (!info) throw notFound("No playable media part.");
  return { ...info, offsetSeconds, capsSource: measured ? "measured" : opts.caps ? "reported" : "default" };
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
