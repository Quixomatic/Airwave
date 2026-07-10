/**
 * Minimal Plex.tv API client for the "Sign in with Plex" + server-discovery
 * flow (the same handshake Overseerr uses). All calls send the invented
 * `X-Plex-*` headers; the token, when present, authenticates as the user.
 */

const PLEX_TV = "https://plex.tv/api/v2";
const PRODUCT = "ChannelGuide";
const VERSION = "0.0.10";

export function plexHeaders(clientId: string, token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Plex-Product": PRODUCT,
    "X-Plex-Version": VERSION,
    "X-Plex-Client-Identifier": clientId,
    "X-Plex-Device": "ChannelGuide Server",
    "X-Plex-Platform": "Web",
  };
  if (token) headers["X-Plex-Token"] = token;
  return headers;
}

/** Create an OAuth "pin" (id + code) to begin the sign-in handshake. */
export async function createPin(clientId: string): Promise<{ id: number; code: string }> {
  const res = await fetch(`${PLEX_TV}/pins?strong=true`, {
    method: "POST",
    headers: plexHeaders(clientId),
  });
  if (!res.ok) throw new Error(`Plex createPin failed (${res.status})`);
  const data = (await res.json()) as { id: number; code: string };
  return { id: data.id, code: data.code };
}

/** The hosted auth page the user is sent to (in a popup) to approve. */
export function buildAuthUrl(clientId: string, code: string, forwardUrl?: string): string {
  const params = new URLSearchParams({
    clientID: clientId,
    code,
    "context[device][product]": PRODUCT,
  });
  if (forwardUrl) params.set("forwardUrl", forwardUrl);
  return `https://app.plex.tv/auth#?${params.toString()}`;
}

/** Poll the pin; returns the auth token once the user has approved, else null. */
export async function getPinToken(clientId: string, id: number): Promise<string | null> {
  const res = await fetch(`${PLEX_TV}/pins/${id}`, { headers: plexHeaders(clientId) });
  if (!res.ok) throw new Error(`Plex getPin failed (${res.status})`);
  const data = (await res.json()) as { authToken: string | null };
  return data.authToken ?? null;
}

export type PlexUser = {
  id: number;
  uuid: string;
  email: string;
  username: string;
  thumb?: string;
};

/** The Plex account behind a token (email is what we match ChannelGuide accounts by). */
export async function getPlexUser(clientId: string, token: string): Promise<PlexUser> {
  const res = await fetch(`${PLEX_TV}/user`, { headers: plexHeaders(clientId, token) });
  if (!res.ok) throw new Error(`Plex getUser failed (${res.status})`);
  return (await res.json()) as PlexUser;
}

export type PlexConnection = {
  uri: string;
  address: string;
  port: number;
  protocol: string;
  local: boolean;
  relay: boolean;
};

export type PlexServer = {
  name: string;
  clientIdentifier: string;
  owned: boolean;
  connections: PlexConnection[];
};

/** The Plex Media Servers this token can reach (owned + shared). */
export async function getServers(clientId: string, token: string): Promise<PlexServer[]> {
  const res = await fetch(`${PLEX_TV}/resources?includeHttps=1&includeRelay=1`, {
    headers: plexHeaders(clientId, token),
  });
  if (!res.ok) throw new Error(`Plex getResources failed (${res.status})`);
  const data = (await res.json()) as Array<{
    provides: string;
    name: string;
    clientIdentifier: string;
    owned: boolean;
    connections?: PlexConnection[];
  }>;
  return data
    .filter((r) => r.provides?.split(",").includes("server"))
    .map((r) => ({
      name: r.name,
      clientIdentifier: r.clientIdentifier,
      owned: r.owned,
      connections: r.connections ?? [],
    }));
}
