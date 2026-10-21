import type { Context } from "hono";

/** Clamp a caller-supplied w/h to a sane integer pixel range (or undefined when absent/invalid). Plex's
 *  photo transcoder only needs small art sizes; an unbounded value is just a resource trap. */
function clampDim(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 2000) : undefined;
}

/**
 * Stream one Plex art path through a resolved media source, injecting the admin token. Shared by the internal
 * `/img` proxy (apps/server/src/index.ts) and the public artwork endpoint (src/public/routes/artwork.ts).
 *
 * The caller-supplied `path` is UNTRUSTED. The old prefix-only check (`^/(library|photo)/`) let `..` and
 * `%2e%2e` slip through, because `fetch` normalises those AFTER the check had passed — so a request could
 * reach arbitrary admin-token Plex endpoints (`/status/sessions`, `/:/prefs`, library/account data) and the
 * `/photo/:/transcode?url=` SSRF (GHSA-vc4j-53mw-85mx). So we RESOLVE first, then require the normalised path
 * to stay on this Plex server, under `/library/`, with no traversal and no query — the only shape real
 * artwork ever uses. The `w`/`h` transcode is built internally from that validated `/library` path, never
 * from caller input, so `/photo` is never reachable as an input.
 *
 * Both source resolvers guarantee a non-null baseUrl before returning (they throw otherwise); the `| null`
 * here is just so callers don't have to narrow, and we fail closed if it ever is null.
 */
export async function streamPlexArt(
  c: Context,
  source: { baseUrl: string | null; token: string },
  path: string,
): Promise<Response> {
  const baseUrl = source.baseUrl;
  if (!baseUrl) return c.text("not found", 404);

  let resolved: URL;
  let baseOrigin: string;
  try {
    resolved = new URL(path, baseUrl);
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    return c.text("bad path", 400);
  }
  if (
    /\.\.|%2e|\\/i.test(path) || // raw traversal / backslash (also catches double-encoded dots)
    resolved.origin !== baseOrigin || // escaped to another host
    !resolved.pathname.startsWith("/library/") || // not a library art path (blocks /status, /:/prefs, /photo SSRF)
    resolved.search // no caller-supplied query string
  ) {
    return c.text("bad path", 400);
  }
  const safePath = resolved.pathname; // normalised, validated, query-free

  const token = encodeURIComponent(source.token);
  const w = clampDim(c.req.query("w"));
  const h = clampDim(c.req.query("h"));
  const upstream =
    w || h
      ? `${baseUrl}/photo/:/transcode?url=${encodeURIComponent(safePath)}&width=${w ?? h}&height=${h ?? w}&minSize=1&X-Plex-Token=${token}`
      : `${baseUrl}${safePath}?X-Plex-Token=${token}`;
  const res = await fetch(upstream);
  if (!res.ok) return c.text("not found", 404);
  const headers = new Headers();
  headers.set("Content-Type", res.headers.get("Content-Type") ?? "image/jpeg");
  headers.set("Cache-Control", "public, max-age=3600");
  return new Response(res.body, { status: 200, headers });
}
