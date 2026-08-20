import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { apiFetch } from "./api-fetch";
import { getStoredServerUrl } from "./server-url";
import { getToken, setToken } from "./token";

export { getToken, setToken } from "./token";

/**
 * better-auth React client — the SAME machinery the admin web uses, configured for **bearer** auth
 * (TV clients use tokens, not cookies): capture `set-auth-token` on every successful call and send it
 * back as `Authorization: Bearer`. `deviceAuthorizationClient()` gives the Airwave device-code login
 * (`authClient().device.*`) for non-Plex users.
 *
 * Two tv-tauri seams vs tv-web:
 *  - **Lazy singleton.** The server URL isn't known until the store hydrates + the user onboards, so
 *    the client is built on first use (after a reload against the chosen server), not at import time.
 *  - **customFetchImpl → apiFetch (Rust).** All requests route through the Rust `api_request` command,
 *    so better-auth isn't blocked by the webview's CORS / mixed-content / HTTP-scope.
 */
// A factory (not an inline annotation) so the return type INFERS the `deviceAuthorizationClient()`
// plugin augmentation — i.e. `authClient().device.*` typechecks. Annotating the singleton with a bare
// `ReturnType<typeof createAuthClient>` would use the default generic and drop `.device`.
function makeAuthClient() {
  return createAuthClient({
    baseURL: new URL("/api/auth", getStoredServerUrl() || "http://localhost:3000").toString(),
    plugins: [deviceAuthorizationClient()],
    fetchOptions: {
      customFetchImpl: apiFetch,
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
}

let client: ReturnType<typeof makeAuthClient> | null = null;

export function authClient() {
  if (!client) client = makeAuthClient();
  return client;
}
