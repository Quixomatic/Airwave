import type { PrismaClient } from "@airwave/db";

import { type GuideMeta, pingTranscode, stopTranscode } from "../plex/client";
import { decryptToken } from "../plex/token";
import { emitEvent, hasWebhookSubscribers, type WebhookEventType } from "../webhooks";

/** Playback/session events emitted from the heartbeat path; gated so an idle box does zero extra work. */
const HEARTBEAT_EVENTS = [
  "session.started",
  "channel.tuned",
  "playback.started",
  "playback.paused",
  "playback.resumed",
] as const;

/** Compact payload shared by every session/playback webhook event. */
type PlaybackEventData = {
  userId: string;
  user: string | null;
  channel: { id: string; number: number | null; name: string | null } | null;
  program: { ratingKey: string | null; title: string | null } | null;
};

async function buildEventData(
  prisma: PrismaClient,
  userId: string,
  channelId: string | null,
  ratingKey: string | null | undefined,
  title: string | null | undefined,
): Promise<PlaybackEventData> {
  const [user, channel] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    channelId ? prisma.channel.findUnique({ where: { id: channelId }, select: { number: true, name: true } }) : null,
  ]);
  return {
    userId,
    user: user?.name ?? user?.email ?? null,
    channel: channelId ? { id: channelId, number: channel?.number ?? null, name: channel?.name ?? null } : null,
    program: ratingKey || title ? { ratingKey: ratingKey ?? null, title: title ?? null } : null,
  };
}

/** Emit the heartbeat transition events (called only when a subscriber wants them; enriches once). */
async function emitHeartbeatEvents(
  prisma: PrismaClient,
  userId: string,
  prior: { channelId: string | null; state: string } | null,
  input: HeartbeatInput,
): Promise<void> {
  const events: WebhookEventType[] = [];
  const isPlaying = input.state !== "off";
  if (!prior) {
    // Brand-new session: it opened, and if content is rolling, playback began.
    events.push("session.started");
    if (isPlaying) events.push("playback.started");
  } else {
    if (prior.channelId !== input.channelId) events.push("channel.tuned");
    const wasPlaying = prior.state !== "off";
    // Within an existing session, off↔playing is a resume/pause (a true stop is session end).
    if (!wasPlaying && isPlaying) events.push("playback.resumed");
    if (wasPlaying && !isPlaying) events.push("playback.paused");
  }
  if (events.length === 0) return;
  const data = await buildEventData(prisma, userId, input.channelId, input.ratingKey, input.title);
  for (const type of events) emitEvent(type, data);
}

/** A session is "active" while it's heartbeated within this window. */
export const SESSION_ACTIVE_MS = 30_000;

export type HeartbeatInput = {
  channelId: string;
  state: "program" | "bumper" | "off";
  ratingKey?: string | null;
  title?: string | null;
  delaySeconds?: number;
  positionAt?: string | null;
  transcodeSession?: string | null;
};

/**
 * In-house watch-session tracking (we deliberately don't report to Plex — see
 * `.docs/playback-model.md` §8a). One live session per user; the client
 * heartbeats ~every 10s. Shared by the tRPC admin preview and the REST TV API.
 */
