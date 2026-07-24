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

/** A capability-matrix test clip (the diagnostic plays each and records whether it decodes). */
export type CapTest = {
  id: string;
  category: string;
  container: string;
  video: string;
  audio: string;
  feature: string | null;
  subtitle: string | null;
  diagnostic: string;
  realSample: boolean;
  manual: Array<"audio" | "hdr" | "subtitle">;
  url: string;
};

// --- REST guide API (/api/v1, bearer) — ported from tv-web ---------------------

/** A channel package (the guide sidebar's filter list). */
export type Package = {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  tint: string | null;
  channelCount: number;
};

export type GuideChannel = {
  id: string;
  number: number;
  name: string;
  callsign: string | null;
  icon: string | null;
  tint: string | null;
  package: { id: string; key: string; icon: string | null; tint: string | null; name: string } | null;
};

/** Full denormalized guide metadata (mirrors the server's GuideMeta) — ported from tv-web. */
export type GuideMeta = {
  title: string;
  type?: string;
  year?: number;
  contentRating?: string;
  summary?: string;
  tagline?: string;
  studio?: string;
  directors?: string[];
  genres?: string[];
  cast?: string[];
  audienceRating?: number;
  criticRating?: number;
  durationMs?: number;
  thumb?: string;
  art?: string;
  addedAt?: string;
  resolution?: string;
  audioChannels?: number;
  hdr?: string; // "HDR10" | "Dolby Vision" | "HLG" when HDR, else undefined
  dynamicAudio?: string; // "Atmos" | "DTS:X", else undefined
  videoCodec?: string;
  showTitle?: string;
  showRatingKey?: string;
  season?: number;
  episode?: number;
};

export type GuideGridProgram = {
  id: string;
  ratingKey: string | null;
  startsAt: string;
  durationSeconds: number;
  guide: GuideMeta;
};

export type GuideGridChannel = GuideChannel & { programs: GuideGridProgram[] };

export type GuideGrid = {
  serverTime: string;
  windowMinutes: number;
  channels: GuideGridChannel[];
};

export type TimelineSlot = {
  id: string;
  kind: "PROGRAM" | "BUMPER";
  ratingKey: string | null;
  startsAt: string;
  durationSeconds: number;
  guide: GuideMeta;
};
export type Timeline = { serverTime: string; slots: TimelineSlot[] };

export type Track = { id: string; lang: string; label: string };

export type MediaInfo = {
  mode: "direct" | "http" | "hls";
  url: string;
  session: string | null;
  offsetSeconds: number;
  capsSource?: "measured" | "reported" | "default";
  connection?: "local" | "remote" | "relay";
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioTracks: Track[];
  subtitleTracks: Track[];
  decision?: { videoDecision?: string; audioDecision?: string; videoCodec?: string; audioCodec?: string; container?: string };
};

// --- Device capability overrides (Settings → Device) — ported from tv-web -------
export type CapKind = "video" | "audio" | "container";
export type CapTokenState = {
  token: string;
  label: string;
  measured: boolean; // the diagnostic credited native decode
  quirk: string | null; // a known-issue reason it's off by default
  override: boolean | null; // manual override (null = none)
  effective: boolean; // what playback actually uses
};
export type CapGroup = { kind: CapKind; tokens: CapTokenState[] };
export type PlaybackError = {
  channelName: string | null;
  title: string | null;
  mode: string | null;
  sourceContainer: string | null;
  sourceVideoCodec: string | null;
  sourceAudioCodec: string | null;
  error: string | null;
  outcome: string | null;
  createdAt: string;
};
export type DeviceCapView = {
  onboarded: boolean;
  hasOverrides: boolean;
  device: { model: string | null; osVersion: string | null; platform: string | null; screenWidth: number | null; screenHeight: number | null; hdr: boolean | null } | null;
  groups: CapGroup[];
  recentErrors: PlaybackError[];
};

