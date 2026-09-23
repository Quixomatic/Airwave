/**
 * Airwave Cloud relay ⇄ connector wire protocol (v1) — the SELF-HOSTED (connector) copy.
 *
 * This MUST stay byte-compatible with the relay's copy in the airwave-cloud repo
 * (apps/relay/src/protocol.ts). Keep the two in sync via the cross-repo contract in
 * airwave-cloud/.plans/implementation-phases.md.
 *
 * One WebSocket per self-hosted server (the control channel). Every proxied HTTP request is multiplexed over
 * it, keyed by a numeric `id` the relay assigns. Response bodies stream chunk-by-chunk (SSE / chunked work
 * with no special-casing). TEXT frames = JSON control + head metadata; BINARY frames = body chunks:
 * [type:1][id:uint32 BE][...payload].
 *
 * INVARIANT: only the control plane (Airwave HTTP) crosses this socket. Media is always Plex-direct.
 */

export const PROTOCOL_VERSION = 1;
export const CONTROL_PATH = "/__relay/connect";

// ── Control frames (JSON text) ───────────────────────────────────────────────

export type HelloFrame = {
  t: "hello";
  v: number;
  token: string;
  hostname?: string;
  clientVersion?: string;
};
export type ReadyFrame = { t: "ready"; subdomain: string; relayHost: string };
export type DeniedFrame = { t: "denied"; reason: string };
export type PingFrame = { t: "ping" };
export type PongFrame = { t: "pong" };
export type ReqFrame = {
  t: "req";
  id: number;
  method: string;
  url: string;
  headers: [string, string][];
  hasBody: boolean;
};
export type ReqEndFrame = { t: "req-end"; id: number };
export type CancelFrame = { t: "cancel"; id: number };
export type ResFrame = {
  t: "res";
  id: number;
  status: number;
  statusText?: string;
  headers: [string, string][];
};
export type ResEndFrame = { t: "res-end"; id: number };
export type ErrorFrame = { t: "error"; id: number; message: string };

export type ControlFrame =
  | HelloFrame
  | ReadyFrame
  | DeniedFrame
  | PingFrame
  | PongFrame
  | ReqFrame
  | ReqEndFrame
  | CancelFrame
  | ResFrame
  | ResEndFrame
  | ErrorFrame;

export function encodeControl(frame: ControlFrame): string {
  return JSON.stringify(frame);
}
export function decodeControl(text: string): ControlFrame {
  return JSON.parse(text) as ControlFrame;
}

// ── Body frames (binary) ─────────────────────────────────────────────────────

export const BODY_REQ = 0x01; // relay → connector: a chunk of the request body
export const BODY_RES = 0x02; // connector → relay: a chunk of the response body

export function encodeBody(type: number, id: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + payload.byteLength);
  out[0] = type;
  new DataView(out.buffer).setUint32(1, id >>> 0, false);
  out.set(payload, 5);
  return out;
}

export type BodyFrame = { type: number; id: number; payload: Uint8Array };

export function decodeBody(buf: Uint8Array): BodyFrame | null {
  if (buf.byteLength < 5) return null;
  const id = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(1, false);
  return { type: buf[0]!, id, payload: buf.subarray(5) };
}

// ── Header hygiene ────────────────────────────────────────────────────────────

export const STRIPPED_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
]);

export function sanitizeHeaders(headers: Iterable<[string, string]>): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of headers) {
    if (!STRIPPED_HEADERS.has(k.toLowerCase())) out.push([k, v]);
  }
  return out;
}
