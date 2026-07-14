/**
 * Minimal Plex.tv API client for the "Sign in with Plex" + server-discovery
 * flow (the same handshake Overseerr uses). All calls send the invented
 * `X-Plex-*` headers; the token, when present, authenticates as the user.
 */

import { XMLParser } from "fast-xml-parser";

import { BROWSER_CLIENT_PROFILE, type ClientCaps, clientProfileExtra, qualityParams } from "./quality";

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
  showRatingKey?: string; // grandparentRatingKey — links an episode to its parent show
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
  grandparentRatingKey?: string | number;
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
    showRatingKey: m.grandparentRatingKey != null ? String(m.grandparentRatingKey) : undefined,
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

/** Every item of a given type in a section, paged through in full — for metadata sync. */
export async function getAllSectionItems(
  baseUrl: string,
  token: string,
  sectionKey: string,
  type: 1 | 2 | 4,
): Promise<PlexItem[]> {
  const pageSize = 500;
  const out: PlexItem[] = [];
  for (let start = 0; ; start += pageSize) {
    const qs = [
      `type=${type}`,
      "sort=titleSort",
      `X-Plex-Container-Start=${start}`,
      `X-Plex-Container-Size=${pageSize}`,
    ].join("&");
    const res = await fetch(`${baseUrl}/library/sections/${sectionKey}/all?${qs}`, {
      headers: pmsHeaders(token),
    });
    if (!res.ok) throw new Error(`Plex listing failed (${res.status})`);
    const data = (await res.json()) as {
      MediaContainer?: { totalSize?: number; size?: number; Metadata?: Array<PlexMetadata> };
    };
    const batch = data.MediaContainer?.Metadata ?? [];
    for (const m of batch) out.push(toPlexItem(m));
    const total = data.MediaContainer?.totalSize ?? out.length;
    if (batch.length < pageSize || out.length >= total) break;
  }
  return out;
}

/** The most-recently-added items of a type in a section (for the incremental scan). */
export async function getRecentlyAdded(
  baseUrl: string,
  token: string,
  sectionKey: string,
  type: 1 | 2 | 4,
  limit = 50,
): Promise<PlexItem[]> {
  const qs = [
    `type=${type}`,
    "sort=addedAt:desc",
    `X-Plex-Container-Start=0`,
    `X-Plex-Container-Size=${limit}`,
  ].join("&");
  const res = await fetch(`${baseUrl}/library/sections/${sectionKey}/all?${qs}`, {
    headers: pmsHeaders(token),
  });
  if (!res.ok) throw new Error(`Plex recently-added query failed (${res.status})`);
  const data = (await res.json()) as { MediaContainer?: { Metadata?: Array<PlexMetadata> } };
  return (data.MediaContainer?.Metadata ?? []).map(toPlexItem);
}

