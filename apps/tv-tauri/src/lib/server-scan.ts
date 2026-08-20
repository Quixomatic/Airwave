import { invoke } from "@tauri-apps/api/core";
import { log } from "./log";

/**
 * Best-effort LAN discovery for the setup screen. Given the device's LAN /24 prefix(es), sweep each for
 * anything answering `GET /api/health` with `{ ok: true }`. Only works on the same subnet (a domain /
 * remote server won't be found — that's what manual entry is for). Never throws — worst case returns [].
 *
 * ## Desktop seams (vs tv-web)
 * - **Subnet detection is native.** tv-web leaks the LAN IP via a WebRTC ICE candidate, but WebView2
 *   mDNS-obfuscates the host candidate (`*.local`), so that trick can't see the subnet. Instead we ask
 *   Rust (the `local_subnets` command reads the real interfaces). WebRTC stays as a fallback for plain
 *   `vite dev` in a browser (no Tauri).
 * - **The health probe uses the Tauri HTTP plugin** `fetch` (routed through Rust/reqwest), not the
 *   webview's `fetch` — a webview request to `http://192.168.x.y:3000` is cross-origin and CORS-blocked.
 */

const WEBRTC_TIMEOUT_MS = 2500;
const BATCH = 48; // hosts per Rust probe_health call (each call fans out concurrently in reqwest)
const PORTS = [3000]; // the default; manual entry covers anything custom

/** This machine's LAN /24 prefixes (e.g. ["192.168.1"]) — native (Rust) first, WebRTC fallback. */
async function localSubnets(): Promise<string[]> {
  // Desktop: read the real interfaces in Rust (reliable, no mDNS obfuscation).
  try {
    const prefixes = await invoke<string[]>("local_subnets");
    log.info(`scan: local_subnets (native) -> ${JSON.stringify(prefixes)}`);
    if (Array.isArray(prefixes) && prefixes.length) return prefixes;
  } catch (e) {
    log.warn(`scan: local_subnets invoke failed (${String(e)}) — falling back to WebRTC`);
  }
  const rtc = await webrtcSubnet();
  log.info(`scan: webrtc subnet -> ${rtc ?? "null"}`);
  return rtc ? [rtc] : [];
}

/** Browser-dev fallback: leak the LAN /24 via a WebRTC ICE candidate (null if mDNS-obfuscated). */
async function webrtcSubnet(): Promise<string | null> {
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

/** Probe a batch of base URLs via Rust (reqwest) — returns the ones answering `/api/health` ok. */
async function probeHealth(urls: string[]): Promise<string[]> {
  try {
    return await invoke<string[]>("probe_health", { urls });
  } catch (e) {
    log.warn(`scan: probe_health invoke failed: ${String(e)}`);
    return [];
  }
}

/**
 * Sweep the local /24 for Airwave servers. Reports progress (0..1) as it goes. Returns the base
 * URLs found (e.g. "http://192.168.1.50:3000"). Empty if the subnet couldn't be determined or nothing
 * answered.
 */
export async function scanForServers(onProgress?: (fraction: number) => void): Promise<string[]> {
  const prefixes = await localSubnets();
  if (!prefixes.length) {
    log.warn("scan: no LAN subnets detected — nothing to sweep");
    onProgress?.(1);
    return [];
  }
  const targets: string[] = [];
  for (const prefix of prefixes) {
    for (let host = 1; host <= 254; host++) {
      for (const port of PORTS) targets.push(`http://${prefix}.${host}:${port}`);
    }
  }
  log.info(`scan: sweeping ${targets.length} hosts across ${prefixes.length} subnet(s) ${JSON.stringify(prefixes)}`);
  const found: string[] = [];
  let done = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    const alive = await probeHealth(slice);
    for (const u of alive) {
      log.info(`scan: FOUND ${u}`);
      found.push(u);
    }
    done += slice.length;
    onProgress?.(done / targets.length);
  }
  log.info(`scan: done — ${found.length} server(s) found`);
  return found;
}
