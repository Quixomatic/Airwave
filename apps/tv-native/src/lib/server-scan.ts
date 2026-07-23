import * as Network from "expo-network";

/**
 * Best-effort LAN discovery for the setup screen — the native port of tv-web's `server-scan.ts`.
 * tv-web leaks the device's LAN IP via a WebRTC ICE candidate (no mDNS on webOS); on native we ask
 * `expo-network` for the device IP directly, then sweep that /24 for anything answering
 * `GET /api/health` with `{ ok: true }`. Same subnet only (a domain/remote server won't be found —
 * that's what manual entry is for). Never throws — worst case it returns [].
 */

const HEALTH_TIMEOUT_MS = 1500;
const BATCH = 24; // concurrent probes
const PORTS = [3000]; // the default; manual entry covers anything custom

/** The /24 prefix of the device's LAN IP (e.g. "192.168.1"), or null if it can't be determined. */
async function localSubnet(): Promise<string | null> {
  try {
    const ip = await Network.getIpAddressAsync();
    const m = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
    if (m && m[1] && !m[1].startsWith("127.") && !m[1].startsWith("169.254")) return m[1];
    return null;
  } catch {
    return null;
  }
}

async function isServer(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${url}/api/health`, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return body?.ok === true;
  } catch {
    return false;
  }
}

/**
 * Sweep the local /24 for ChannelGuide servers. Reports progress (0..1). Returns the base URLs found
 * (e.g. "http://192.168.1.50:3000"). Empty if the subnet couldn't be determined or nothing answered.
 */
export async function scanForServers(onProgress?: (fraction: number) => void): Promise<string[]> {
  const prefix = await localSubnet();
  if (!prefix) {
    onProgress?.(1);
    return [];
  }
  const targets: string[] = [];
  for (let host = 1; host <= 254; host++) {
    for (const port of PORTS) targets.push(`http://${prefix}.${host}:${port}`);
  }
  const found: string[] = [];
  let done = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (url) => {
        if (await isServer(url)) found.push(url);
        done++;
        onProgress?.(done / targets.length);
      }),
    );
  }
  return found;
}
