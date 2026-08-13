import { serverUrl } from "@/lib/runtime-env";

/** Base URL of the API server (which hosts the public artwork proxy + static assets like bumper music). */
export function serverBase(): string {
  const u = serverUrl();
  return u.startsWith("/") && typeof window !== "undefined" ? `${window.location.origin}${u}` : u;
}

/**
 * URL for the public artwork proxy of a SAVED channel's media source — the same `/img/:channelId` proxy
 * the TV app uses for cover art (streams Plex art through the source token). Returns null when there's no
 * art path. `w` requests a Plex resize (a square-ish cover crop via the proxy's transcode); pass `null` to
 * get the RAW image at its natural aspect ratio (e.g. a tall poster shown as-is, not cropped).
 */
export function channelImg(channelId: string, path: string | undefined | null, w: number | null = 200): string | null {
  if (!path) return null;
  const base = `${serverBase()}/img/${channelId}?path=${encodeURIComponent(path)}`;
  return w == null ? base : `${base}&w=${w}`;
}
