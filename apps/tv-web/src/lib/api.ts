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

export type Track = { lang: string; label: string };

export type MediaInfo = {
  mode: "direct" | "hls";
  url: string;
  session: string | null;
  offsetSeconds: number;
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
    caps?: { videoCodecs: string[]; audioCodecs: string[]; directContainers: string[] },
  ) => {
    const p = new URLSearchParams({ ratingKey, offsetSeconds: String(offsetSeconds) });
    if (caps) {
      p.set("vcodecs", caps.videoCodecs.join(","));
      p.set("acodecs", caps.audioCodecs.join(","));
      p.set("dcontainers", caps.directContainers.join(","));
    }
    return request<MediaInfo>(`/api/v1/channels/${channelId}/media?${p.toString()}`);
  },

  stop: (channelId: string, session: string) =>
    request<{ ok: true }>(`/api/v1/channels/${channelId}/stop`, {
      method: "POST",
      body: JSON.stringify({ session }),
    }),

  logPlayback: (data: Record<string, unknown>) =>
    request<{ ok: true; id: string }>("/api/v1/playback/log", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
