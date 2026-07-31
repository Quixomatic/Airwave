import {
  type AccessSet,
  accessibleChannels,
  filterAccessibleIds,
  isChannelAllowed,
} from "@ChannelGuide/api/services/access/access";
import { listEnabledMusic } from "@ChannelGuide/api/services/bumper-music/library";
import { ApiError } from "@ChannelGuide/api/services/errors";
import { listFavoriteChannelIds, setFavorite } from "@ChannelGuide/api/services/favorites";
import { getGuideGrid, listGuideChannels } from "@ChannelGuide/api/services/guide";
import { listActivePackages } from "@ChannelGuide/api/services/packages";
import { listRecentChannelIds } from "@ChannelGuide/api/services/recents";
import {
  getTimelineWindow,
  qualityList,
  resolveMedia,
  stopChannelTranscode,
} from "@ChannelGuide/api/services/playback/broker";
import {
  endWatchSession,
  heartbeatSession,
  listActiveSessions,
} from "@ChannelGuide/api/services/playback/sessions";
import {
  getCapabilityManifest,
  saveCapabilityResult,
} from "@ChannelGuide/api/services/capabilities/service";
import {
  getDeviceCapabilityView,
  resetDeviceCapabilityOverrides,
  setDeviceCapabilityOverride,
  type CapKind,
} from "@ChannelGuide/api/services/capabilities/device-settings";
import { reportDevice } from "@ChannelGuide/api/services/devices/report";
import { logPlayback } from "@ChannelGuide/api/services/playback/log";
import { getNowNext } from "@ChannelGuide/api/services/schedule/generate";
import prisma from "@ChannelGuide/db";
import { auth } from "@ChannelGuide/auth";
import { Hono } from "hono";

/**
 * REST guide/playback API for the TV apps (`apps/tv-web`, webOS first).
 *
 * The admin panel uses tRPC (typed, in-monorepo); this is the parallel REST
 * surface for heterogeneous clients. Both call the SAME services in
 * `packages/api/src/services/` — no logic is duplicated here; handlers are thin.
 *
 * Auth: any authenticated user (a Viewer) via `Authorization: Bearer <token>`
 * (the better-auth `bearer` plugin) or a session cookie. Unlike the tRPC
 * admin procedures, these are viewer-level — TV viewers, not admins. Playback
 * still brokers the ADMIN's media-source connection for everyone (§10).
 */

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

const api = new Hono<{ Variables: { session: Session; access: AccessSet } }>();

/**
 * Require an authenticated session (cookie or bearer token) AND resolve the viewer's access set once for
 * the whole request (access control §7.13). Everything downstream reads `c.get("access")` — `"all"` for
 * admins + all-access users (short-circuits every filter/guard), otherwise the exact accessible channel ids.
 */
api.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Authentication required" }, 401);
  c.set("session", session);
  c.set("access", await accessibleChannels(prisma, session.user.id));
  await next();
});

/**
 * Gate every per-channel route (`/channels/:id/timeline|now|media|stop`) in ONE place: 403 unless the
 * viewer may access the `:id`. Runs after the `*` middleware, so `access` is already resolved. The
 * must-have is `/media` — a direct bearer call or deep-link can't stream a channel the viewer can't see.
 * (Routes that carry the channel id in the BODY — heartbeat, favorite — are guarded inline; a middleware
 * can't read the body without consuming it.)
 */
api.use("/channels/:id/*", async (c, next) => {
  const id = c.req.param("id");
  if (id && !isChannelAllowed(c.get("access"), id)) {
    return c.json({ error: "You don't have access to this channel" }, 403);
  }
  await next();
});

/** Map a service ApiError → HTTP status; anything else → 500. */
function onError(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("[rest] unhandled error:", err);
  return Response.json({ error: "Internal error" }, { status: 500 });
}

/** Parse an int query param, clamped to [min,max], falling back to `def`. */
function intParam(raw: string | undefined, def: number, min: number, max: number): number {
  const n = raw == null ? def : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

// --- Guide / lineup -------------------------------------------------------

/** Enabled channels in lineup order (the TV channel list / surfing) — scoped to the viewer's access. */
api.get("/channels", async (c) => c.json({ channels: await listGuideChannels(prisma, c.get("access")) }));

/** Channel packages that have active channels the viewer can access — the guide sidebar's filter list. */
api.get("/packages", async (c) => c.json({ packages: await listActivePackages(prisma, c.get("access")) }));

// --- Favorites (per-user, synced across devices) --------------------------

/** This user's favorited channel ids (the guide's heart state + "Favorites" lens) — accessible ones only. */
api.get("/favorites", async (c) =>
  c.json({
    channelIds: filterAccessibleIds(
      await listFavoriteChannelIds(prisma, c.get("session").user.id),
      c.get("access"),
    ),
  }),
);

/**
 * Favorite / unfavorite a channel. The BODY carries the desired state (`favorite: true|false`)
 * rather than a toggle, so it's idempotent — a retry or double-press can't flip it back.
 * POST (not PUT/DELETE) to match the rest of this surface: CORS here only allows GET/POST/OPTIONS.
 */
api.post("/favorites", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { channelId?: string; favorite?: boolean } | null;
  if (!body?.channelId || typeof body.favorite !== "boolean") {
    return c.json({ error: "channelId and favorite are required" }, 400);
  }
  if (!isChannelAllowed(c.get("access"), body.channelId)) {
    return c.json({ error: "You don't have access to this channel" }, 403);
  }
  return c.json(await setFavorite(prisma, c.get("session").user.id, body.channelId, body.favorite));
});

