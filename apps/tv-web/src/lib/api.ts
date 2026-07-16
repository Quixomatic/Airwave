import { SERVER_URL, getToken } from "./auth-client";

/**
 * Thin client for ChannelGuide's CUSTOM endpoints — the REST guide/playback API
 * (`/api/v1`, bearer-auth) and the custom Plex device-link flow
 * (`/api/tv/auth/plex/*`, which isn't a better-auth plugin). The better-auth
 * device-code login goes through `authClient` instead (see auth-client.ts).
 */

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${SERVER_URL}${path}`, {
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

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** URL for a Plex artwork path via the server's public image proxy (blurred bumper
 * backgrounds, guide thumbnails). Returns null when there's no path. */
export function imageUrl(channelId: string, path?: string | null, w?: number): string | null {
  if (!path) return null;
  const p = new URLSearchParams({ path });
  if (w) p.set("w", String(w));
  return `${SERVER_URL}/img/${channelId}?${p.toString()}`;
}

// --- Custom Plex device-link login (server flow proven in v0.3.16) -----------

export type PlexStart = { pinId: number; code: string; verificationUrl: string; expiresIn: number };
export type PlexPoll =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "unregistered"; email: string }
  | { status: "ok"; token: string; user: { id: string; name: string | null; email: string; role: string | null } };

export const plexLink = {
  start: () => request<PlexStart>("/api/tv/auth/plex/start", { method: "POST", body: "{}" }),
  poll: (pinId: number) =>
    request<PlexPoll>("/api/tv/auth/plex/poll", {
      method: "POST",
      body: JSON.stringify({ pinId }),
    }),
};

// --- REST guide/playback API (/api/v1, bearer) -------------------------------

export type GuideChannel = {
  id: string;
  number: number;
  name: string;
  callsign: string | null;
  icon: string | null;
  tint: string | null;
  package: { icon: string | null; tint: string | null; name: string } | null;
};

export type Guide = {
  title?: string;
  thumb?: string | null;
  year?: number | null;
  showTitle?: string | null;
  season?: number | null;
  episode?: number | null;
  summary?: string | null;
  // Richer metadata (present when the server sends the full GuideMeta) — for the
  // player's Info view. Optional so a narrower payload still typechecks.
  contentRating?: string | null;
  criticRating?: number | null;
  audienceRating?: number | null;
  durationMs?: number | null;
  genres?: string[] | null;
  cast?: string[] | null;
  directors?: string[] | null;
  studio?: string | null;
  tagline?: string | null;
};

export type NowSlot = {
  kind: "PROGRAM" | "BUMPER";
  ratingKey: string | null;
  startsAt: string;
  durationSeconds: number;
  guide: Guide;
};

export type NowNext = {
  current: (NowSlot & { offsetSeconds: number }) | null;
  next: NowSlot | null;
  endsAt: string | null;
};

/** Full denormalized guide metadata for a program (mirrors the server's GuideMeta). */
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
  resolution?: string;
  audioChannels?: number;
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
  /** Which capability set drove the decision: the panel's measured diagnostic map,
   * its canPlayType self-report, or the default browser assumption. */
  capsSource?: "measured" | "reported" | "default";
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioTracks: Track[];
  subtitleTracks: Track[];
  decision?: {
    videoDecision?: string;
    audioDecision?: string;
    videoCodec?: string;
    audioCodec?: string;
    container?: string;
  };
};

export const api = {
  channels: () => request<{ channels: GuideChannel[] }>("/api/v1/channels"),

  guide: (forwardMinutes = 180) =>
    request<GuideGrid>(`/api/v1/guide?forwardMinutes=${forwardMinutes}`),

  timeline: (channelId: string, backMinutes = 360, forwardMinutes = 180) =>
    request<Timeline>(
      `/api/v1/channels/${channelId}/timeline?backMinutes=${backMinutes}&forwardMinutes=${forwardMinutes}`,
    ),

  reportDevice: (report: unknown) =>
    request<{ ok: true; id: string }>("/api/v1/devices/report", {
      method: "POST",
      body: JSON.stringify(report),
    }),

  now: (channelId: string) => request<NowNext>(`/api/v1/channels/${channelId}/now`),

  media: (
    channelId: string,
    ratingKey: string,
    offsetSeconds: number,
    opts: {
      caps?: { videoCodecs: string[]; audioCodecs: string[]; directContainers: string[] };
      deviceId?: string;
      forceHls?: boolean;
      /** Quality-ladder preset id (or "original"/undefined for uncapped). */
      quality?: string;
      /** Audio stream id to select (from Track.id). Forces a transcode. */
      audioStreamId?: string;
      /** Subtitle stream id to burn, or "off" to clear. */
      subtitleStreamId?: string;
    } = {},
  ) => {
    const p = new URLSearchParams({ ratingKey, offsetSeconds: String(offsetSeconds) });
    // deviceId lets the server use this panel's MEASURED capability map (from the
    // onboarding diagnostic) instead of the canPlayType guess below.
    if (opts.deviceId) p.set("deviceId", opts.deviceId);
    // Set only after a native attempt failed — forces the hls.js/MSE last resort.
    if (opts.forceHls) p.set("forceHls", "1");
    if (opts.quality && opts.quality !== "original") p.set("quality", opts.quality);
    if (opts.audioStreamId) p.set("audioStreamId", opts.audioStreamId);
    if (opts.subtitleStreamId) p.set("subtitleStreamId", opts.subtitleStreamId);
    if (opts.caps) {
      p.set("vcodecs", opts.caps.videoCodecs.join(","));
      p.set("acodecs", opts.caps.audioCodecs.join(","));
      p.set("dcontainers", opts.caps.directContainers.join(","));
    }
    return request<MediaInfo>(`/api/v1/channels/${channelId}/media?${p.toString()}`);
  },

  qualities: () => request<{ qualities: { id: string; label: string }[] }>("/api/v1/qualities"),

  stop: (channelId: string, session: string) =>
    request<{ ok: true }>(`/api/v1/channels/${channelId}/stop`, {
      method: "POST",
      body: JSON.stringify({ session }),
    }),

  // Watch sessions — powers "Now Watching" + lets watch-session-reap stop orphaned
  // transcodes. The client heartbeats ~every 10s and ends the session on teardown.
  heartbeat: (body: {
    channelId: string;
    state: "program" | "bumper" | "off";
    ratingKey?: string | null;
    title?: string | null;
    delaySeconds?: number;
    positionAt?: string | null;
    transcodeSession?: string | null;
  }) => request<unknown>("/api/v1/sessions/heartbeat", { method: "POST", body: JSON.stringify(body) }),

  endSession: () => request<unknown>("/api/v1/sessions/end", { method: "POST", body: "{}" }),

  logPlayback: (data: Record<string, unknown>) =>
    request<{ ok: true; id: string }>("/api/v1/playback/log", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  capsManifest: () => request<{ tests: CapTest[] }>("/api/v1/caps/manifest"),

  capsResult: (data: Record<string, unknown>) =>
    request<{ ok: true }>("/api/v1/caps/result", { method: "POST", body: JSON.stringify(data) }),
};

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
