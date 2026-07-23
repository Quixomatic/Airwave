import { getServerUrl, getToken } from "./auth";

/**
 * Thin client for ChannelGuide's REST surface — the same `/api/v1` (bearer) + custom Plex
 * device-link flow (`/api/tv/auth/plex/*`) that tv-web talks to. Ported from tv-web's `lib/api.ts`;
 * `fetch` is a global in React Native, so the request shape is identical — only the base URL + token
 * come from the native session store instead of localStorage.
 *
 * Screen-specific types (guide grid, media, packages) get ported here as each screen lands, so the
 * client grows exactly with what's wired up rather than all at once.
 */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${getServerUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/** Validate a candidate server address during onboarding (mirrors tv-web's setup check). */
export async function checkHealth(baseUrl: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: ctrl.signal });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return !!body?.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** A Plex artwork path via the server's public image proxy. Null when there's no path. */
export function imageUrl(channelId: string, path?: string | null, w?: number): string | null {
  if (!path) return null;
  const p = new URLSearchParams({ path });
  if (w) p.set("w", String(w));
  return `${getServerUrl()}/img/${channelId}?${p.toString()}`;
}

// --- Custom Plex device-link login (server flow, /api/tv/auth/plex/*) ---------

export type PlexStart = { pinId: number; code: string; verificationUrl: string; expiresIn: number };
export type PlexPoll =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "unregistered"; email: string }
  | { status: "ok"; token: string; user: { id: string; name: string | null; email: string; role: string | null } };

export const plexLink = {
  start: () => request<PlexStart>("/api/tv/auth/plex/start", { method: "POST", body: "{}" }),
  poll: (pinId: number) =>
    request<PlexPoll>("/api/tv/auth/plex/poll", { method: "POST", body: JSON.stringify({ pinId }) }),
};
