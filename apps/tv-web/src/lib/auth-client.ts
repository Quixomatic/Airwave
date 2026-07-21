import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { SERVER_URL } from "./server-url";

// The server the TV app talks to — chosen during onboarding, stored on the device. Re-exported so
// existing `import { SERVER_URL } from "./auth-client"` sites keep working.
export { SERVER_URL } from "./server-url";

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
  // SERVER_URL is "" until the device is onboarded — the app renders the setup screen in that case
  // and this client is never used, but `new URL` still needs a valid base so the module can load.
  baseURL: new URL("/api/auth", SERVER_URL || "http://localhost:3000").toString(),
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
