import { expoClient } from "@better-auth/expo/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

import { getServerUrl } from "./auth";

/**
 * The better-auth client — the native equivalent of tv-web's `auth-client.ts`, for the
 * "Log in with a code" device-authorization flow. Same `authClient.device.code/token` API as
 * tv-web, plus `@better-auth/expo` for native session storage (SecureStore) and the deep-link
 * `scheme`.
 *
 * Unlike tv-web (where `SERVER_URL` is known synchronously at module load from localStorage), the
 * native server URL is hydrated asynchronously at startup — so the client is built lazily and
 * rebuilt if the server changes. Callers use `authClient()` at the moment of use, by which point
 * the session is loaded.
 */
function make(url: string) {
  return createAuthClient({
    baseURL: `${url}/api/auth`,
    plugins: [
      expoClient({ scheme: "channelguide", storagePrefix: "cg", storage: SecureStore }),
      deviceAuthorizationClient(),
    ],
  });
}

let cached: ReturnType<typeof make> | null = null;
let cachedUrl = "";

export function authClient() {
  const url = getServerUrl();
  if (!cached || cachedUrl !== url) {
    cachedUrl = url;
    cached = make(url || "http://localhost");
  }
  return cached;
}
