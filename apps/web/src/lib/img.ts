import { env } from "@ChannelGuide/env/web";

/** Base URL of the API server (which hosts the public artwork proxy). */
function serverBase(): string {
  const u = env.VITE_SERVER_URL;
  return u.startsWith("/") && typeof window !== "undefined" ? `${window.location.origin}${u}` : u;
}

/**
 * URL for the public artwork proxy of a SAVED channel's media source — the same `/img/:channelId` proxy
 * the TV app uses for cover art (streams Plex art through the source token, optional `w` resize). Returns
 * null when there's no art path.
 */
export function channelImg(channelId: string, path: string | undefined | null, w = 200): string | null {
  if (!path) return null;
  return `${serverBase()}/img/${channelId}?path=${encodeURIComponent(path)}&w=${w}`;
}