export async function heartbeatSession(
  prisma: PrismaClient,
  userId: string,
  input: HeartbeatInput,
) {
  const now = new Date();
  // Only read the prior row (to detect transitions) when a webhook actually wants one of these events —
  // keeps the ~10s heartbeat free of extra work on an idle box.
  const wantEvents = HEARTBEAT_EVENTS.some((t) => hasWebhookSubscribers(t));
  const prior = wantEvents
    ? await prisma.watchSession.findUnique({ where: { userId }, select: { channelId: true, state: true } })
    : null;

  const data = {
    channelId: input.channelId,
    state: input.state,
    ratingKey: input.ratingKey ?? null,
    title: input.title ?? null,
    delaySeconds: input.delaySeconds ?? 0,
    positionAt: input.positionAt ? new Date(input.positionAt) : null,
    transcodeSession: input.transcodeSession ?? null,
    lastHeartbeatAt: now,
  };
  await prisma.watchSession.upsert({
    where: { userId },
    create: { userId, startedAt: now, ...data },
    update: data,
  });

  // Fire webhook events for state TRANSITIONS only (never per-heartbeat). Fire-and-forget so a slow/failed
  // emit can't affect the heartbeat's latency or success.
  if (wantEvents) void emitHeartbeatEvents(prisma, userId, prior, input).catch(() => {});

  // Keep the Plex transcode session alive. Plex reaps a transcode as "paused for too long" (~5½ min) unless it
  // gets a periodic liveness ping — active segment fetching does NOT count (GitHub #13). `transcodeSession` is
  // set ONLY on the HLS-transcode path (direct-play returns a null session), so its presence is the gate. We use
  // the transcode-scoped `universal/ping` (no ratingKey / no progress) so it never pollutes the owner's watch
  // history — see `.docs/playback-model.md` §8a. Fire-and-forget so the heartbeat stays fast; a missed ping just
  // falls back to the client's resume-stall watchdog.
  if (input.transcodeSession && input.channelId) {
    void keepTranscodeAlive(prisma, input.channelId, input.transcodeSession);
  }

  // Also record PER-CHANNEL watch state. `WatchSession` is one row per user (the *current*
  // session), so it carries no history — this table is the history: its @@unique([userId,
  // channelId]) dedupes to one row per channel and `updatedAt` orders them, which is exactly the
  // guide's "Recents" list. (It's also the seed for cross-device resume — the table's raison
  // d'être.) Skipped when nothing's playing so "off" never counts as watching.
  if (input.state !== "off" && input.channelId) {
    const watched = {
      atLiveEdge: (input.delaySeconds ?? 0) < 5,
      positionAt: input.positionAt ? new Date(input.positionAt) : null,
      lastRatingKey: input.ratingKey ?? null,
    };
    await prisma.channelWatchState.upsert({
      where: { userId_channelId: { userId, channelId: input.channelId } },
      create: { userId, channelId: input.channelId, ...watched },
      update: watched,
    });
  }
  return { ok: true as const };
}

/** Ping the Plex transcode session for `channelId`'s media source to keep it alive (see the call site in
 * heartbeatSession + `pingTranscode`). Best-effort: resolves the source, decrypts the token, pings; any failure
 * is swallowed. */
async function keepTranscodeAlive(prisma: PrismaClient, channelId: string, session: string): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: { mediaSource: true },
    });
    const src = channel?.mediaSource;
    if (!src?.baseUrl) return;
    await pingTranscode(
      src.baseUrl,
      decryptToken(src.token),
      src.clientIdentifier ?? "channelguide-server",
      session,
    );
  } catch {
    // best-effort — the client's resume-stall watchdog is the backstop
  }
}

/** End the user's session (+ best-effort stop its Plex transcode). */
export async function endWatchSession(prisma: PrismaClient, userId: string) {
  const existing = await prisma.watchSession.findUnique({
    where: { userId },
    include: { channel: { include: { mediaSource: true } } },
  });
  if (!existing) return { ok: true as const };
  const src = existing.channel?.mediaSource;
  if (existing.transcodeSession && src?.baseUrl) {
    await stopTranscode(
      src.baseUrl,
      decryptToken(src.token),
      src.clientIdentifier ?? "channelguide-server",
      existing.transcodeSession,
    );
  }
  await prisma.watchSession.delete({ where: { userId } });

  // Webhook: the viewer stopped watching (the terminal event — a mid-session pause is playback.paused).
  // Enrich + emit only if a subscriber wants it.
  if (hasWebhookSubscribers("session.ended") || hasWebhookSubscribers("playback.stopped")) {
    void buildEventData(prisma, userId, existing.channelId, existing.ratingKey, existing.title)
      .then((data) => {
        emitEvent("playback.stopped", data);
        emitEvent("session.ended", data);
      })
      .catch(() => {});
  }
  return { ok: true as const };
}

type PlexDecision = {
  videoDecision?: string; // "copy" (direct play) | "transcode"
  audioDecision?: string;
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
};

/** Active watch sessions — the admin "Now Watching" view. Each session is enriched, Plex-style, with:
 *  the current PROGRAM slot (program progress + rich episode metadata: show / SxEy / episode title /
 *  art), the delivery detail from the latest matching play-log (Direct Play vs Transcode per video/audio +
 *  connection), and the device it's on. A handful of sessions are ever active, so the per-row lookups are
 *  cheap. Additive to the guide chip's shape (id/user/channel/state/title/delaySeconds all still present). */
