import { invoke } from "@tauri-apps/api/core";

import { apiFetch } from "./api-fetch";
import { getStoredServerUrl } from "./server-url";
import { getToken } from "./token";
import { getVal, setVal, delVal } from "./store";

/**
 * Which of the media server's Plex connections THIS device can reach. The Airwave server talks to Plex
 * over its LAN `baseUrl`, but the desktop app streams DIRECTLY from Plex (mpv) — so off-network it needs
 * the remote/relay URL, not the LAN one. At launch we fetch the candidates from `/api/v1/connections`
 * and probe them local → remote → relay, remembering the first reachable one; `/media` then stamps it
 * as `?network=` so the server resolves the matching stored URL.
 *
 * Faithful port of tv-web/tv-native `lib/plex-connection.ts`. tv-tauri seams: persistence is the
 * tauri-plugin-store cache (sync, hydrated at startup) so `getNetwork()` stays synchronous — no separate
 * hydrate step; the reachability probe + the `/connections` fetch go through Rust (the health/api
 * commands) since the app hits arbitrary Plex URLs the webview can't (CORS / mixed content).
 */
export type Network = "local" | "remote" | "relay";

const KEY = "network"; // the probed value
const OVERRIDE_KEY = "networkOverride"; // a manual test override (Settings → Server) — wins

function coerce(v: string | null | undefined): Network | null {
  return v === "local" || v === "remote" || v === "relay" ? v : null;
}

/** The EFFECTIVE network `/media` is stamped with — a manual override wins over the probe (so you can
 *  force remote from the LAN to test it). Read live from the sync store cache. */
export function getNetwork(): Network | null {
  return coerce(getVal(OVERRIDE_KEY)) ?? coerce(getVal(KEY));
}

export function getNetworkOverride(): Network | null {
  return coerce(getVal(OVERRIDE_KEY));
}

/** Force a network for testing (or null to follow the probe). Persisted on the device. */
export function setNetworkOverride(n: Network | null) {
  if (n) setVal(OVERRIDE_KEY, n);
  else delVal(OVERRIDE_KEY);
}

function setProbed(n: Network) {
  setVal(KEY, n);
}

/** Reachability of a base URL: a short-timeout GET of `/identity` in Rust — did it respond vs time out. */
async function reachable(base: string, timeoutMs = 4000): Promise<boolean> {
  try {
    return await invoke<boolean>("probe_reachable", { url: `${base}/identity`, timeoutMs });
  } catch {
    return false;
  }
}

type Connections = { local?: string | null; remote?: string | null; relay?: string | null };

/**
 * Probe the media server's connections and remember the first reachable one (local → remote → relay).
 * Falls back to relay → remote → local so `/media` still resolves if nothing answers. Returns the
 * chosen network. Call once at launch (after login).
 */
export async function probeConnection(): Promise<Network> {
  let conns: Connections = {};
  try {
    const token = getToken();
    const res = await apiFetch(`${getStoredServerUrl()}/api/v1/connections`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) conns = (await res.json()) as Connections;
  } catch {
    /* fall through to the default below */
  }

  const candidates: [Network, string | null | undefined][] = [
    ["local", conns.local],
    ["remote", conns.remote],
    ["relay", conns.relay],
  ];
  for (const [net, url] of candidates) {
    if (url && (await reachable(url))) {
      setProbed(net);
      return net;
    }
  }
  // Nothing answered — fall back to the most universally-reachable URL (relay tunnels through Plex).
  const fallback: Network = conns.relay ? "relay" : conns.remote ? "remote" : "local";
  setProbed(fallback);
  return fallback;
}
