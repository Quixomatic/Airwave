/**
 * The Airwave Cloud connector — the self-hosted end of the relay tunnel. A pure-TypeScript module (no binary,
 * no subprocess): it dials the relay's WebSocket control channel, then forwards each request the relay sends
 * to this server's own HTTP port over loopback and streams the response back chunk-by-chunk.
 *
 * Lifecycle: started when Cloud Service is enabled + bound, stopped when disabled/unpaired. It reconnects on
 * its own with backoff. Only the control plane travels the tunnel — media is always resolved to Plex-direct
 * URIs and streamed straight from the user's Plex, never through here.
 */
import type { PrismaClient } from "@airwave/db";
import { hostname as osHostname } from "node:os";

import { env } from "@airwave/env/server";

import {
  BODY_REQ,
  BODY_RES,
  CONTROL_PATH,
  type ControlFrame,
  PROTOCOL_VERSION,
  type ReqFrame,
  decodeBody,
  decodeControl,
  encodeBody,
  encodeControl,
  sanitizeHeaders,
} from "./relay-protocol";
import { cloudServiceEnabled, getRemoteAccess } from "./remote-access";

/** This server's own loopback origin — the connector forwards tunneled requests here. */
const LOCAL_ORIGIN = `http://127.0.0.1:${process.env.PORT || 3000}`;

/** Path prefixes the SERVER owns (everything else is a static frontend). Kept short + explicit — extend here
 * if a new top-level server route is added. Matched segment-aware so e.g. "/caps" and "/caps/x" hit the
 * server but "/capsule" would not. `/api` covers `/api/auth`, `/api/v1`, `/api/health`, etc. */
const SERVER_PREFIXES = ["/api", "/trpc", "/img", "/caps", "/bumper-music"];
function isServerPath(rawUrl: string): boolean {
  const path = rawUrl.split("?")[0] ?? rawUrl;
  return SERVER_PREFIXES.some((pre) => path === pre || path.startsWith(pre + "/"));
}
function headerValue(headers: [string, string][], name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of headers) if (k.toLowerCase() === lower) return v;
  return undefined;
}

/** Where the connector fans a tunneled request: the server (API + owned routes), the admin web static
 * service, or the tv-web static service. Unset web/tvweb origins fall back to the server (today's behavior). */
export type ConnectorRouting = { webOrigin?: string; tvwebOrigin?: string; tvHost?: string };

const PING_INTERVAL_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;
const DENIED_BACKOFF_MS = 60_000;

type Inflight = {
  abort: AbortController;
  bodyController?: ReadableStreamDefaultController<Uint8Array>;
};

