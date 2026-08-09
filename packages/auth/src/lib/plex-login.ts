import { env } from "@airwave/env/server";

/**
 * Minimal Plex helpers for the login handshake (kept in the auth package so the
 * genericOAuth `getToken`/`getUserInfo` hooks can use them without importing the
 * api package — which would be a dependency cycle). The richer client in
 * `@airwave/api` is used for the admin connection + user import.
 */

const PLEX_TV = "https://plex.tv/api/v2";

/**
 * Stable X-Plex-Client-Identifier for this Airwave install. Must be the
 * same value the authorize-proxy route uses when creating the pin, so it's
 * shared from here. Override with PLEX_CLIENT_IDENTIFIER in prod.
 */
export const PLEX_CLIENT_ID = env.PLEX_CLIENT_IDENTIFIER ?? "channelguide-server";

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json",
    "X-Plex-Product": "Airwave",
    "X-Plex-Version": "0.0.13",
    "X-Plex-Client-Identifier": PLEX_CLIENT_ID,
    "X-Plex-Device": "Airwave Server",
    "X-Plex-Platform": "Web",
  };
  if (token) h["X-Plex-Token"] = token;
  return h;
}

/**
 * Create a **link pin** for the TV device flow (`plex.tv/link`). Unlike the web
 * login's strong pin (a long code for the `app.plex.tv/auth` redirect), this is
 * a plain pin whose short 4-char `code` the user types at `plex.tv/link` against
 * their logged-in Plex account. Poll {@link getPinToken} until it returns a token.
 */
export async function createLinkPin(): Promise<{
  id: number;
  code: string;
  expiresIn: number;
}> {
  const res = await fetch(`${PLEX_TV}/pins`, { method: "POST", headers: headers() });
  if (!res.ok) throw new Error(`Plex createLinkPin failed (${res.status})`);
  const data = (await res.json()) as { id: number; code: string; expiresIn?: number };
  return { id: data.id, code: data.code, expiresIn: data.expiresIn ?? 1800 };
}

/** Fetch the auth token for a claimed pin (the pin id arrives as the OAuth `code`). */
export async function getPinToken(id: number): Promise<string | null> {
  const res = await fetch(`${PLEX_TV}/pins/${id}`, { headers: headers() });
  if (!res.ok) throw new Error(`Plex pin check failed (${res.status})`);
  const data = (await res.json()) as { authToken: string | null };
  return data.authToken ?? null;
}

export type PlexAccount = {
  id: number;
  email: string;
  username: string;
  thumb?: string;
};

/** The Plex account behind a token — email is what we match accounts by. */
export async function getPlexAccount(token: string): Promise<PlexAccount> {
  const res = await fetch(`${PLEX_TV}/user`, { headers: headers(token) });
  if (!res.ok) throw new Error(`Plex user fetch failed (${res.status})`);
  return (await res.json()) as PlexAccount;
}