export async function listActiveSessions(prisma: PrismaClient) {
  const since = new Date(Date.now() - SESSION_ACTIVE_MS);
  const rows = await prisma.watchSession.findMany({
    where: { lastHeartbeatAt: { gte: since } },
    orderBy: { startedAt: "asc" },
    include: {
      user: { select: { name: true, email: true } },
      channel: { select: { number: true, name: true, callsign: true } },
    },
  });
  const now = Date.now();
  return Promise.all(
    rows.map(async (r) => {
      // Where they are on the channel timeline: positionAt is exact; else derive from behind-live.
      const position = r.positionAt ?? new Date(now - r.delaySeconds * 1000);
      // The current PROGRAM slot at that instant → program progress + the item's guide bundle (one
      // indexed query on (channelId, startsAt)). "latest slot starting at or before position" = the
      // one on now, confirmed still within its duration.
      const slot = r.channelId
        ? await prisma.scheduleItem.findFirst({
            where: { channelId: r.channelId, kind: "PROGRAM", startsAt: { lte: position } },
            orderBy: { startsAt: "desc" },
            include: { mediaItem: { select: { guide: true } } },
          })
        : null;
      const inSlot = slot != null && position.getTime() < slot.startsAt.getTime() + slot.durationSeconds * 1000;
      const guide = inSlot ? ((slot!.mediaItem?.guide as GuideMeta | null) ?? null) : null;
      const progress =
        inSlot && r.state === "program"
          ? {
              positionSeconds: Math.max(0, Math.floor((position.getTime() - slot!.startsAt.getTime()) / 1000)),
              durationSeconds: slot!.durationSeconds,
            }
          : null;

      // Latest matching play-log → how it's actually delivering right now.
      const log =
        r.ratingKey && r.channelId
          ? await prisma.playbackLog.findFirst({
              where: { userId: r.userId, channelId: r.channelId, ratingKey: r.ratingKey },
              orderBy: { createdAt: "desc" },
            })
          : null;
      const device = log?.deviceId
        ? await prisma.tvDevice.findUnique({
            where: { deviceId: log.deviceId },
            select: { model: true, platform: true },
          })
        : null;
      const decision = (log?.decision as PlexDecision | null) ?? null;
      // Portrait POSTER of the show (for episodes, via grandparentRatingKey) or the movie itself — never
      // the landscape episode still. Same art the channel-edit preview uses.
      const posterKey = guide?.showRatingKey ?? r.ratingKey;

      return {
        id: r.id,
        user: r.user.name || r.user.email,
        channelId: r.channelId,
        channel: r.channel
          ? { number: r.channel.number, name: r.channel.name, callsign: r.channel.callsign }
          : null,
        state: r.state,
        // Prefer the current program's guide (structured), fall back to the session's title snapshot.
        title: guide?.title ?? r.title,
        showTitle: guide?.showTitle ?? null,
        season: guide?.season ?? null,
        episode: guide?.episode ?? null,
        year: guide?.year ?? null,
        // Relative Plex poster path for the /img proxy (show/movie poster — portrait).
        thumbPath: posterKey ? `/library/metadata/${posterKey}/thumb` : null,
        // The poster's rating key (show key for episodes, else the item) — the public API builds its tokenless
        // artwork URL from this rather than the raw thumbPath, so the Plex path stays internal.
        posterRatingKey: posterKey ?? null,
        ratingKey: r.ratingKey,
        delaySeconds: r.delaySeconds,
        progress,
        startedAt: r.startedAt,
        lastHeartbeatAt: r.lastHeartbeatAt,
        transcoding: !!r.transcodeSession,
        device: log?.deviceId ? { id: log.deviceId, model: device?.model ?? null, platform: device?.platform ?? null } : null,
        connection: log?.connection ?? null,
        mode: log?.mode ?? null,
        outcome: log?.outcome ?? null,
        decodedWidth: log?.decodedWidth ?? null,
        decodedHeight: log?.decodedHeight ?? null,
        container: decision?.container ?? log?.sourceContainer ?? null,
        video: log
          ? { decision: decision?.videoDecision ?? null, codec: decision?.videoCodec ?? log.sourceVideoCodec ?? null }
          : null,
        audio: log
          ? { decision: decision?.audioDecision ?? null, codec: decision?.audioCodec ?? log.sourceAudioCodec ?? null }
          : null,
      };
    }),
  );
}
