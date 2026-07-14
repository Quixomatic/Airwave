import type { PrismaClient } from "@ChannelGuide/db";

import { stopTranscode } from "../plex/client";

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
  return { ok: true as const };
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
      src.token,
      src.clientIdentifier ?? "channelguide-server",
      existing.transcodeSession,
    );
  }
  await prisma.watchSession.delete({ where: { userId } });
  return { ok: true as const };
}

/** Active watch sessions — the admin "Now Watching" view. */
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
  return rows.map((r) => ({
    id: r.id,
    user: r.user.name || r.user.email,
    channel: r.channel
      ? { number: r.channel.number, name: r.channel.name, callsign: r.channel.callsign }
      : null,
    state: r.state,
    title: r.title,
    delaySeconds: r.delaySeconds,
    startedAt: r.startedAt,
  }));
}
