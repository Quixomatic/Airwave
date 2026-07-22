/**
 * Minimal Plex.tv API client for the "Sign in with Plex" + server-discovery
 * flow (the same handshake Overseerr uses). All calls send the invented
 * `X-Plex-*` headers; the token, when present, authenticates as the user.
 */

import { XMLParser } from "fast-xml-parser";

import { BROWSER_CLIENT_PROFILE, type ClientCaps, clientProfileExtra, qualityParams } from "./quality";
import { canonicalAudioCodec, canonicalContainer, canonicalVideoCodec } from "../capabilities/codecs";

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

export type ConnectionUrls = {
  remoteUrl: string | null;
  relayUrl: string | null;
};

/**
 * The OFF-network Plex connection URIs. The ChannelGuide server always runs alongside Plex, so
 * the stored `baseUrl` already IS the local URL and the server uses it for everything — only a
 * TV app that's away from home needs these, to fall back to when it can't reach `baseUrl` on the
 * LAN: remoteUrl (WAN) then relayUrl (last resort). With `includeHttps=1` each `uri` is the HTTPS
 * `plex.direct` form, so prefer https (mixed-content-safe for an HTTPS client).
 */
export function pickConnectionUrls(connections: PlexConnection[]): ConnectionUrls {
  const https = connections.filter((c) => c.protocol === "https");
  const pool = https.length ? https : connections;
  return {
    remoteUrl: pool.find((c) => !c.local && !c.relay)?.uri ?? null,
    relayUrl: pool.find((c) => c.relay)?.uri ?? null,
  };
}

/**
 * Fetch the CURRENT off-network connection URIs for one server (matched by clientIdentifier /
 * `machineIdentifier`). plex.tv's `/resources` always reflects the present state — the PMS
 * re-publishes on WAN-IP change — so this is how we keep the remote URL fresh. Returns null if
 * the token can no longer reach that server.
 */
export async function resolveConnectionUrls(
  clientId: string,
  token: string,
  machineIdentifier: string,
): Promise<ConnectionUrls | null> {
  const servers = await getServers(clientId, token);
  const server = servers.find((s) => s.clientIdentifier === machineIdentifier);
  if (!server) return null;
  return pickConnectionUrls(server.connections);
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
  addedAt?: string; // ISO — when the file was added to the library (recency / "New")
  // media badges
  resolution?: string; // "4k" | "1080" | "720" | "sd"
  audioChannels?: number; // 6 → 5.1, 8 → 7.1
  hdr?: string; // "HDR10" | "Dolby Vision" | "HLG" when the video is HDR, else undefined (SDR)
  dynamicAudio?: string; // "Atmos" | "DTS:X" object/next-gen audio, else undefined
  videoCodec?: string; // "hevc" | "h264" | "av1" — for badges / diagnostics
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
  Media?: PlexMedia[];
  addedAt?: number; // epoch seconds the item was added to the library
};

/** A file's Media element. The video/audio Streams (and thus HDR / object-audio detection) are
 *  only present when the listing is fetched with `includeElements=Stream`. */
type PlexMedia = {
  videoResolution?: string;
  videoCodec?: string;
  audioChannels?: number;
  Part?: Array<{ Stream?: PlexStreamLite[] }>;
};
type PlexStreamLite = {
  streamType?: number; // 1=video, 2=audio, 3=subtitle
  codec?: string;
  channels?: number;
  colorTrc?: string;
  DOVIPresent?: boolean | number;
  title?: string;
  displayTitle?: string;
  extendedDisplayTitle?: string;
};

/** The HDR type of a Media's video stream, or undefined for SDR. HDR lives on the STREAM
 *  (`colorTrc` = PQ/HLG transfer, or the Dolby-Vision flag), NOT the Media element — so this
 *  is only populated when the listing was fetched with `includeElements=Stream`. */
function detectHdr(media: PlexMedia | undefined): string | undefined {
  const vs = media?.Part?.[0]?.Stream?.find((s) => s.streamType === 1);
  if (!vs) return undefined;
  if (vs.DOVIPresent === 1 || vs.DOVIPresent === true) return "Dolby Vision";
  const trc = (vs.colorTrc ?? "").toLowerCase();
  if (trc === "smpte2084") return "HDR10"; // PQ
  if (trc === "arib-std-b67") return "HLG";
  return undefined;
}

/** Object-based / next-gen audio (Dolby Atmos, DTS:X) if any audio stream carries it — Plex
 *  labels them in the stream title (e.g. "Atmos (English TRUEHD 7.1)"). Only with
 *  `includeElements=Stream`. Undefined for plain channel-based audio. */
