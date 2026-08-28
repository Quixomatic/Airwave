import { auth } from "@airwave/auth";

/**
 * TV on-device email/password login → a bearer token.
 *
 * The Roku Channel Store forbids off-device sign-in flows (our Plex-PIN and
 * better-auth device-code flows both finish in a browser on a second device),
 * so Roku needs a fully on-device path: the user types their Airwave email +
 * password on the TV, and we hand back the same bearer the other TV flows
 * produce. See `.plans/roku.md` Phase 13.
 *
 * We deliberately return the token in the JSON BODY (parallel to
 * `tv-plex-link.ts` `pollPlexLink`), so the Roku client's existing
 * `finishLogin(body.token)` path is reused with no changes to its HTTP layer.
 * The token itself comes from better-auth's `bearer` plugin, which sets it in
 * the `set-auth-token` response header on every sign-in (the same header the
 * tv-web / tv-tauri clients read). Password verification, hashing, and rate
 * limiting are all better-auth's — we never touch the password beyond passing
 * it straight to `signInEmail`.
 */

export type PasswordLoginResult =
  | {
      status: "ok";
      token: string;
      user: { id: string; name: string | null; email: string; role: string | null };
    }
  | { status: "invalid" };

/**
 * Verify email + password and mint a bearer session. Returns `invalid` for any
 * auth failure (wrong email OR wrong password OR disabled OR rate-limited) —
 * one generic outcome, so the response can't be used to enumerate accounts.
 * Genuine infrastructure faults (e.g. the DB is down) propagate so the route
 * can answer 502 instead of masquerading as bad credentials.
 */
export async function passwordLogin(email: string, password: string): Promise<PasswordLoginResult> {
  const e = email.trim();
  if (!e || !password) return { status: "invalid" };

  try {
    const { headers, response } = await auth.api.signInEmail({
      body: { email: e, password },
      returnHeaders: true,
    });
    // The bearer plugin returns the session token here (matches the web/tv clients).
    const token = headers.get("set-auth-token");
    if (!token) return { status: "invalid" };

    const u = response.user as { id: string; name?: string | null; email: string; role?: string | null };
    return {
      status: "ok",
      token,
      user: { id: u.id, name: u.name ?? null, email: u.email, role: u.role ?? null },
    };
  } catch (err) {
    // better-auth throws an APIError (carries a `status` + `body`) for every auth-flow failure — bad
    // credentials, a disabled user, a rate-limit. Collapse them all to a generic `invalid`. A non-APIError
    // (a plain Error — e.g. a DB outage) is a real server fault, so rethrow it for the route to surface as 502.
    if (err && typeof err === "object" && "status" in err && "body" in err) {
      return { status: "invalid" };
    }
    throw err;
  }
}