export class RelayConnector {
  private ws: WebSocket | null = null;
  private stopped = false;
  private backoff = 1_000;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private pingTimer?: ReturnType<typeof setInterval>;
  private readonly inflight = new Map<number, Inflight>();
  connected = false;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly serverHostname: string,
    private readonly routing: ConnectorRouting = {},
  ) {}

  /** Choose the upstream origin for a tunneled request: server for owned paths; else the tv-web service when
   * the request arrived on the tv subdomain; else the admin web service; falling back to the server. */
  private pickUpstream(frame: ReqFrame): string {
    if (isServerPath(frame.url)) return LOCAL_ORIGIN;
    const host = headerValue(frame.headers, "x-forwarded-host") ?? headerValue(frame.headers, "host");
    if (this.routing.tvHost && this.routing.tvwebOrigin && host === this.routing.tvHost) {
      return this.routing.tvwebOrigin;
    }
    return this.routing.webOrigin ?? LOCAL_ORIGIN;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.connected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.abortAll("connector stopped");
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.ws = null;
  }

  private connect(): void {
    if (this.stopped) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      console.error("[connector] bad relay URL:", (err as Error).message);
      return;
    }
    this.ws = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      this.send(
        encodeControl({
          t: "hello",
          v: PROTOCOL_VERSION,
          token: this.token,
          hostname: this.serverHostname,
          clientVersion: process.env.npm_package_version,
        }),
      );
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === "string") this.onControl(ev.data);
      else this.onBody(new Uint8Array(ev.data as ArrayBuffer));
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    };
    ws.onclose = () => {
      this.connected = false;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.abortAll("relay disconnected");
      this.ws = null;
      this.scheduleReconnect(this.backoff);
    };
  }

  private scheduleReconnect(delay: number): void {
    if (this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.send(encodeControl({ t: "ping" })), PING_INTERVAL_MS);
  }

  private send(data: string | Uint8Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
  }

  private abortAll(reason: string): void {
    for (const f of this.inflight.values()) f.abort.abort(new Error(reason));
    this.inflight.clear();
  }

  private onControl(text: string): void {
    let frame: ControlFrame;
    try {
      frame = decodeControl(text);
    } catch {
      return;
    }
    switch (frame.t) {
      case "ready":
        this.connected = true;
        this.backoff = 1_000; // reset on a good connection
        this.startPing();
        console.info(`[connector] tunnel up: ${frame.subdomain}.${frame.relayHost}`);
        return;
      case "denied":
        this.connected = false;
        console.warn(`[connector] relay denied: ${frame.reason}`);
        // Back off longer — a denial is usually a lapsed sub / unpair, not a transient blip.
        this.backoff = DENIED_BACKOFF_MS;
        return;
      case "ping":
        this.send(encodeControl({ t: "pong" }));
        return;
      case "pong":
        return;
      case "req":
        void this.handleRequest(frame);
        return;
      case "req-end": {
        const f = this.inflight.get(frame.id);
        if (f?.bodyController) {
          try {
            f.bodyController.close();
          } catch {
            /* already closed */
          }
          f.bodyController = undefined;
        }
        return;
      }
      case "cancel": {
        const f = this.inflight.get(frame.id);
        if (f) {
          f.abort.abort(new Error("cancelled by relay"));
          this.inflight.delete(frame.id);
        }
        return;
      }
      default:
        return;
    }
  }

  private onBody(buf: Uint8Array): void {
    const frame = decodeBody(buf);
    if (!frame || frame.type !== BODY_REQ) return; // connector only receives REQUEST body chunks
    const f = this.inflight.get(frame.id);
    if (!f?.bodyController) return;
    try {
      f.bodyController.enqueue(new Uint8Array(frame.payload)); // copy: the view may be reused
    } catch {
      /* stream closed */
    }
  }

  /** Forward one tunneled request to the local server and stream the response back to the relay. */
  private async handleRequest(frame: ReqFrame): Promise<void> {
    const abort = new AbortController();
    const inflight: Inflight = { abort };

    // Build a request-body stream up front (fed by BODY_REQ frames) so it exists before they arrive.
    let body: ReadableStream<Uint8Array> | undefined;
    if (frame.hasBody) {
      body = new ReadableStream<Uint8Array>({
        start: (c) => {
          inflight.bodyController = c;
        },
      });
    }
    this.inflight.set(frame.id, inflight);

    // Forward headers minus Host (loopback fetch sets its own; the server reads x-forwarded-host if needed).
    const headers = new Headers();
    for (const [k, v] of frame.headers) {
      if (k.toLowerCase() !== "host") headers.append(k, v);
    }

    try {
      const upstream = this.pickUpstream(frame);
      const res = await fetch(`${upstream}${frame.url}`, {
        method: frame.method,
        headers,
        body,
        signal: abort.signal,
        redirect: "manual",
        // Streaming a request body requires half-duplex; harmless when body is undefined.
        ...(body ? ({ duplex: "half" } as Record<string, unknown>) : {}),
      });

      // Runtime-config injection for a FRONTEND's HTML shell (admin / tv-web): the connector is the serving
      // layer here, so — exactly like the desktop supervisor injects the local port — it injects the TUNNEL
      // ORIGIN as `window.__AIRWAVE_ENV__.VITE_SERVER_URL`. The SPA reads that first, so it calls back through
      // this same origin (→ relay → connector → server) instead of the LAN/localhost URL it was built with.
      // Only the small index.html is buffered; assets + all API responses stream untouched.
      const ctype = res.headers.get("content-type") ?? "";
      const isFrontend = upstream === this.routing.webOrigin || upstream === this.routing.tvwebOrigin;
      if (isFrontend && res.body && ctype.includes("text/html")) {
        const host = headerValue(frame.headers, "x-forwarded-host");
        const proto = headerValue(frame.headers, "x-forwarded-proto") ?? "https";
        const origin = host ? `${proto}://${host}` : "";
        // MERGE (not replace) so we only override VITE_SERVER_URL and preserve any other runtime-injected
        // keys the serving layer set first — e.g. the desktop supervisor's `VITE_IS_BROWSER: "true"`.
        const snippet = `<script>window.__AIRWAVE_ENV__=Object.assign({},window.__AIRWAVE_ENV__,${JSON.stringify({ VITE_SERVER_URL: origin })});</script>`;
        const original = await res.text();
        const html = original.includes("</head>")
          ? original.replace("</head>", `${snippet}</head>`)
          : snippet + original;
        const bytes = new TextEncoder().encode(html);
        // Drop content-length (the body length changed) + content-encoding (fetch already decompressed the
        // body, so a leftover gzip/br header would corrupt it). The relay sends it as a single chunk.
        const outHeaders = sanitizeHeaders(res.headers.entries()).filter(
          ([k]) => k.toLowerCase() !== "content-length" && k.toLowerCase() !== "content-encoding",
        );
        this.send(
          encodeControl({ t: "res", id: frame.id, status: res.status, statusText: res.statusText, headers: outHeaders }),
        );
        if (bytes.byteLength) this.send(encodeBody(BODY_RES, frame.id, bytes));
        this.send(encodeControl({ t: "res-end", id: frame.id }));
        return;
      }

      this.send(
        encodeControl({
          t: "res",
          id: frame.id,
          status: res.status,
          statusText: res.statusText,
          headers: sanitizeHeaders(res.headers.entries()),
        }),
      );

      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength) this.send(encodeBody(BODY_RES, frame.id, value));
        }
      }
      this.send(encodeControl({ t: "res-end", id: frame.id }));
    } catch (err) {
      if (!abort.signal.aborted) {
        this.send(encodeControl({ t: "error", id: frame.id, message: err instanceof Error ? err.message : "proxy error" }));
      }
    } finally {
      this.inflight.delete(frame.id);
    }
  }
}

