/**
 * Minimal Plex.tv API client for the "Sign in with Plex" + server-discovery
 * flow (the same handshake Overseerr uses). All calls send the invented
 * `X-Plex-*` headers; the token, when present, authenticates as the user.
 */

import { XMLParser } from "fast-xml-parser";

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

export type PlexSharedUser = {
  plexId: string;
  email: string | null;
  username: string;
  thumb?: string;
};

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

/**
 * The users the owner has shared this specific server with. Uses the classic
 * `plex.tv/api/users` XML endpoint (same as Overseerr/Tautulli): each <User> has
 * nested <Server> elements listing the servers they can reach — filter by ours.
 */
export async function getSharedUsers(
  clientId: string,
  token: string,
  machineIdentifier: string,
): Promise<PlexSharedUser[]> {
  const res = await fetch("https://plex.tv/api/users", {
    headers: plexHeaders(clientId, token),
  });
  if (!res.ok) throw new Error(`Plex getUsers failed (${res.status})`);
  const parsed = xml.parse(await res.text()) as {
    MediaContainer?: { User?: unknown };
  };
  const raw = parsed.MediaContainer?.User;
  const users = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<{
    id?: string;
    email?: string;
    username?: string;
    title?: string;
    thumb?: string;
    Server?: unknown;
  }>;

  const hasAccess = (u: { Server?: unknown }) => {
    const servers = (Array.isArray(u.Server) ? u.Server : u.Server ? [u.Server] : []) as Array<{
      machineIdentifier?: string;
    }>;
    return servers.some((s) => s.machineIdentifier === machineIdentifier);
  };

  return users.filter(hasAccess).map((u) => ({
    plexId: String(u.id ?? ""),
    email: u.email ?? null,
    username: u.username || u.title || u.email || "Plex user",
    thumb: u.thumb,
  }));
}

// ── Plex Media Server (the connected server itself, not plex.tv) ──────────

function pmsHeaders(token: string): Record<string, string> {
  return { Accept: "application/json", "X-Plex-Token": token };
}

export type PlexLibrary = {
  key: string;
  title: string;
  type: string; // "movie" | "show" | "artist" | "photo" | …
};

/** The libraries (sections) on the connected server. */
export async function getLibraries(baseUrl: string, token: string): Promise<PlexLibrary[]> {
  const res = await fetch(`${baseUrl}/library/sections`, { headers: pmsHeaders(token) });
  if (!res.ok) throw new Error(`Plex libraries failed (${res.status})`);
  const data = (await res.json()) as {
    MediaContainer?: { Directory?: Array<{ key: string; title: string; type: string }> };
  };
  return (data.MediaContainer?.Directory ?? []).map((d) => ({
    key: d.key,
    title: d.title,
    type: d.type,
  }));
}

export type PlexTag = { id: string; title: string };

/** The genres available in a section (for building genre filters). */
export async function getSectionGenres(
  baseUrl: string,
  token: string,
  sectionKey: string,
): Promise<PlexTag[]> {
  const res = await fetch(`${baseUrl}/library/sections/${sectionKey}/genre`, {
    headers: pmsHeaders(token),
  });
  if (!res.ok) throw new Error(`Plex genres failed (${res.status})`);
  const data = (await res.json()) as {
    MediaContainer?: { Directory?: Array<{ key: string; title: string }> };
  };
  return (data.MediaContainer?.Directory ?? []).map((d) => ({ id: d.key, title: d.title }));
}

/**
 * The denormalized display bundle stored on each schedule slot (`guideData`) — what a
 * guide/preview renders without a second round-trip to the media server.
 */
export type GuideMeta = {
  title: string;
  type?: string; // "movie" | "episode" | "show"
  year?: number;
  contentRating?: string; // "PG-13"
  summary?: string;
  tagline?: string;
  studio?: string;
  directors?: string[];
  genres?: string[];
  cast?: string[];
  audienceRating?: number; // 0–10 (Plex scale)
  criticRating?: number; // 0–10
  durationMs?: number;
  thumb?: string; // relative Plex path (needs baseUrl + token to fetch)
  art?: string;
  // media badges
  resolution?: string; // "4k" | "1080" | "720" | "sd"
  audioChannels?: number; // 6 → 5.1, 8 → 7.1
  // episode context
  showTitle?: string; // grandparentTitle
  season?: number;
  episode?: number;
};

export type PlexItem = {
  ratingKey: string;
  title: string;
  durationMs: number;
  year?: number;
  originallyAvailableAt?: string;
  /** Full denormalized metadata for the guide. */
  guide: GuideMeta;
};