/** This user's recently-watched channels, deduped, most-recent-first (the "Recents" lens) — accessible only. */
api.get("/recents", async (c) =>
  c.json({
    channelIds: filterAccessibleIds(
      await listRecentChannelIds(prisma, c.get("session").user.id),
      c.get("access"),
    ),
  }),
);

/** Cross-channel guide grid over a forward window — scoped to the viewer's access. */
api.get("/guide", async (c) => {
  const forwardMinutes = intParam(c.req.query("forwardMinutes"), 150, 30, 720);
  const backMinutes = intParam(c.req.query("backMinutes"), 60, 0, 360);
  return c.json(await getGuideGrid(prisma, forwardMinutes, backMinutes, c.get("access")));
});

/** The Plex-style quality ladder for the client's quality selector. */
api.get("/qualities", (c) => c.json({ qualities: qualityList() }));

/**
 * Enabled ambient bumper-music tracks (§7.14) — the client picks one at random to play under a bumper.
 * Bytes are streamed from the public `/bumper-music/<file>` static route (range-served). Empty list → silent.
 */
api.get("/bumper-music", async (c) => c.json({ tracks: await listEnabledMusic(prisma) }));

// --- Per-channel playback -------------------------------------------------

/** A window of the channel timeline (past → future) for the client state machine. */
api.get("/channels/:id/timeline", async (c) => {
  const backMinutes = intParam(c.req.query("backMinutes"), 360, 0, 1440);
  const forwardMinutes = intParam(c.req.query("forwardMinutes"), 180, 30, 1440);
  return c.json(await getTimelineWindow(prisma, c.req.param("id"), backMinutes, forwardMinutes));
});

/** What's on now + next on a channel (convenience for tune-in / guide). */
api.get("/channels/:id/now", async (c) => {
  try {
    return c.json(await getNowNext(prisma, c.req.param("id")));
  } catch (err) {
    return onError(err);
  }
});

/** Resolve a playable URL for one item at one offset (client-driven). */
api.get("/channels/:id/media", async (c) => {
  const ratingKey = c.req.query("ratingKey");
  if (!ratingKey) return c.json({ error: "ratingKey is required" }, 400);
  const offsetSeconds = intParam(c.req.query("offsetSeconds"), 0, 0, Number.MAX_SAFE_INTEGER);
  // Device capabilities (a TV): comma-separated codec/container lists → direct-play/
  // direct-stream decision + Plex profile. Absent → the built-in browser assumption.
  const vcodecs = c.req.query("vcodecs");
  const caps = vcodecs
    ? {
        videoCodecs: vcodecs.split(",").filter(Boolean),
        audioCodecs: (c.req.query("acodecs") ?? "").split(",").filter(Boolean),
        directContainers: (c.req.query("dcontainers") ?? "").split(",").filter(Boolean),
      }
    : undefined;
  // Which stored connection the TV streams from (it probes local/remote/relay at launch and
  // sends its pick here). Only "remote"/"relay" are meaningful; anything else = local (default).
  const network = c.req.query("network");
  try {
    return c.json(
      await resolveMedia(prisma, c.req.param("id"), ratingKey, offsetSeconds, {
        quality: c.req.query("quality"),
        audioStreamId: c.req.query("audioStreamId"),
        subtitleStreamId: c.req.query("subtitleStreamId"),
        caps,
        deviceId: c.req.query("deviceId"),
        forceHls: c.req.query("forceHls") === "1",
        connection: network === "remote" || network === "relay" ? network : undefined,
      }),
    );
  } catch (err) {
    return onError(err);
  }
});

/**
 * The media server's reachable connection URLs, so a TV can probe local-vs-remote at launch
 * and then send `?network=` on /media. The server itself always uses the LAN `baseUrl`; these
 * are only for the client. No token is included (it's added at /media resolve time).
 */