// ── Singleton manager (hot-reload safe) ────────────────────────────────────────

// The connector lives on globalThis, NOT a module-level `let`. In dev, `bun --hot` re-evaluates modules on
// every change but leaves the previous module's live WebSocket + reconnect/ping timers running. A module-level
// singleton would reset to null on each re-eval, so `syncConnector` would spin up a fresh connector on top of
// the old (still-connected) one; since the relay allows one socket per server, the duplicates fight over the
// slot and reconnect forever ("tunnel up" spam). Keying off globalThis means a re-eval reuses the SAME
// connector (matching `key` → no-op), so exactly one stays connected. (Prod never hot-reloads; this is inert.)
type RelayState = { instance: RelayConnector | null; key: string };
const RELAY_STATE_KEY = Symbol.for("airwave.relayConnectorState");
const relay: RelayState = ((globalThis as Record<symbol, unknown>)[RELAY_STATE_KEY] ??= {
  instance: null,
  key: "",
}) as RelayState;

// Runs at module-eval time. On a fresh boot `relay.instance` is null (quiet); on a `bun --hot` re-eval it's
// the connector that survived the reload — log it so an unchanged "no tunnel up" line isn't mistaken for a
// dropped tunnel. The existing socket + reconnect timers keep running, so the tunnel stays up across reloads.
if (relay.instance) {
  console.info("[connector] hot-reload: keeping existing tunnel connection (still up)");
}

/** Resolve the relay WS URL: explicit override → the URL the cloud returned → derived from the cloud base. */
function resolveRelayUrl(row: { relayUrl: string | null; cloudBaseUrl: string }): string | null {
  if (env.AIRWAVE_RELAY_URL) return env.AIRWAVE_RELAY_URL;
  if (row.relayUrl) return row.relayUrl;
  try {
    const base = new URL(row.cloudBaseUrl);
    const wsScheme = base.protocol === "http:" ? "ws:" : "wss:";
    const host = base.hostname.startsWith("api.") ? `relay.${base.hostname.slice(4)}` : `relay.${base.hostname}`;
    return `${wsScheme}//${host}${CONTROL_PATH}`;
  } catch {
    return null;
  }
}

/**
 * Reconcile the connector with the current pairing state: run it when Cloud Service is enabled + bound (with
 * a tunnel secret + a resolvable relay URL), stop it otherwise. Called after enable/disable/unpair and on
 * server boot; safe to call repeatedly (only restarts when the URL or secret changes).
 */
export async function syncConnector(prisma: PrismaClient): Promise<void> {
  const row = await getRemoteAccess(prisma);
  const url = resolveRelayUrl(row);
  // Feature-flagged off → never dial (and tear down a live connector), even if a prior pairing exists.
  const shouldRun = cloudServiceEnabled() && row.enabled && row.status === "bound" && !!row.tunnelSecret && !!url;

  if (!shouldRun) {
    if (relay.instance) {
      relay.instance.stop();
      relay.instance = null;
      relay.key = "";
    }
    return;
  }

  // The tv-web reaches the tunnel at `<tvSubdomain>.<relayHost>`; the connector routes requests on that Host
  // to the tv-web service. Web/tv-web upstreams come from env (unset → fall back to the server).
  const tvHost = row.tvSubdomain && row.relayHost ? `${row.tvSubdomain}.${row.relayHost}` : undefined;
  const routing: ConnectorRouting = {
    webOrigin: env.AIRWAVE_WEB_ORIGIN,
    tvwebOrigin: env.AIRWAVE_TVWEB_ORIGIN,
    tvHost,
  };

  const key = `${url}|${row.tunnelSecret}|${routing.webOrigin ?? ""}|${routing.tvwebOrigin ?? ""}|${tvHost ?? ""}`;
  if (relay.instance && key === relay.key) return; // already running with the same config (survives hot-reload)
  relay.instance?.stop();
  relay.instance = new RelayConnector(url!, row.tunnelSecret!, row.hostname ?? osHostname(), routing);
  relay.key = key;
  relay.instance.start();
}

export function stopConnector(): void {
  relay.instance?.stop();
  relay.instance = null;
  relay.key = "";
}
