import { invoke } from "@tauri-apps/api/core";

/**
 * A `fetch`-shaped function that routes every Airwave server request through the Rust `api_request`
 * command (reqwest). This is the single chokepoint for ALL server HTTP — the REST client, the Plex
 * device-link, and better-auth all go through it. Why not the webview's own `fetch` (plain or the
 * tauri-http plugin)?
 *  - **CORS / mixed content:** the packaged app is a secure context (`http://tauri.localhost`), so a
 *    webview `fetch` to a plain-`http://` LAN server is refused as mixed content.
 *  - **HTTP-scope allowlist:** the tauri-http plugin's URL scope can't express "an arbitrary user-typed
 *    LAN IP" (`*` matches a single hostname label).
 * Doing it in Rust sidesteps all three. Returns a real `Response`, so it drops straight into
 * better-auth's `customFetchImpl`.
 */

type RustRes = { status: number; headers: [string, string][]; body: string };

// Statuses whose Response MUST have a null body (the Response constructor throws otherwise).
const NULL_BODY = new Set([101, 204, 205, 304]);

function toHeaderPairs(h?: HeadersInit): [string, string][] {
  if (!h) return [];
  if (h instanceof Headers) return [...h.entries()];
  if (Array.isArray(h)) return h as [string, string][];
  return Object.entries(h);
}

export async function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  let url: string;
  let method = "GET";
  let headers: [string, string][] = [];
  let body: string | null = null;

  if (input instanceof Request) {
    url = input.url;
    method = input.method;
    headers = [...input.headers.entries()];
    body = (await input.text().catch(() => "")) || null;
  } else {
    url = input.toString();
  }
  if (init) {
    if (init.method) method = init.method;
    if (init.headers) headers = toHeaderPairs(init.headers);
    if (init.body != null) body = typeof init.body === "string" ? init.body : String(init.body);
  }

  const res = await invoke<RustRes>("api_request", { req: { url, method, headers, body } });
  return new Response(NULL_BODY.has(res.status) ? null : res.body, {
    status: res.status,
    headers: res.headers,
  });
}