function detectDynamicAudio(media: PlexMedia | undefined): string | undefined {
  const audio = media?.Part?.[0]?.Stream?.filter((s) => s.streamType === 2) ?? [];
  for (const s of audio) {
    const t = `${s.extendedDisplayTitle ?? ""} ${s.displayTitle ?? ""} ${s.title ?? ""}`.toLowerCase();
    if (t.includes("atmos")) return "Atmos";
    if (t.includes("dts:x") || t.includes("dts-x") || t.includes("dtsx")) return "DTS:X";
  }
  return undefined;
}

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
    addedAt: m.addedAt ? new Date(m.addedAt * 1000).toISOString() : undefined,
    resolution: media?.videoResolution,
    audioChannels: media?.audioChannels,
    hdr: detectHdr(media),
    dynamicAudio: detectDynamicAudio(media),
    videoCodec: media?.videoCodec,
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
  // Pull per-file streams inline (HDR / object-audio). NOT for shows (type 2) — they're
  // containers with no streams and Plex 500s on `includeElements=Stream` for them.
  if (q.type !== 2) params.set("includeElements", "Stream");
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
    // per-file streams inline (HDR / object-audio); not for shows (type 2 → Plex 500s, no streams)
    ...(type === 2 ? [] : ["includeElements=Stream"]),
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
      // per-file streams inline (HDR / object-audio) — bulk, no per-item calls; NOT for shows
      // (type 2): they're containers with no streams and Plex 500s on includeElements=Stream.
      ...(type === 2 ? [] : ["includeElements=Stream"]),
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
    // per-file streams inline (HDR / object-audio); not for shows (type 2 → Plex 500s, no streams)
    ...(type === 2 ? [] : ["includeElements=Stream"]),
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
/** One available audio or subtitle track. `id` is the Plex stream id — the client selects
 *  the EXACT track by id (multiple same-language tracks — 5.1 / stereo / commentary — are
 *  distinct), not by language. */
export type PlaybackTrack = { id: string; lang: string; label: string };

export type PlaybackInfo = {
  /** `direct` = raw file, native `<video>`, client seeks to the offset.
   *  `http`   = progressive transcode, native `<video>`, offset baked in server-side.
   *  `hls`    = hls.js/MSE transcode — the true last resort (only when native fails). */
  mode: "direct" | "http" | "hls";
  url: string;
  /** The Plex transcode session id (hls only) — pass to {@link stopTranscode} on teardown. */
  session: string | null;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  /** Distinct audio / subtitle languages available on this item (for the pickers). */
  audioTracks: PlaybackTrack[];
  subtitleTracks: PlaybackTrack[];
  /** DIRECT-PLAY with a client-side audio switch. Set when the file's DEFAULT audio is
   *  undecodable (DTS/TrueHD/ALAC) but a decodable companion track exists, so we direct-play
   *  the raw file anyway (no transcode) and the client selects this track on load. A raw-file
   *  direct-play serves the file as-is (Plex's selected-stream state doesn't ride along), and
   *  the browser's AudioTrack API exposes no codec — so the server names the track. `audioIndex`
   *  is the 0-based index AMONG audio tracks in file order (the only handle both sides share). */
  directAudio?: {
    streamId: string;
    audioIndex: number;
    lang: string;
    label: string;
    codec: string;
  };
  /** What Plex's /decision actually chose (hls only) — for the debug overlay. */
  decision?: {
    videoDecision?: string; // "copy" | "transcode" | "directplay"
    audioDecision?: string;
    videoCodec?: string; // output codec
    audioCodec?: string; // output codec
    container?: string; // output container (mp4 = fMP4/CMAF, mpegts, …)
  };
};

/** Options that steer the transcode decision (any set → force a transcode). */
export type PlaybackOptions = {
  quality?: string;
  /** The audio stream id to select (from `PlaybackTrack.id`). A selection forces a transcode. */
  audioStreamId?: string;
  /** The subtitle stream id to burn, "off" to clear, or undefined for none. */
  subtitleStreamId?: string;
  /** The real client's decode capabilities (a TV) — drives direct-play/direct-stream
   * vs transcode + the Plex profile. Absent → the built-in browser assumption. */
  caps?: ClientCaps;
  /** Force the hls.js/MSE path (skip raw-file direct-play AND progressive-http). The
   * client sets this only after a NATIVE attempt errored at runtime — the last-resort
   * rung of the native-first ladder. */
  forceHls?: boolean;
  /** The base URL to STAMP onto the returned playback URL (what the client streams from).
   * The server's own Plex fetches always use `baseUrl` (it's on the LAN); this only changes
   * the base the CLIENT hits — set to the source's remote/relay URL for an off-network TV.
   * Defaults to `baseUrl`. See broker.resolveMedia + [[remote-playback]]. */
  clientBaseUrl?: string;
};

