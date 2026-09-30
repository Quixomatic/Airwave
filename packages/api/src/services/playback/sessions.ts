import type { PrismaClient } from "@airwave/db";

import { type GuideMeta, pingTranscode, stopTranscode } from "../plex/client";
import { decryptToken } from "../plex/token";
import { emitEvent, hasEventSubscribers, type WebhookEventType } from "../webhooks";

/** Session/playback events the heartbeat can emit — gates the prior-state read so an idle box does no work. */
const HEARTBEAT_EVENTS: WebhookEventType[] = [
  "session.started",
  "channel.tuned",
  "playback.started",
  "playback.paused",
  "playback.resumed",
];

/** A session is "active" while it's heartbeated within this window. */
export const SESSION_ACTIVE_MS = 30_000;

/** Compact payload for the session.* webhook events. */
type SessionEventCtx = {
  userId: string;
  deviceId: string;
  channelId: string | null;
  playbackState: string | null;
  delaySeconds: number;
  positionAt: Date | null;
  ratingKey: string | null;
  title: string | null;
};

/**
 * Build the enriched event payload shared by every session/playback webhook + SSE event — the same detail the
 * "Now Watching" view has: who + which device, the channel, the current program (with show/episode from the
 * guide), the live playback state, how far behind live, and where they are in the program. Runs only on a
 * transition (rare), so the extra lookups are cheap.
 */
async function sessionEventData(prisma: PrismaClient, ctx: SessionEventCtx) {
  const [user, channel] = await Promise.all([
    prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, email: true } }),
    ctx.channelId
      ? prisma.channel.findUnique({ where: { id: ctx.channelId }, select: { number: true, name: true, callsign: true } })
      : null,
  ]);

  // Resolve the current PROGRAM slot for progress + rich guide metadata (mirrors listActiveSessions).
  const position = ctx.positionAt ?? new Date(Date.now() - ctx.delaySeconds * 1000);
  const slot = ctx.channelId
    ? await prisma.scheduleItem.findFirst({
        where: { channelId: ctx.channelId, kind: "PROGRAM", startsAt: { lte: position } },
        orderBy: { startsAt: "desc" },
        include: { mediaItem: { select: { guide: true } } },
      })
    : null;
  const inSlot = slot != null && position.getTime() < slot.startsAt.getTime() + slot.durationSeconds * 1000;
  const guide = inSlot ? ((slot!.mediaItem?.guide as GuideMeta | null) ?? null) : null;
  const progress = inSlot
    ? {
        positionSeconds: Math.max(0, Math.floor((position.getTime() - slot!.startsAt.getTime()) / 1000)),
        durationSeconds: slot!.durationSeconds,
      }
    : null;

  return {
    userId: ctx.userId,
    deviceId: ctx.deviceId,
    user: user?.name ?? user?.email ?? null,
    channel: ctx.channelId
      ? { id: ctx.channelId, number: channel?.number ?? null, name: channel?.name ?? null, callsign: channel?.callsign ?? null }
      : null,
    program:
      ctx.ratingKey || ctx.title || guide
        ? {
            ratingKey: ctx.ratingKey ?? null,
            title: guide?.title ?? ctx.title ?? null,
            showTitle: guide?.showTitle ?? null,
            season: guide?.season ?? null,
            episode: guide?.episode ?? null,
            year: guide?.year ?? null,
          }
        : null,
    playbackState: ctx.playbackState,
    delaySeconds: ctx.delaySeconds,
    progress,
  };
}

export type HeartbeatInput = {
  channelId: string;
  state: "program" | "bumper" | "off";
  /** Stable client device id — one session per (user, device). Falls back to "legacy" when absent. */
  deviceId?: string | null;
  /** The player's actual state (play/pause/buffer). Absent from older clients; drives playback.* events. */
  playbackState?: "playing" | "paused" | "buffering" | "idle" | null;
  ratingKey?: string | null;
  title?: string | null;
  delaySeconds?: number;
  positionAt?: string | null;
  transcodeSession?: string | null;
};

