/**
 * Which of the media server's Plex connections THIS device can reach.
 *
 * The ChannelGuide server always talks to Plex over its LAN `baseUrl`, but the TV app streams
 * DIRECTLY from Plex — so a TV away from home needs the remote/relay URL instead of the LAN one.
 * At launch we fetch the candidates from `/api/v1/connections` and probe them local → remote →
 * relay, remembering the first reachable one on the device (like the server URL). The api client
 * then stamps it onto `/media` as `?network=`, and the server resolves the matching stored URL.
 * A TV's network is stable per session, so probe-once-at-launch beats per-stream failover.
 */
import { SERVER_URL, getToken } from "./auth-client";

export type Network = "local" | "remote" | "relay";

const KEY = "cg-tv-network";

function readStored(): Network | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "local" || v === "remote" || v === "relay" ? v : null;
  } catch {
    return null;
  }
}

let current: Network | null = readStored();

/** The network chosen at the last probe — what `/media` requests are stamped with. */
export function getNetwork(): Network | null {
  return current;
}

function setNetwork(n: Network) {
  current = n;
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
async function reachable(base: string, timeoutMs = 2000): Promise<boolean> {
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
      setNetwork(net);
      return net;
    }
  }
  setNetwork("local");
  return "local";
}
