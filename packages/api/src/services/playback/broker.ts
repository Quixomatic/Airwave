import type { PrismaClient } from "@airwave/db";

import { getDeviceNativeCaps } from "../capabilities/native-caps";
import { notFound, preconditionFailed } from "../errors";
import { getPlaybackInfo, stopTranscode } from "../plex/client";
import { QUALITY_PRESETS, type ClientCaps } from "../plex/quality";
import { withDecryptedToken } from "../plex/token";
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
  if (!channel.mediaSource?.baseUrl) throw preconditionFailed("Source is not connected.");
  // Decrypt the owner token here — every consumer of this source (playback, stopTranscode, the
  // /img proxy) makes a Plex call with it. See services/plex/token.ts.
  const source = withDecryptedToken(channel.mediaSource);
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
  /** Which stored connection the CLIENT streams from — "local" (baseUrl), "remote" (WAN), or
   * "relay". The server always fetches Plex over baseUrl; this only picks the base stamped onto
   * the returned URL, for a TV that's away from home. A remote/relay with no stored URL falls
   * back to local. Default "local". See [[remote-playback]]. */
  connection?: "local" | "remote" | "relay";
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

  // Which base the CLIENT streams from. The server always fetches over baseUrl (LAN); a TV
  // that's off-network asks for "remote"/"relay". Fall back to local if that URL isn't stored.
  const requested = opts.connection ?? "local";
  const chosenUrl =
    requested === "remote" ? source.remoteUrl : requested === "relay" ? source.relayUrl : source.baseUrl;
  const clientBaseUrl = chosenUrl ?? source.baseUrl!;
  const connection: "local" | "remote" | "relay" = chosenUrl ? requested : "local";

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
      clientBaseUrl,
    },
  );
  if (!info) throw notFound("No playable media part.");

  // Dolby Vision metadata (captured at sync → MediaItem.guide.dovi). Passed through so the native
  // player CAN switch the Apple TV into DV mode (dvh1 display criteria) — that consumer is a later,
  // tvOS-only step; for now it's plumbed but unused. See .plans/tv-native.md §11 (DV arc).
  const item = await prisma.mediaItem.findUnique({
    where: { mediaSourceId_ratingKey: { mediaSourceId: source.id, ratingKey } },
    select: { guide: true },
  });
  const dovi = (item?.guide as { dovi?: { profile: number; level?: number; blCompatId?: number } } | null)?.dovi;

  return {
    ...info,
    offsetSeconds,
    connection,
    capsSource: measured ? "measured" : opts.caps ? "reported" : "default",
    ...(dovi ? { dovi } : {}),
  };
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
