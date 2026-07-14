import { ApiError } from "@ChannelGuide/api/services/errors";
import { getGuideGrid, listGuideChannels } from "@ChannelGuide/api/services/guide";
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

const api = new Hono<{ Variables: { session: Session } }>();

/** Require an authenticated session (cookie or bearer token). */
api.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Authentication required" }, 401);
  c.set("session", session);
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

/** Enabled channels in lineup order (the TV channel list / surfing). */
api.get("/channels", async (c) => c.json({ channels: await listGuideChannels(prisma) }));

/** Cross-channel guide grid over a forward window. */
api.get("/guide", async (c) => {
  const forwardMinutes = intParam(c.req.query("forwardMinutes"), 150, 30, 720);
  return c.json(await getGuideGrid(prisma, forwardMinutes));
});

/** The Plex-style quality ladder for the client's quality selector. */
api.get("/qualities", (c) => c.json({ qualities: qualityList() }));

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
  try {
    return c.json(
      await resolveMedia(prisma, c.req.param("id"), ratingKey, offsetSeconds, {
        quality: c.req.query("quality"),
        audioLang: c.req.query("audioLang"),
        subtitleLang: c.req.query("subtitleLang"),
        caps,
        deviceId: c.req.query("deviceId"),
        forceHls: c.req.query("forceHls") === "1",
      }),
    );
  } catch (err) {
    return onError(err);
  }
});

/** Record a tune's diagnostics to the DB (test log). */
api.post("/playback/log", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Parameters<typeof logPlayback>[2] | null;
  if (!body) return c.json({ error: "body required" }, 400);
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