export const api = {
  packages: () => request<{ packages: Package[] }>("/api/v1/packages"),

  timeline: (channelId: string, backMinutes = 360, forwardMinutes = 180) =>
    request<Timeline>(`/api/v1/channels/${channelId}/timeline?backMinutes=${backMinutes}&forwardMinutes=${forwardMinutes}`),

  /** Resolve a program to a playable URL. `deviceId` lets the server use this device's MEASURED
   *  capability profile (from the diagnostic); `forceHls` forces an HLS transcode (what AVPlayer /
   *  expo-video reliably plays on iPadOS until the diagnostic lands). */
  media: (
    channelId: string,
    ratingKey: string,
    offsetSeconds: number,
    opts: { deviceId?: string; forceHls?: boolean; quality?: string; audioStreamId?: string; subtitleStreamId?: string } = {},
  ) => {
    const p = new URLSearchParams({ ratingKey, offsetSeconds: String(offsetSeconds) });
    if (opts.deviceId) p.set("deviceId", opts.deviceId);
    if (opts.forceHls) p.set("forceHls", "1");
    if (opts.quality && opts.quality !== "original") p.set("quality", opts.quality);
    if (opts.audioStreamId) p.set("audioStreamId", opts.audioStreamId);
    if (opts.subtitleStreamId) p.set("subtitleStreamId", opts.subtitleStreamId);
    return request<MediaInfo>(`/api/v1/channels/${channelId}/media?${p.toString()}`);
  },

  qualities: () => request<{ qualities: { id: string; label: string }[] }>("/api/v1/qualities"),

  stop: (channelId: string, session: string) =>
    request<{ ok: true }>(`/api/v1/channels/${channelId}/stop`, { method: "POST", body: JSON.stringify({ session }) }),

  heartbeat: (body: { channelId: string; state: "program" | "bumper" | "off"; ratingKey?: string | null; title?: string | null; delaySeconds?: number; positionAt?: string | null; transcodeSession?: string | null }) =>
    request<unknown>("/api/v1/sessions/heartbeat", { method: "POST", body: JSON.stringify(body) }),

  endSession: () => request<unknown>("/api/v1/sessions/end", { method: "POST", body: "{}" }),

  /** One PlaybackLog row per program load: what the server decided (mode/codecs/connection) + the
   *  real on-device outcome (playing/not_decoding/error + decoded dims). Powers the play-log readout. */
  logPlayback: (data: Record<string, unknown>) => request<{ ok: true; id: string }>("/api/v1/playback/log", { method: "POST", body: JSON.stringify(data) }),

  reportDevice: (report: unknown) => request<{ ok: true; id: string }>("/api/v1/devices/report", { method: "POST", body: JSON.stringify(report) }),

  capsManifest: () => request<{ tests: CapTest[] }>("/api/v1/caps/manifest"),
  capsResult: (data: Record<string, unknown>) => request<{ ok: true }>("/api/v1/caps/result", { method: "POST", body: JSON.stringify(data) }),
  favorites: () => request<{ channelIds: string[] }>("/api/v1/favorites"),
  setFavorite: (channelId: string, favorite: boolean) =>
    request<{ channelId: string; favorited: boolean }>("/api/v1/favorites", {
      method: "POST",
      body: JSON.stringify({ channelId, favorite }),
    }),
  recents: () => request<{ channelIds: string[] }>("/api/v1/recents"),
  guide: (forwardMinutes = 180) => request<GuideGrid>(`/api/v1/guide?forwardMinutes=${forwardMinutes}`),

  /** The Device settings breakdown: measured / quirk / override / effective per codec + recent errors. */
  deviceCaps: (deviceId: string) => request<DeviceCapView>(`/api/v1/device/caps?deviceId=${encodeURIComponent(deviceId)}`),
  /** Set (or clear, when value=null) one codec's override for this device. */
  setDeviceCap: (deviceId: string, kind: CapKind, token: string, value: boolean | null) =>
    request<{ overrides: unknown }>("/api/v1/device/caps", { method: "POST", body: JSON.stringify({ deviceId, kind, token, value }) }),
  /** Clear all overrides — revert to exactly what the diagnostic found. */
  resetDeviceCaps: (deviceId: string) =>
    request<{ ok: true }>("/api/v1/device/caps/reset", { method: "POST", body: JSON.stringify({ deviceId }) }),
};
