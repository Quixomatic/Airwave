/**
 * Best-effort LAN discovery for the setup screen. There's no mDNS/UDP from the web layer on webOS,
 * so we do the browser-standard trick: leak the device's own LAN IP via a WebRTC ICE candidate, then
 * sweep that /24 for anything answering `GET /api/health` with `{ ok: true }`. It only works on the
 * same subnet (a domain/remote server won't be found — that's what manual entry is for), and modern
 * browsers sometimes mDNS-obfuscate the candidate (`*.local`), in which case we find nothing and the
 * user types the address. Never throws — worst case it returns [].
 */

const HEALTH_TIMEOUT_MS = 1500;
const WEBRTC_TIMEOUT_MS = 2500;
const BATCH = 24; // concurrent probes — 254 at once chokes the panel
const PORTS = [3000]; // the default; manual entry covers anything custom

/** The /24 prefix of the device's LAN IP (e.g. "192.168.1"), or null if it can't be determined. */
async function localSubnet(): Promise<string | null> {
  return new Promise((resolve) => {
    let pc: RTCPeerConnection;
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
    } catch {
      return resolve(null);
    }
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      resolve(v);
    };
    pc.onicecandidate = (e) => {
      const cand = e.candidate?.candidate;
      if (!cand || cand.includes(".local")) return; // mDNS-obfuscated → unusable
      const m = cand.match(/(\d+\.\d+\.\d+)\.\d+/);
      // Skip loopback / link-local noise.
      if (m && m[1] && !m[1].startsWith("127.") && !m[1].startsWith("169.254")) finish(m[1]);
    };
    pc.createDataChannel("cg");
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .catch(() => finish(null));
    setTimeout(() => finish(null), WEBRTC_TIMEOUT_MS);
  });
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
 * Sweep the local /24 for ChannelGuide servers. Reports progress (0..1) as it goes. Returns the base
 * URLs found (e.g. "http://192.168.1.50:3000"). Empty if the subnet couldn't be determined or nothing
 * answered.
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