// Formats a browser can play from the original file (so we can direct-play + client-seek).
const DIRECT_CONTAINERS = new Set(["mp4", "mov", "m4v"]);
const DIRECT_VIDEO = new Set(["h264", "avc", "avc1"]);
const DIRECT_AUDIO = new Set(["aac", "mp3", "mp2", "mp4a"]);
// Codec-name canonicalization lives in one place (capabilities/codecs.ts), shared with the
// capability side, so a direct-playable stream isn't sent to transcode over a naming gap.

type PlexStream = {
  id?: number | string;
  streamType?: number;
  language?: string;
  languageTag?: string;
  languageCode?: string;
  displayTitle?: string;
  extendedDisplayTitle?: string;
  codec?: string;
  channels?: number;
  title?: string;
  forced?: number | boolean;
};

const streamLang = (s: PlexStream): string =>
  (s.languageCode || s.languageTag || "und").toLowerCase();

// A rich, per-stream label so multiple same-language tracks are distinguishable (5.1 vs
// stereo vs commentary). Plex's `extendedDisplayTitle` already reads like "English (DTS 5.1)"
// or "Commentary - English (AC3 Stereo)"; only compose one if it's missing.
const CH_LABEL: Record<number, string> = { 1: "Mono", 2: "Stereo", 6: "5.1", 8: "7.1" };
const streamLabel = (s: PlexStream): string => {
  if (s.extendedDisplayTitle) return s.extendedDisplayTitle;
  if (s.displayTitle) return s.displayTitle;
  const name = [s.title, s.language || streamLang(s).toUpperCase()].filter(Boolean).join(" ");
  const extra = [s.codec?.toUpperCase(), s.channels ? CH_LABEL[s.channels] : ""].filter(Boolean).join(" ");
  return extra ? `${name} (${extra})` : name;
};

/** Every track (NOT deduped by language — same-language tracks are distinct), each carrying
 *  its Plex stream id so the client can select the exact one. */
