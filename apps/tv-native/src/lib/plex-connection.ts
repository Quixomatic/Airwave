/**
 * Which of the media server's Plex connections THIS device can reach.
 *
 * The ChannelGuide server always talks to Plex over its LAN `baseUrl`, but the native app streams
 * DIRECTLY from Plex — so an iPad/Apple TV away from home needs the remote/relay URL instead of the
 * LAN one. At launch we fetch the candidates from `/api/v1/connections` and probe them local →
 * remote → relay, remembering the first reachable one on the device (like the server URL). The api
 * client then stamps it onto `/media` as `?network=`, and the server resolves the matching stored
 * URL. A device's network is stable per session, so probe-once-at-launch beats per-stream failover.
 *
 * Faithful port of tv-web's `lib/plex-connection.ts`. Differences from the web version:
 *  - persistence is AsyncStorage (async) instead of localStorage (sync) → a `hydrateNetwork()` seeds
 *    the in-memory cache at launch (mirroring the cred-store) so `getNetwork()` stays synchronous for
 *    the api client;
 *  - the reachability probe is a plain `fetch` (React Native has no CORS/mixed-content model, and ATS
 *    allows arbitrary loads) rather than tv-web's `no-cors` GET.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getServerUrl, getToken } from "./auth";

export type Network = "local" | "remote" | "relay";

const KEY = "cg-tv-network"; // the probed value
const OVERRIDE_KEY = "cg-tv-network-override"; // a manual test override (Settings → Server) — wins

function coerce(v: string | null | undefined): Network | null {
  return v === "local" || v === "remote" || v === "relay" ? v : null;
}

// In-memory cache (seeded by hydrateNetwork at launch, kept warm by the setters) so the api client
// reads the network synchronously, exactly like tv-web reads it from localStorage.
let probed: Network | null = null;
let override: Network | null = null;

/** Seed the in-memory network + override from AsyncStorage. Awaited at launch (alongside loadSession). */
export async function hydrateNetwork(): Promise<void> {
  try {
    const [[, p], [, o]] = await AsyncStorage.multiGet([KEY, OVERRIDE_KEY]);
    probed = coerce(p);
    override = coerce(o);
  } catch {
    /* non-fatal — falls back to the launch probe / server default */
  }
}

/** The EFFECTIVE network `/media` requests are stamped with — a manual override wins over the probe
 * (so you can force remote from the LAN to test it). */
export function getNetwork(): Network | null {
  return override ?? probed;
}

/** The manual test override, or null when following the launch probe. */
export function getNetworkOverride(): Network | null {
  return override;
}

/** Force a network for testing (or null to follow the probe). Persisted on the device. */
export function setNetworkOverride(n: Network | null) {
  override = n;
  if (n) void AsyncStorage.setItem(OVERRIDE_KEY, n).catch(() => {});
  else void AsyncStorage.removeItem(OVERRIDE_KEY).catch(() => {});
}

function setProbed(n: Network) {
  probed = n;
  void AsyncStorage.setItem(KEY, n).catch(() => {});
}

/**
 * Reachability probe: a GET of the base's `/identity` with a short timeout. We only care whether it
 * resolves (the server answered → reachable) vs throws/times out (unreachable from this network).
 */
async function reachable(base: string, timeoutMs = 4000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(`${base}/identity`, { signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

type Connections = { local?: string | null; remote?: string | null; relay?: string | null };

/**
 * Probe the media server's connections and remember the first reachable one (local → remote →
 * relay). Falls back to relay → remote → local so `/media` still resolves if nothing answers (or the
 * probe can't run). Returns the chosen network. Call once at launch (and after login).
 */
export async function probeConnection(): Promise<Network> {
  let conns: Connections = {};
  try {
    const token = getToken();
    const res = await fetch(`${getServerUrl()}/api/v1/connections`, {
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
  // Nothing answered in time — usually slow/flaky, not truly unreachable. Fall back to the most
  // universally-reachable URL we have: relay tunnels through Plex so it works from anywhere; local
  // (raw http LAN) is useless off-network.
  const fallback: Network = conns.relay ? "relay" : conns.remote ? "remote" : "local";
  setProbed(fallback);
  return fallback;
}
