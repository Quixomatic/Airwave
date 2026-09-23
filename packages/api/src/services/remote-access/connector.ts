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
import { getRemoteAccess } from "./remote-access";

/** This server's own loopback origin — the connector forwards tunneled requests here. */
const LOCAL_ORIGIN = `http://127.0.0.1:${process.env.PORT || 3000}`;
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
  ) {}

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
      const res = await fetch(`${LOCAL_ORIGIN}${frame.url}`, {
        method: frame.method,
        headers,
        body,
        signal: abort.signal,
        redirect: "manual",
        // Streaming a request body requires half-duplex; harmless when body is undefined.
        ...(body ? ({ duplex: "half" } as Record<string, unknown>) : {}),
      });

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

// ── Singleton manager ─────────────────────────────────────────────────────────

let connector: RelayConnector | null = null;
let currentKey = ""; // url|token — so we only restart when they actually change

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
  const shouldRun = row.enabled && row.status === "bound" && !!row.tunnelSecret && !!url;

  if (!shouldRun) {
    if (connector) {
      connector.stop();
      connector = null;
      currentKey = "";
    }
    return;
  }

  const key = `${url}|${row.tunnelSecret}`;
  if (connector && key === currentKey) return; // already running with the same config
  connector?.stop();
  connector = new RelayConnector(url!, row.tunnelSecret!, row.hostname ?? osHostname());
  currentKey = key;
  connector.start();
}

export function stopConnector(): void {
  connector?.stop();
  connector = null;
  currentKey = "";
}