function listTracks(streams: PlexStream[]): PlaybackTrack[] {
  const out: PlaybackTrack[] = [];
  const seen = new Set<string>();
  for (const s of streams) {
    const id = s.id != null ? String(s.id) : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, lang: streamLang(s), label: streamLabel(s) });
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

  // The base the CLIENT streams from. The server's fetches above/below stay on `baseUrl`
  // (LAN); only the returned URL uses the client's chosen connection (local/remote/relay).
  const clientBase = opts.clientBaseUrl ?? baseUrl;

  const streams = part.Stream ?? [];
  const audioStreams = streams.filter((s) => s.streamType === 2);
  // Prefer non-forced subtitles (forced only shows foreign-dialogue snippets), so a
  // language maps to the full subtitle track and the picker labels it plainly.
  const subStreams = streams
    .filter((s) => s.streamType === 3)
    .sort((a, b) => (a.forced ? 1 : 0) - (b.forced ? 1 : 0));
  const audioTracks = listTracks(audioStreams);
  const subtitleTracks = listTracks(subStreams);

  const container = (media?.container ?? part.container ?? "").toLowerCase();
  const videoCodec = (media?.videoCodec ?? "").toLowerCase();
  const audioCodec = (media?.audioCodec ?? "").toLowerCase();

  // The exact audio/subtitle streams the client asked for, BY STREAM ID (validated against
  // this item's streams). A selection forces a transcode (we can't pick a track out of a
  // raw direct-play file server-side).
  const quality = qualityParams(opts.quality);
  const audioStreamId =
    opts.audioStreamId && audioStreams.some((s) => String(s.id) === opts.audioStreamId)
      ? opts.audioStreamId
      : undefined;
  const wantsSubs = !!opts.subtitleStreamId && opts.subtitleStreamId !== "off";
  const subStreamId =
    wantsSubs && subStreams.some((s) => String(s.id) === opts.subtitleStreamId)
      ? opts.subtitleStreamId
      : undefined;

  // Device-aware capability check: use the real client's codec support when it reports
  // it (a TV), else the built-in browser assumption (h264/aac/mp4 — the admin preview).
  const caps = opts.caps;
  const vOk = (c: string) => {
    const n = canonicalVideoCodec(c);
    return caps ? caps.videoCodecs.includes(n) : DIRECT_VIDEO.has(n);
  };
  const aOk = (c: string) => {
    const n = canonicalAudioCodec(c);
    return caps ? caps.audioCodecs.includes(n) : DIRECT_AUDIO.has(n);
  };
  const cOk = (c: string) => {
    const n = canonicalContainer(c);
    return caps ? caps.directContainers.includes(n) : DIRECT_CONTAINERS.has(n);
  };

  // Quality cap, an audio-track switch, burned subtitles, or a runtime native-failure
  // retry (forceHls) all force a transcode. Otherwise, if the client can natively play the
  // container + video + the file's DEFAULT audio, we direct-play the raw part (client seeks
  // to the offset).
  const noOverride = !opts.forceHls && !quality && audioStreamId == null && subStreamId == null;
  const directContainer = cOk(container);
  const directVideo = vOk(videoCodec);
  const directDefaultAudio = aOk(audioCodec);
  const canDirect = noOverride && directContainer && directVideo && directDefaultAudio;

  // Middle case — direct-play WITH a client-side audio-track switch. The container + video are
  // natively decodable but the file's DEFAULT audio isn't (DTS/TrueHD/ALAC), YET the file carries
  // a companion track the client CAN decode (e.g. Avatar's AC3 alongside its TrueHD default). We
  // STILL direct-play the raw file — no transcode, HDR/HEVC intact, off the MSE/HLS buffering path
  // entirely — and tell the client which track to select on load. Why the client and not a server
  // PUT: a raw-file direct-play serves the file as-is, so Plex's "selected stream" DB state doesn't
  // ride along (the embedded default stays undecodable), and the browser's AudioTrack API exposes
  // no codec — so the SERVER must name the track. The handle is its index AMONG audio tracks (file
  // order). Proven server-side by sim-audio-directplay.ts; see [[project-tv-playback-protocol]].
  let directAudio: PlaybackInfo["directAudio"];
  if (!canDirect && noOverride && directContainer && directVideo && !directDefaultAudio) {
    // The DECODABLE audio streams, in file order — this is EXACTLY what the client's native
    // <video>.audioTracks exposes (measured on the C2: it filters out tracks it can't decode,
    // e.g. the undecodable TrueHD default, keeping the rest in order — exposedCount always equals
    // the decodable count). So the client's handle must be the index WITHIN this decodable subset,
    // NOT among all audio streams (which would point past the hidden tracks and land on the wrong
    // one — e.g. a commentary). Prefer a real program track over a commentary, then most channels.
    const decodable = audioStreams.filter((s) => aOk((s.codec ?? "").toLowerCase()));
    const isCommentary = (s: PlexStream) =>
      /comment/i.test(`${s.title ?? ""} ${s.extendedDisplayTitle ?? ""} ${s.displayTitle ?? ""}`);
    const best = decodable
      .map((s, k) => ({ s, k }))
      .sort((a, b) => {
        const c = (isCommentary(a.s) ? 1 : 0) - (isCommentary(b.s) ? 1 : 0);
        return c !== 0 ? c : (b.s.channels ?? 0) - (a.s.channels ?? 0);
      })[0];
    if (best) {
      directAudio = {
        streamId: best.s.id != null ? String(best.s.id) : "",
        audioIndex: best.k, // index AMONG DECODABLE tracks = the panel's exposed audioTracks index
        lang: streamLang(best.s),
        label: streamLabel(best.s),
        codec: canonicalAudioCodec((best.s.codec ?? "").toLowerCase()),
      };
    }
  }

  if (canDirect || directAudio) {
    const url = `${clientBase}${part.key}?X-Plex-Token=${encodeURIComponent(token)}`;
    return {
      mode: "direct",
      url,
      session: null,
      container,
      videoCodec,
      audioCodec,
      audioTracks,
      subtitleTracks,
      directAudio,
    };
  }

  // HLS transcode — Plex applies `offset` server-side, so playback starts there. A
  // *unique* session id (per resolve) lets us stop this exact transcode on teardown
  // without ever colliding with a freshly-started one for the same item/offset.
  const session = `channelguide-${ratingKey}-${crypto.randomUUID().slice(0, 8)}`;
  // Transcode delivery = HLS (fMP4) via hls.js/MSE. We tried a progressive-HTTP + native
  // <video> rung (v0.3.27–0.4.0: container=mp4 then mkv) so a transcode could keep the full
  // native audio set — but a live, still-transcoding stream does NOT play in the C2's <video>
  // (mp4 = ~89-byte stub, mkv = black/freeze; proven in PlaybackLog). HLS's segmented buffering
  // is what actually sustains a live transcode. Native DIRECT-PLAY (above) stays the primary
  // path for everything the panel decodes; HLS only carries this must-transcode tail. The HLS
  // profile advertises the full native VIDEO set (so Plex COPIES HEVC/AV1 — HDR preserved) but
  // MSE-SAFE AUDIO only (aac/opus/mp3) — MSE rejects E-AC3/DTS/TrueHD (bufferAddCodecError) even
  // though native <video> plays them; that audio either direct-plays or is transcoded anyway,
  // so nothing is lost. See [[project-tv-playback-protocol]].
  const protocol = "hls" as const;
  const params = new URLSearchParams({
    path: `/library/metadata/${ratingKey}`,
    mediaIndex: "0",
    partIndex: "0",
    protocol,
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
    params.set("X-Plex-Client-Profile-Extra", clientProfileExtra(caps, protocol));
    params.set("X-Plex-Platform", "Generic");
  } else if (quality) {
    params.set("X-Plex-Client-Profile-Extra", BROWSER_CLIENT_PROFILE);
  }
  // Select the exact audio/subtitle stream via Plex's "Set stream selection" PUT
  // (PUT /library/parts/{id}?audioStreamID=&subtitleStreamID=&allParts=1). The URL transcode
  // params are honored INCONSISTENTLY (this was the subtitle bug — and the audio switch never
  // worked because it only set the URL param); the PUT is the canonical, reliable way. It's
  // per-part *global* Plex state (shared across viewers of that item) — fine for single-admin,
  // revisit for multi-user. See .docs/plex-subtitles-findings.md + the Plex OpenAPI.
  const partId = String(part.id ?? (part.key ?? "").split("/")[3] ?? "");
  if (partId && (audioStreamId != null || subStreamId != null || opts.subtitleStreamId === "off")) {
    const sel = new URLSearchParams({ allParts: "1" });
    if (audioStreamId != null) sel.set("audioStreamID", String(audioStreamId));
    if (subStreamId != null) sel.set("subtitleStreamID", String(subStreamId));
    else if (opts.subtitleStreamId === "off") sel.set("subtitleStreamID", "0");
    await fetch(`${baseUrl}/library/parts/${partId}?${sel.toString()}`, {
      method: "PUT",
      headers: pmsHeaders(token),
    }).catch(() => {});
  }
  // Burn the selected subtitle (re-encodes the video with it painted in → renders anywhere).
  if (subStreamId != null) {
    params.set("subtitles", "burn");
    params.set("directStream", "0");
  }
  const qs = params.toString();

  // **Register the transcode with Plex's decision endpoint first.** This is the
  // documented two-step flow (decision → start): without it, `start.m3u8` 400s for any
  // media that needs a real transcode decision (e.g. an mkv/DTS movie at a non-trivial
  // offset). Same session/params so `start` picks up the negotiated session.
  let decision: PlaybackInfo["decision"];
  try {
    const res2 = await fetch(`${baseUrl}/video/:/transcode/universal/decision?${qs}`, {
      headers: { ...pmsHeaders(token), Accept: "application/json" },
    });
    if (!res2.ok) {
      console.warn(`[plex] transcode decision ${res2.status} for ratingKey ${ratingKey}`);
    } else {
      const dj = (await res2.json().catch(() => null)) as {
        MediaContainer?: {
          Metadata?: Array<{
            Media?: Array<{
              videoDecision?: string;
              audioDecision?: string;
              videoCodec?: string;
              audioCodec?: string;
              container?: string;
            }>;
          }>;
        };
      } | null;
      const m = dj?.MediaContainer?.Metadata?.[0]?.Media?.[0];
      if (m) {
        decision = {
          videoDecision: m.videoDecision,
          audioDecision: m.audioDecision,
          videoCodec: m.videoCodec,
          audioCodec: m.audioCodec,
          container: m.container,
        };
      }
    }
  } catch (err) {
    console.warn(`[plex] transcode decision failed for ratingKey ${ratingKey}:`, err);
  }

  // HLS = segmented playlist (start.m3u8 → hls.js); HTTP = one progressive stream
  // (start → native <video src>). Plex bakes `offset` into both, so the client plays
  // from 0 (no seek) for either transcode mode.
  const startPath = protocol === "hls" ? "start.m3u8" : "start";
  const url = `${clientBase}/video/:/transcode/universal/${startPath}?${qs}`;
  return {
    mode: protocol === "hls" ? "hls" : "http",
    url,
    session,
    container,
    videoCodec,
    audioCodec,
    audioTracks,
    subtitleTracks,
    decision,
  };
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
