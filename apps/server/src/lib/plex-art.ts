import type { Context } from "hono";

/**
 * Stream one Plex art path through a resolved media source, injecting the admin token. Shared by the internal
 * `/img` proxy (apps/server/src/index.ts) and the public artwork endpoint
 * (src/public/routes/artwork.ts). Only the caller decides which Plex path to fetch; this helper never sees a
 * channel or rating key. `w`/`h` query params optionally resize via Plex's photo transcoder.
 *
 * Both source resolvers guarantee a non-null baseUrl before returning (they throw otherwise), so we accept the
 * broader `string | null` here rather than force a narrow at each call site.
 */
export async function streamPlexArt(
  c: Context,
  source: { baseUrl: string | null; token: string },
  path: string,
): Promise<Response> {
  const token = encodeURIComponent(source.token);
  const w = c.req.query("w");
  const h = c.req.query("h");
  const upstream =
    w || h
      ? `${source.baseUrl}/photo/:/transcode?url=${encodeURIComponent(path)}&width=${w ?? h}&height=${h ?? w}&minSize=1&X-Plex-Token=${token}`
      : `${source.baseUrl}${path}${path.includes("?") ? "&" : "?"}X-Plex-Token=${token}`;
  const res = await fetch(upstream);
  if (!res.ok) return c.text("not found", 404);
  const headers = new Headers();
  headers.set("Content-Type", res.headers.get("Content-Type") ?? "image/jpeg");
  headers.set("Cache-Control", "public, max-age=3600");
  return new Response(res.body, { status: 200, headers });
}