api.get("/connections", async (c) => {
  const source = await prisma.mediaSource.findFirst({
    where: { enabled: true, type: "PLEX" },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { baseUrl: true, remoteUrl: true, relayUrl: true },
  });
  if (!source) return c.json({ error: "No media source" }, 404);
  return c.json({ local: source.baseUrl, remote: source.remoteUrl, relay: source.relayUrl });
});

/** Record a tune's diagnostics to the DB (test log). */
api.post("/playback/log", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Parameters<typeof logPlayback>[2] | null;
  if (!body) return c.json({ error: "body required" }, 400);
  if (body.channelId && !isChannelAllowed(c.get("access"), body.channelId)) {
    return c.json({ error: "You don't have access to this channel" }, 403);
  }
  return c.json(await logPlayback(prisma, c.get("session").user.id, body));
});

/** Stop a Plex transcode session (client calls on program change / teardown). */
api.post("/channels/:id/stop", async (c) => {
  const body = await c.req.json().catch(() => ({}) as { session?: string });
  if (!body?.session) return c.json({ error: "session is required" }, 400);
  try {
    return c.json(await stopChannelTranscode(prisma, c.req.param("id"), body.session));
  } catch (err) {
    return onError(err);
  }
});

// --- Capability diagnostic (native-decode probe matrix) -------------------

/** The probe matrix the TV app iterates (media served at /caps/media/*). */
api.get("/caps/manifest", (c) => c.json({ tests: getCapabilityManifest() }));

/** Record one capability-test result (auto metrics + manual verdicts). */
api.post("/caps/result", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | Parameters<typeof saveCapabilityResult>[2]
    | null;
  if (!body?.deviceId || !body?.testId) {
    return c.json({ error: "deviceId and testId required" }, 400);
  }
  return c.json(await saveCapabilityResult(prisma, c.get("session").user.id, body));
});

// --- Device capability reporting (webOS probe) ----------------------------

/** A signed-in device reports what it can actually decode/render — we persist it. */
api.post("/devices/report", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { deviceId?: string } | null;
  if (!body?.deviceId) return c.json({ error: "deviceId is required" }, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json(await reportDevice(prisma, c.get("session").user.id, body as any));
});

// --- Device capability settings (the Device page toggles) -----------------

/** The per-token capability breakdown (measured / quirk / override / effective) + recent errors. */
api.get("/device/caps", async (c) => {
  const deviceId = c.req.query("deviceId");
  if (!deviceId) return c.json({ error: "deviceId is required" }, 400);
  return c.json(await getDeviceCapabilityView(prisma, deviceId));
});

/** Toggle one codec/container override; `value: null` clears it (revert that token to measured). */
api.post("/device/caps", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { deviceId?: string; kind?: CapKind; token?: string; value?: boolean | null }
    | null;
  if (!body?.deviceId || !body?.kind || !body?.token) {
    return c.json({ error: "deviceId, kind and token are required" }, 400);
  }
  const overrides = await setDeviceCapabilityOverride(prisma, body.deviceId, body.kind, body.token, body.value ?? null);
  return c.json({ overrides });
});

/** Reset ALL overrides for a device → revert to exactly what the diagnostic found. */
api.post("/device/caps/reset", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { deviceId?: string } | null;
  if (!body?.deviceId) return c.json({ error: "deviceId is required" }, 400);
  await resetDeviceCapabilityOverrides(prisma, body.deviceId);
  return c.json({ ok: true });
});

// --- Watch sessions -------------------------------------------------------

/** Upsert the current user's live watch session (client heartbeats ~every 10s). */
api.post("/sessions/heartbeat", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    channelId?: string;
    state?: "program" | "bumper" | "off";
    ratingKey?: string | null;
    title?: string | null;
    delaySeconds?: number;
    positionAt?: string | null;
    transcodeSession?: string | null;
  } | null;
  if (!body?.channelId || !body.state) {
    return c.json({ error: "channelId and state are required" }, 400);
  }
  if (!isChannelAllowed(c.get("access"), body.channelId)) {
    return c.json({ error: "You don't have access to this channel" }, 403);
  }
  return c.json(
    await heartbeatSession(prisma, c.get("session").user.id, {
      channelId: body.channelId,
      state: body.state,
      ratingKey: body.ratingKey,
      title: body.title,
      delaySeconds: body.delaySeconds,
      positionAt: body.positionAt,
      transcodeSession: body.transcodeSession,
    }),
  );
});

/** End the current user's session (+ best-effort stop its transcode). */
api.post("/sessions/end", async (c) =>
  c.json(await endWatchSession(prisma, c.get("session").user.id)),
);

/** Active watch sessions — the "Now Watching" view (admin only). */
api.get("/sessions", async (c) => {
  const role = (c.get("session").user as { role?: string | null }).role ?? null;
  if (role !== "admin") return c.json({ error: "Admin access required" }, 403);
  return c.json({ sessions: await listActiveSessions(prisma) });
});

export const restApi = api;
