import { pollPlexLink, startPlexLink } from "@ChannelGuide/api/services/auth/tv-plex-link";
import prisma from "@ChannelGuide/db";
import { Hono } from "hono";

/**
 * TV device-code login endpoints (Plex `plex.tv/link` flow). Mounted at
 * `/api/tv/auth` — UNAUTHENTICATED, because these *establish* the session the
 * TV then carries as a bearer token to `/api/v1`. See
 * `@ChannelGuide/api/services/auth/tv-plex-link`.
 */
const tvAuth = new Hono();

/** Start a link: show `code` and tell the user to visit `verificationUrl`. */
tvAuth.post("/plex/start", async (c) => {
  try {
    return c.json(await startPlexLink());
  } catch (err) {
    console.error("[tv-auth] start failed:", err);
    return c.json({ error: "Could not start Plex link." }, 502);
  }
});

/** Poll a link by `pinId` until the user approves at plex.tv/link. */
tvAuth.post("/plex/poll", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { pinId?: number } | null;
  const pinId = typeof body?.pinId === "number" ? body.pinId : Number(body?.pinId);
  if (!Number.isFinite(pinId)) return c.json({ error: "pinId is required" }, 400);

  try {
    const result = await pollPlexLink(prisma, pinId);
    // `unregistered` is a real (403) outcome; everything else is 200 with a status.
    if (result.status === "unregistered") return c.json(result, 403);
    return c.json(result);
  } catch (err) {
    console.error("[tv-auth] poll failed:", err);
    return c.json({ error: "Could not check Plex link." }, 502);
  }
});

export const tvAuthApi = tvAuth;