type PlexTagRef = { tag?: string };
type PlexMetadata = {
  ratingKey: string | number;
  title: string;
  type?: string;
  duration?: number;
  year?: number;
  originallyAvailableAt?: string;
  contentRating?: string;
  summary?: string;
  tagline?: string;
  studio?: string;
  rating?: number;
  audienceRating?: number;
  thumb?: string;
  art?: string;
  grandparentTitle?: string;
  parentIndex?: number;
  index?: number;
  Director?: PlexTagRef[];
  Genre?: PlexTagRef[];
  Role?: PlexTagRef[];
  Media?: Array<{ videoResolution?: string; audioChannels?: number }>;
};

const tags = (arr: PlexTagRef[] | undefined, max: number): string[] | undefined => {
  if (!arr?.length) return undefined;
  const out = arr.map((t) => t.tag).filter((t): t is string => !!t).slice(0, max);
  return out.length ? out : undefined;
};

function toGuideMeta(m: PlexMetadata): GuideMeta {
  const media = m.Media?.[0];
  return {
    title: m.title,
    type: m.type,
    year: m.year,
    contentRating: m.contentRating,
    summary: m.summary,
    tagline: m.tagline,
    studio: m.studio,
    directors: tags(m.Director, 3),
    genres: tags(m.Genre, 5),
    cast: tags(m.Role, 5),
    audienceRating: m.audienceRating,
    criticRating: m.rating,
    durationMs: m.duration ?? 0,
    thumb: m.thumb,
    art: m.art,
    resolution: media?.videoResolution,
    audioChannels: media?.audioChannels,
    showTitle: m.grandparentTitle,
    season: m.parentIndex,
    episode: m.index,
  };
}

function toPlexItem(m: PlexMetadata): PlexItem {
  return {
    ratingKey: String(m.ratingKey),
    title: m.title,
    durationMs: m.duration ?? 0,
    year: m.year,
    originallyAvailableAt: m.originallyAvailableAt,
    guide: toGuideMeta(m),
  };
}

export type SectionQuery = {
  type: 1 | 2 | 4; // 1=movie, 2=show, 4=episode
  genreId?: string;
  unwatched?: boolean;
  sort?: string;
  limit?: number;
};

/** Resolve a section's items against a filter — the channel candidate pool. */
export async function getSectionItems(
  baseUrl: string,
  token: string,
  sectionKey: string,
  q: SectionQuery,
): Promise<PlexItem[]> {
  const params = new URLSearchParams({
    type: String(q.type),
    sort: q.sort ?? "titleSort",
    "X-Plex-Container-Size": String(q.limit ?? 500),
  });
  if (q.genreId) params.set("genre", q.genreId);
  if (q.unwatched) params.set("unwatched", "1");
  const res = await fetch(`${baseUrl}/library/sections/${sectionKey}/all?${params.toString()}`, {
    headers: pmsHeaders(token),
  });
  if (!res.ok) throw new Error(`Plex items failed (${res.status})`);
  const data = (await res.json()) as {
    MediaContainer?: {
      Metadata?: Array<PlexMetadata>;
    };
  };
  return (data.MediaContainer?.Metadata ?? []).map(toPlexItem);
}

/**
 * Filtered query with raw Plex filter params (`field=value`, `year>=1990`, …).
 * Operators are sent literally; only values should be pre-encoded by the caller.
 */
export async function getSectionItemsRaw(
  baseUrl: string,
  token: string,
  sectionKey: string,
  type: 1 | 2 | 4,
  filterParams: string[],
  sort = "titleSort",
  limit = 800,
): Promise<PlexItem[]> {
  const qs = [
    `type=${type}`,
    `sort=${encodeURIComponent(sort)}`,
    `X-Plex-Container-Size=${limit}`,
    ...filterParams,
  ].join("&");
  const res = await fetch(`${baseUrl}/library/sections/${sectionKey}/all?${qs}`, {
    headers: pmsHeaders(token),
  });
  if (!res.ok) throw new Error(`Plex filtered query failed (${res.status})`);
  const data = (await res.json()) as {
    MediaContainer?: {
      Metadata?: Array<PlexMetadata>;
    };
  };
  return (data.MediaContainer?.Metadata ?? []).map(toPlexItem);
}

/** Available values for a tag filter field (genre/studio/director/actor/…). */
export async function getFilterValues(
  baseUrl: string,
  token: string,
  sectionKey: string,
  field: string,
): Promise<PlexTag[]> {
  const res = await fetch(`${baseUrl}/library/sections/${sectionKey}/${field}`, {
    headers: pmsHeaders(token),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    MediaContainer?: { Directory?: Array<{ key: string; title: string }> };
  };
  return (data.MediaContainer?.Directory ?? []).map((d) => ({ id: d.key, title: d.title }));
}
