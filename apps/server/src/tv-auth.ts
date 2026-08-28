import { pollPlexLink, startPlexLink } from "@airwave/api/services/auth/tv-plex-link";
import { passwordLogin } from "@airwave/api/services/auth/tv-password-link";
import prisma from "@airwave/db";
import { Hono } from "hono";

/**
 * TV device-code login endpoints (Plex `plex.tv/link` flow). Mounted at
 * `/api/tv/auth` — UNAUTHENTICATED, because these *establish* the session the
 * TV then carries as a bearer token to `/api/v1`. See
 * `@airwave/api/services/auth/tv-plex-link`.
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

/**
 * On-device email/password sign-in (Roku — the Channel Store forbids off-device flows). Returns the same
 * bearer the Plex/device-code flows do, in the body. A generic `invalid` (401) for any auth failure so the
 * response can't enumerate accounts; a real fault answers 502.
 */
tvAuth.post("/password", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return c.json({ status: "invalid", error: "Email and password are required." }, 400);

  try {
    const result = await passwordLogin(email, password);
    if (result.status === "invalid") {
      return c.json({ status: "invalid", error: "Invalid email or password." }, 401);
    }
    return c.json(result);
  } catch (err) {
    console.error("[tv-auth] password login failed:", err);
    return c.json({ error: "Could not sign in." }, 502);
  }
});

export const tvAuthApi = tvAuth;
