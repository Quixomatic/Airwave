import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * The TV app's ChannelGuide server. Dev falls back to :3000; set VITE_SERVER_URL
 * for anything else (and eventually the LAN IP the webOS app talks to).
 */
export const SERVER_URL = (
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? "http://localhost:3000"
).replace(/\/$/, "");

/** Where we stash the bearer token (TV clients use tokens, not cookies). */
const TOKEN_KEY = "cg-tv-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * better-auth React client — the SAME machinery the admin web uses, but
 * configured for **bearer** auth instead of cookies: we capture the
 * `set-auth-token` header on every successful call and send it back as
 * `Authorization: Bearer`. `deviceAuthorizationClient()` gives us the
 * ChannelGuide device-code login (`authClient.device.*`) for non-Plex users.
 */
export const authClient = createAuthClient({
  baseURL: new URL("/api/auth", SERVER_URL).toString(),
  plugins: [deviceAuthorizationClient()],
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: () => getToken() ?? "",
    },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get("set-auth-token");
      if (token) setToken(token);
    },
  },
});

export const { useSession, signOut } = authClient;