/** Resolve the per-device session key; clients that don't send a device id collapse to one "legacy" session. */
const sessionDeviceId = (deviceId?: string | null) => deviceId?.trim() || "legacy";

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
  const data = {
    channelId: input.channelId,
    state: input.state,
    playbackState: input.playbackState ?? null,
    ratingKey: input.ratingKey ?? null,
    title: input.title ?? null,
    delaySeconds: input.delaySeconds ?? 0,
    positionAt: input.positionAt ? new Date(input.positionAt) : null,
    transcodeSession: input.transcodeSession ?? null,
    lastHeartbeatAt: now,
  };
  const deviceId = sessionDeviceId(input.deviceId);

  // Read prior state BEFORE the upsert to detect transitions (channel change, play/pause). Gated on there being
  // a relevant subscriber so an idle box does no extra query.
  const wantEvents = HEARTBEAT_EVENTS.some((t) => hasEventSubscribers(t));
  const prior = wantEvents
    ? await prisma.watchSession.findUnique({
        where: { userId_deviceId: { userId, deviceId } },
        select: { channelId: true, playbackState: true },
      })
    : null;

  const row = await prisma.watchSession.upsert({
    where: { userId_deviceId: { userId, deviceId } },
    create: { userId, deviceId, startedAt: now, ...data },
    update: data,
  });

  if (wantEvents) {
    // `startedAt` is only set on create, so it equals this call's `now` exactly iff the row is new — atomic, no
    // race, no dupes.
    const created = row.startedAt.getTime() === now.getTime();
    const events: WebhookEventType[] = [];
    // "active" = content is or should be rolling (playing or buffering), as opposed to paused or idle.
    const active = (s: string | null | undefined) => s === "playing" || s === "buffering";
    if (created) {
      events.push("session.started");
      if (active(input.playbackState)) events.push("playback.started");
    } else if (prior) {
      if (prior.channelId !== input.channelId) events.push("channel.tuned");
      // Play/pause transitions — only when the client reports playbackState (older clients don't). Compare on
      // paused-vs-not so the first pause after a tune (prior was buffering/idle, not yet "playing") still fires.
      if (input.playbackState) {
        const wasPaused = prior.playbackState === "paused";
        const isPaused = input.playbackState === "paused";
        if (isPaused && !wasPaused) events.push("playback.paused");
        else if (wasPaused && active(input.playbackState)) events.push("playback.resumed");
        else if (!wasPaused && active(input.playbackState) && !active(prior.playbackState)) {
          // idle → active mid-session (e.g. content finally loaded) reads as playback starting.
          events.push("playback.started");
        }
      }
    }
    if (events.length > 0) {
      const ctx: SessionEventCtx = {
        userId,
        deviceId,
        channelId: input.channelId,
        playbackState: input.playbackState ?? null,
        delaySeconds: input.delaySeconds ?? 0,
        positionAt: data.positionAt,
        ratingKey: input.ratingKey ?? null,
        title: input.title ?? null,
      };
      // Fire-and-forget so a slow emit can't affect the heartbeat; each emitEvent self-gates per type.
      void sessionEventData(prisma, ctx)
        .then((d) => events.forEach((t) => emitEvent(t, d)))
        .catch(() => {});
    }
  }

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

