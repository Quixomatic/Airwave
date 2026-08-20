import { getVal, setVal, delVal } from "./store";

/**
 * The bearer token for the onboarded Airwave server. TV clients use tokens (not cookies); this one
 * lives in the tauri-plugin-store (`airwave.json`, key `token`) so it survives webview-cache clears.
 * Both the REST client (`api.ts`) and better-auth (`auth-client.ts`) read/write it here.
 */

const TOKEN_KEY = "token";

export function getToken(): string | null {
  return getVal(TOKEN_KEY) || null;
}
export function setToken(token: string | null) {
  if (token) setVal(TOKEN_KEY, token);
  else delVal(TOKEN_KEY);
}
export function hasToken(): boolean {
  return getToken() !== null;
}
