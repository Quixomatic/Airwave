import { auth } from "@ChannelGuide/auth";
import { createLinkPin, getPinToken, getPlexAccount } from "@ChannelGuide/auth/lib/plex-login";
import type { PrismaClient } from "@ChannelGuide/db";

/**
 * TV device-code login via Plex's own PIN flow (`plex.tv/link`).
 *
 * Reuses the EXACT identity path of the web "Sign in with Plex" (genericOAuth):
 * a Plex pin → the user's Plex token → their Plex account email → match an
 * EXISTING ChannelGuide account (login-only; provisioning is via Import Plex
 * Users). The only difference from the web flow is acquisition: instead of a
 * browser redirect to `app.plex.tv/auth`, the TV shows a short code the user
 * enters at `plex.tv/link`, and the TV polls for the token.
 *
 * On success we mint a better-auth session server-side and hand its token back;
 * the TV carries it as `Authorization: Bearer <token>` (the `bearer` plugin) on
 * every `/api/v1` call. We do NOT use the RFC-8628 `deviceAuthorization` plugin
 * for this — Plex's device PIN replaces it.
 */

/** Begin a device link: returns the code to show + where the user enters it. */
export async function startPlexLink() {
  const { id, code, expiresIn } = await createLinkPin();
  return { pinId: id, code, verificationUrl: "https://plex.tv/link", expiresIn };
}

export type PollResult =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "unregistered"; email: string }
  | {
      status: "ok";
      token: string;
      user: { id: string; name: string | null; email: string; role: string | null };
    };

/**
 * Poll a pending link. `pending` until the user approves at plex.tv/link;
 * `expired` if the pin lapsed; `unregistered` if the Plex email has no
 * ChannelGuide account (login-only); `ok` with a session bearer token otherwise.
 */
export async function pollPlexLink(prisma: PrismaClient, pinId: number): Promise<PollResult> {
  let token: string | null;
  try {
    token = await getPinToken(pinId);
  } catch {
    // Plex 404s an expired/unknown pin — treat as expired so the client restarts.
    return { status: "expired" };
  }
  if (!token) return { status: "pending" };

  const account = await getPlexAccount(token);
  const user = await prisma.user.findUnique({ where: { email: account.email } });
  if (!user) return { status: "unregistered", email: account.email };

  // Mint a session for the matched user (parallels what genericOAuth does after
  // its redirect callback). The session token is the bearer credential.
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(user.id);
  if (!session) return { status: "expired" };

  return {
    status: "ok",
    token: session.token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: (user as { role?: string | null }).role ?? null,
    },
  };
}
