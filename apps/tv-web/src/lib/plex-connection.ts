/**
 * Which of the media server's Plex connections THIS device can reach.
 *
 * The Airwave server always talks to Plex over its LAN `baseUrl`, but the TV app streams
 * DIRECTLY from Plex — so a TV away from home needs the remote/relay URL instead of the LAN one.
 * At launch we fetch the candidates from `/api/v1/connections` and probe them local → remote →
 * relay, remembering the first reachable one on the device (like the server URL). The api client
 * then stamps it onto `/media` as `?network=`, and the server resolves the matching stored URL.
 * A TV's network is stable per session, so probe-once-at-launch beats per-stream failover.
 */
import { SERVER_URL, getToken } from "./auth-client";

export type Network = "local" | "remote" | "relay";

const KEY = "cg-tv-network"; // the probed value
const OVERRIDE_KEY = "cg-tv-network-override"; // a manual test override (Settings → About) — wins

function read(key: string): Network | null {
  try {
    const v = localStorage.getItem(key);
    return v === "local" || v === "remote" || v === "relay" ? v : null;
  } catch {
    return null;
  }
}

let probed: Network | null = read(KEY);
let override: Network | null = read(OVERRIDE_KEY);

/** The EFFECTIVE network `/media` requests are stamped with — a manual override wins over the
 * probe (so you can force remote from the LAN to test it). */
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
  try {
    if (n) localStorage.setItem(OVERRIDE_KEY, n);
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    /* non-fatal */
  }
}

function setProbed(n: Network) {
  probed = n;
  try {
    localStorage.setItem(KEY, n);
  } catch {
    /* non-fatal */
  }
}

/**
 * Reachability probe: a no-cors GET of the base's `/identity` with a short timeout. `no-cors`
 * yields an opaque response that still resolves on a successful connection and throws otherwise —
 * enough to tell whether this base is reachable from the current network without needing CORS.
 */
async function reachable(base: string, timeoutMs = 4000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(`${base}/identity`, { mode: "no-cors", signal: ctrl.signal });
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
 * relay). Falls back to "local" so `/media` still hits the LAN base if nothing else answers (or
 * the probe can't run). Returns the chosen network. Call once at launch.
 */
export async function probeConnection(): Promise<Network> {
  let conns: Connections = {};
  try {
    const token = getToken();
    const res = await fetch(`${SERVER_URL}/api/v1/connections`, {
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
  // Nothing answered in time — usually a slow/flaky connection, not truly unreachable. Fall back
  // to the most universally-reachable URL we have: relay tunnels through Plex so it works from
  // anywhere; local (raw http) is useless off-LAN and mixed-content-blocked on an HTTPS player.
  const fallback: Network = conns.relay ? "relay" : conns.remote ? "remote" : "local";
  setProbed(fallback);
  return fallback;
}