/** End a device's session (+ best-effort stop its Plex transcode). Keyed per (user, device). */
export async function endWatchSession(prisma: PrismaClient, userId: string, deviceId?: string | null) {
  const dev = sessionDeviceId(deviceId);
  const existing = await prisma.watchSession.findUnique({
    where: { userId_deviceId: { userId, deviceId: dev } },
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
  await prisma.watchSession.delete({ where: { userId_deviceId: { userId, deviceId: dev } } });
  // session.ended (+ playback.stopped when the client was reporting playback state). Fire-and-forget; gated.
  if (hasEventSubscribers("session.ended") || hasEventSubscribers("playback.stopped")) {
    const events: WebhookEventType[] = ["session.ended"];
    if (existing.playbackState) events.push("playback.stopped");
    const ctx: SessionEventCtx = {
      userId,
      deviceId: dev,
      channelId: existing.channelId,
      playbackState: existing.playbackState,
      delaySeconds: existing.delaySeconds,
      positionAt: existing.positionAt,
      ratingKey: existing.ratingKey,
      title: existing.title,
    };
    void sessionEventData(prisma, ctx)
      .then((d) => events.forEach((t) => emitEvent(t, d)))
      .catch(() => {});
  }
  return { ok: true as const };
}

/**
 * Reap sessions that stopped heartbeating (closed tab, crash, network drop, or a server restart the client
 * never returned from — a quick restart keeps the session because the client keeps heartbeating). Stops any
 * leftover Plex transcode, emits session.ended (+ playback.stopped) so consumers get closure just like a clean
 * end, and deletes the row. Called by the watch-session-reap job. Returns the count reaped.
 */
export async function reapStaleWatchSessions(
  prisma: PrismaClient,
  signal?: AbortSignal,
  thresholdMs = 60_000,
): Promise<number> {
  const cutoff = new Date(Date.now() - thresholdMs);
  const stale = await prisma.watchSession.findMany({
    where: { lastHeartbeatAt: { lt: cutoff } },
    include: { channel: { include: { mediaSource: true } } },
  });
  if (stale.length === 0) return 0;
  const wantEnd = hasEventSubscribers("session.ended") || hasEventSubscribers("playback.stopped");
  for (const s of stale) {
    if (signal?.aborted) throw new Error("Job canceled");
    const src = s.channel?.mediaSource;
    if (s.transcodeSession && src?.baseUrl) {
      await stopTranscode(
        src.baseUrl,
        decryptToken(src.token),
        src.clientIdentifier ?? "channelguide-server",
        s.transcodeSession,
      ).catch(() => {});
    }
    if (wantEnd) {
      const events: WebhookEventType[] = ["session.ended"];
      if (s.playbackState) events.push("playback.stopped");
      const ctx: SessionEventCtx = {
        userId: s.userId,
        deviceId: s.deviceId,
        channelId: s.channelId,
        playbackState: s.playbackState,
        delaySeconds: s.delaySeconds,
        positionAt: s.positionAt,
        ratingKey: s.ratingKey,
        title: s.title,
      };
      void sessionEventData(prisma, ctx)
        .then((d) => events.forEach((t) => emitEvent(t, d)))
        .catch(() => {});
    }
  }
  await prisma.watchSession.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  return stale.length;
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
/** The TvDevice fields the Sessions page needs to pick a brand logo + label. `raw` carries `isTV`. */
const DEVICE_FACTS = {
  deviceId: true,
  platform: true,
  model: true,
  osVersion: true,
  hdr: true,
  userAgent: true,
  raw: true,
} as const;

/**
 * Resolve the TvDevice for a session. Prefer the session's OWN deviceId (reliable for every modern client
 * since per-device sessions), and fall back to the latest play-log's device for a "legacy" session or one
 * whose device never registered a report — the same path the page used before. Either route lands on the
 * same TvDevice row.
 */
async function resolveSessionDevice(prisma: PrismaClient, sessionDeviceId: string, logDeviceId: string | null) {
  if (sessionDeviceId && sessionDeviceId !== "legacy") {
    const d = await prisma.tvDevice.findUnique({ where: { deviceId: sessionDeviceId }, select: DEVICE_FACTS });
    if (d) return d;
  }
  if (logDeviceId) {
    return prisma.tvDevice.findUnique({ where: { deviceId: logDeviceId }, select: DEVICE_FACTS });
  }
  return null;
}

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
      const deviceRow = await resolveSessionDevice(prisma, r.deviceId, log?.deviceId ?? null);
      const decision = (log?.decision as PlexDecision | null) ?? null;
      // Portrait POSTER of the show (for episodes, via grandparentRatingKey) or the movie itself — never
      // the landscape episode still. Same art the channel-edit preview uses.
      const posterKey = guide?.showRatingKey ?? r.ratingKey;

      return {
        id: r.id,
        user: r.user.name || r.user.email,
        deviceId: r.deviceId,
        channelId: r.channelId,
        channel: r.channel
          ? { number: r.channel.number, name: r.channel.name, callsign: r.channel.callsign }
          : null,
        state: r.state,
        playbackState: r.playbackState,
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
        device: deviceRow
          ? {
              id: deviceRow.deviceId,
              platform: deviceRow.platform,
              model: deviceRow.model,
              osVersion: deviceRow.osVersion,
              hdr: deviceRow.hdr,
              isTV: (deviceRow.raw as { isTV?: boolean } | null)?.isTV ?? null,
              userAgent: deviceRow.userAgent,
            }
          : null,
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