/** Full metadata for a single item by ratingKey (e.g. to backfill a missing parent show). */
export async function getMetadata(
  baseUrl: string,
  token: string,
  ratingKey: string,
): Promise<PlexItem | null> {
  const res = await fetch(`${baseUrl}/library/metadata/${ratingKey}`, {
    headers: pmsHeaders(token),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { MediaContainer?: { Metadata?: Array<PlexMetadata> } };
  const m = data.MediaContainer?.Metadata?.[0];
  return m ? toPlexItem(m) : null;
}

/**
 * How a client should play an item. `direct` streams the original file (the browser
 * seeks via `currentTime`); `hls` uses Plex's transcode-universal endpoint, which
 * applies the start `offset` server-side. Codec fields are for diagnostics.
 */
/** An available audio or subtitle track, keyed by language so it carries across episodes. */
export type PlaybackTrack = { lang: string; label: string };

export type PlaybackInfo = {
  mode: "direct" | "hls";
  url: string;
  /** The Plex transcode session id (hls only) — pass to {@link stopTranscode} on teardown. */
  session: string | null;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  /** Distinct audio / subtitle languages available on this item (for the pickers). */
  audioTracks: PlaybackTrack[];
  subtitleTracks: PlaybackTrack[];
};

/** Options that steer the transcode decision (any set → force a transcode). */
export type PlaybackOptions = {
  quality?: string;
  /** Preferred audio language (`languageCode`, e.g. "jpn"/"eng"). */
  audioLang?: string;
  /** Preferred subtitle language, or "off"/undefined for none. */
  subtitleLang?: string;
  /** The real client's decode capabilities (a TV) — drives direct-play/direct-stream
   * vs transcode + the Plex profile. Absent → the built-in browser assumption. */
  caps?: ClientCaps;
};

// Formats a browser can play from the original file (so we can direct-play + client-seek).
const DIRECT_CONTAINERS = new Set(["mp4", "mov", "m4v"]);
const DIRECT_VIDEO = new Set(["h264", "avc", "avc1"]);
const DIRECT_AUDIO = new Set(["aac", "mp3", "mp2", "mp4a"]);

type PlexStream = {
  id?: number | string;
  streamType?: number;
  language?: string;
  languageTag?: string;
  languageCode?: string;
  displayTitle?: string;
  extendedDisplayTitle?: string;
  forced?: number | boolean;
};

const streamLang = (s: PlexStream): string =>
  (s.languageCode || s.languageTag || "und").toLowerCase();
const streamLabel = (s: PlexStream): string =>
  s.language || s.extendedDisplayTitle || s.displayTitle || streamLang(s).toUpperCase();

/** Distinct languages present (first stream per language wins the label). */
function dedupeTracks(streams: PlexStream[]): PlaybackTrack[] {
  const out: PlaybackTrack[] = [];
  const seen = new Set<string>();
  for (const s of streams) {
    const lang = streamLang(s);
    if (seen.has(lang)) continue;
    seen.add(lang);
    out.push({ lang, label: streamLabel(s) });
  }
  return out;
}

/**
 * Resolve a playable URL for `ratingKey` at `offsetSeconds`, using the owner token.
 * Browser-friendly files direct-play (the client seeks to the offset); everything else
 * goes through Plex's HLS transcoder with the offset baked in. Returns null if the item
 * has no playable part.
 */
export async function getPlaybackInfo(
  baseUrl: string,
  token: string,
  clientId: string,
  ratingKey: string,
  offsetSeconds: number,
  opts: PlaybackOptions = {},
): Promise<PlaybackInfo | null> {
  const res = await fetch(`${baseUrl}/library/metadata/${ratingKey}`, {
    headers: pmsHeaders(token),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    MediaContainer?: {
      Metadata?: Array<{
        Media?: Array<{
          container?: string;
          videoCodec?: string;
          audioCodec?: string;
          Part?: Array<{ id?: number | string; key?: string; container?: string; Stream?: PlexStream[] }>;
        }>;
      }>;
    };
  };
  const media = data.MediaContainer?.Metadata?.[0]?.Media?.[0];
  const part = media?.Part?.[0];
  if (!part?.key) return null;

  const streams = part.Stream ?? [];
  const audioStreams = streams.filter((s) => s.streamType === 2);
  // Prefer non-forced subtitles (forced only shows foreign-dialogue snippets), so a
  // language maps to the full subtitle track and the picker labels it plainly.
  const subStreams = streams
    .filter((s) => s.streamType === 3)
    .sort((a, b) => (a.forced ? 1 : 0) - (b.forced ? 1 : 0));
  const audioTracks = dedupeTracks(audioStreams);
  const subtitleTracks = dedupeTracks(subStreams);

  const container = (media?.container ?? part.container ?? "").toLowerCase();
  const videoCodec = (media?.videoCodec ?? "").toLowerCase();
  const audioCodec = (media?.audioCodec ?? "").toLowerCase();

  // Map the requested audio/subtitle language to a concrete stream id on this item.
  const quality = qualityParams(opts.quality);
  const audioStreamId = opts.audioLang
    ? audioStreams.find((s) => streamLang(s) === opts.audioLang)?.id
    : undefined;
  const wantsSubs = !!opts.subtitleLang && opts.subtitleLang !== "off";
  const subStreamId = wantsSubs
    ? subStreams.find((s) => streamLang(s) === opts.subtitleLang)?.id
    : undefined;

  // Device-aware capability check: use the real client's codec support when it reports
  // it (a TV), else the built-in browser assumption (h264/aac/mp4 — the admin preview).
  const caps = opts.caps;
  const vOk = (c: string) => (caps ? caps.videoCodecs.includes(c) : DIRECT_VIDEO.has(c));
  const aOk = (c: string) => (caps ? caps.audioCodecs.includes(c) : DIRECT_AUDIO.has(c));
  const cOk = (c: string) => (caps ? caps.directContainers.includes(c) : DIRECT_CONTAINERS.has(c));

  // Quality cap, an audio-track switch, or burned subtitles all force a transcode;
  // otherwise a file the client can play natively direct-plays (client seeks to the offset).
  const canDirect =
    !quality &&
    audioStreamId == null &&
    subStreamId == null &&
    cOk(container) &&
    vOk(videoCodec) &&
    aOk(audioCodec);

  if (canDirect) {
    const url = `${baseUrl}${part.key}?X-Plex-Token=${encodeURIComponent(token)}`;
    return {
      mode: "direct",
      url,
      session: null,
      container,
      videoCodec,
      audioCodec,
      audioTracks,
      subtitleTracks,
    };
  }

  // HLS transcode — Plex applies `offset` server-side, so playback starts there. A
  // *unique* session id (per resolve) lets us stop this exact transcode on teardown
  // without ever colliding with a freshly-started one for the same item/offset.
  const session = `channelguide-${ratingKey}-${crypto.randomUUID().slice(0, 8)}`;
  const params = new URLSearchParams({
    path: `/library/metadata/${ratingKey}`,
    mediaIndex: "0",
    partIndex: "0",
    protocol: "hls",
    fastSeek: "1",
    offset: String(Math.max(0, Math.floor(offsetSeconds))),
    directPlay: "0",
    directStream: "1",
    subtitles: "none",
    hasMDE: "1",
    // `session` is what the (undocumented) universal/stop endpoint keys on;
    // `X-Plex-Session-Identifier` is the spec's canonical field. Real clients send both.
    session,
    "X-Plex-Session-Identifier": session,
    "X-Plex-Client-Identifier": clientId,
    "X-Plex-Token": token,
    "X-Plex-Product": PRODUCT,
    "X-Plex-Platform": "Web",
  });
  // Quality cap (the Plex "Quality" ladder). Only applied when a preset is chosen, so
  // the uncapped transcode path is unchanged.
  if (quality) {
    params.set("maxVideoBitrate", quality.maxVideoBitrate);
    params.set("videoResolution", quality.videoResolution);
    params.set("videoQuality", quality.videoQuality);
    params.set("autoAdjustQuality", "0");
  }
  // Advertise the client's real capabilities. With a TV's caps, Plex copies (direct-streams)
  // the codecs it can and packages HLS as **fMP4** (HEVC-in-mpegts is undecodable by MSE →
  // the C2 "could not be decoded"). Platform MUST be Generic — real names 400 on /decision
  // with custom transcode targets (plezy). Without caps, the browser profile (quality path).
  if (caps) {
    params.set("X-Plex-Client-Profile-Extra", clientProfileExtra(caps));
    params.set("X-Plex-Platform", "Generic");
  } else if (quality) {
    params.set("X-Plex-Client-Profile-Extra", BROWSER_CLIENT_PROFILE);
  }
  // Audio track switch (e.g. Japanese → English dub).
  if (audioStreamId != null) params.set("audioStreamID", String(audioStreamId));

  // Burned-in subtitles — the universal recipe, works for TEXT (srt) AND IMAGE (pgs/vobsub).
  // Plex's URL `subtitleStreamID` is honored inconsistently per codec (srt burns via burn,
  // pgs only via auto, etc.), so we select the sub the reliable way: a **server-side PUT**
  // on the part. Then `subtitles=burn` + `directStream=0` re-encodes the video with the sub
  // painted in — renders in any player. Verified live: srt + pgs both → subtitleDecision=burn.
  // NB: the PUT-select is per-part *global* Plex state (all viewers of that item share it) —
  // fine for the single-admin preview; revisit for true multi-user. See .docs/plex-subtitles-findings.md.
  const partId = String(part.id ?? (part.key ?? "").split("/")[3] ?? "");
  if (subStreamId != null && partId) {
    await fetch(`${baseUrl}/library/parts/${partId}?subtitleStreamID=${subStreamId}&allParts=1`, {
      method: "PUT",
      headers: pmsHeaders(token),
    }).catch(() => {});
    params.set("subtitles", "burn");
    params.set("directStream", "0");
  } else if (opts.subtitleLang === "off" && partId) {
    // Explicitly off — clear any prior server-side selection so nothing burns.
    await fetch(`${baseUrl}/library/parts/${partId}?subtitleStreamID=0&allParts=1`, {
      method: "PUT",
      headers: pmsHeaders(token),
    }).catch(() => {});
  }
  const qs = params.toString();

  // **Register the transcode with Plex's decision endpoint first.** This is the
  // documented two-step flow (decision → start): without it, `start.m3u8` 400s for any
  // media that needs a real transcode decision (e.g. an mkv/DTS movie at a non-trivial
  // offset). Same session/params so `start` picks up the negotiated session.
  try {
    const decision = await fetch(
      `${baseUrl}/video/:/transcode/universal/decision?${qs}`,
      { headers: pmsHeaders(token) },
    );
    if (!decision.ok) {
      console.warn(`[plex] transcode decision ${decision.status} for ratingKey ${ratingKey}`);
    }
  } catch (err) {
    console.warn(`[plex] transcode decision failed for ratingKey ${ratingKey}:`, err);
  }

  const url = `${baseUrl}/video/:/transcode/universal/start.m3u8?${qs}`;
  return { mode: "hls", url, session, container, videoCodec, audioCodec, audioTracks, subtitleTracks };
}

/** Stop a Plex transcode session (so behind-the-scenes transcodes don't pile up). */
export async function stopTranscode(
  baseUrl: string,
  token: string,
  clientId: string,
  session: string,
): Promise<void> {
  const params = new URLSearchParams({
    session,
    "X-Plex-Client-Identifier": clientId,
    "X-Plex-Token": token,
  });
  try {
    await fetch(`${baseUrl}/video/:/transcode/universal/stop?${params.toString()}`, {
      headers: pmsHeaders(token),
    });
  } catch {
    // Best-effort — a failed stop just lets Plex time the session out on its own.
  }
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
