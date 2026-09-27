import type { Context, Next } from "hono";

import { auth } from "@airwave/auth";
import prisma from "@airwave/db";

/** Request-scoped vars the public API's key auth sets for downstream handlers. */
export type PublicVars = { userId: string; isAdmin: boolean };

/**
 * Public API auth. Accepts the same `airwave_` API key minted on Settings → API Keys (the one MCP uses),
 * as EITHER `X-API-Key: <key>` or `Authorization: Bearer <key>`. Verified via better-auth; resolves the
 * owning user and whether they're an admin. (Admin keys see everything; non-admin keys are access-scoped
 * per §7.13 — enforced by the individual endpoints.)
 *
 * The bearer *plugin* is for session tokens, not API keys, so we extract the key ourselves and call
 * `verifyApiKey` directly — predictable, and it supports both header styles from one code path.
 */
export async function apiKeyAuth(c: Context<{ Variables: PublicVars }>, next: Next) {
  const raw = c.req.header("x-api-key") ?? c.req.header("authorization") ?? "";
  const key = raw.replace(/^Bearer\s+/i, "").trim();
  if (!key) {
    return c.json(
      { error: { code: "unauthorized", message: "API key required (send X-API-Key or Authorization: Bearer)." } },
      401,
    );
  }
  const res = await auth.api.verifyApiKey({ body: { key } });
  // better-auth 1.6 carries the owning user in `referenceId`.
  const userId = res.valid ? (res.key as { referenceId?: string } | null)?.referenceId : undefined;
  if (!userId) {
    return c.json({ error: { code: "unauthorized", message: "Invalid or revoked API key." } }, 401);
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  c.set("userId", userId);
  c.set("isAdmin", user?.role === "admin");
  return next();
}
