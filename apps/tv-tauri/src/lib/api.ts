import { fetch } from "@tauri-apps/plugin-http";
import { getStoredServerUrl } from "./server-url";
import { getVal, setVal, delVal } from "./store";

/**
 * Thin client for Airwave's REST API (`/api/v1`, bearer-auth) + onboarding. Uses the Tauri HTTP
 * plugin's `fetch` (routed through Rust) so requests aren't subject to the webview's CORS — a
 * desktop client hits arbitrary self-hosted servers. Shape ported from tv-web `lib/api.ts`; grown
 * out per phase (Phase 2 = onboarding/health + auth; guide/player land later).
 */

const TOKEN_KEY = "token";

export function getToken(): string {
  return getVal(TOKEN_KEY);
}
export function setToken(t: string) {
  setVal(TOKEN_KEY, t);
}
export function clearToken() {
  delVal(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(base: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/** REST helpers against the onboarded server. */
export const api = {
  channels: () => request<{ channels: unknown[] }>(getStoredServerUrl(), "/api/v1/channels"),
};
