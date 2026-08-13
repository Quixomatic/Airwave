import { env } from "@airwave/env/web";

/**
 * The runtime-overridable equivalent of `env.VITE_SERVER_URL` — the "build once, deploy anywhere" recipe.
 *
 * `import.meta.env` is frozen at build time, so a static SPA bundle can only ever talk to the one server URL
 * it was built for. The PACKAGED desktop app can't rebuild the admin per-launch the way `dev:desktop`/Docker do
 * (no vite ships in the installer), yet it re-resolves a free server port EVERY launch. So its supervisor
 * injects the runtime value into the served `index.html` before the app bundle runs:
 *
 *   <script>window.__AIRWAVE_ENV__ = { VITE_SERVER_URL: "http://localhost:36021" }</script>
 *
 * (See `serveDir()` in `apps/desktop/src/bun/index.ts`.) When that global is present it wins, so one prebuilt
 * admin works at whatever port/proxy the supervisor resolved this launch. When it's absent — Vercel, `pnpm dev`,
 * the `dev:desktop` vite rebuild — the baked `import.meta.env` value is used, so every existing deployment is
 * byte-for-byte unchanged. Callers keep their own trailing-slash / relative-origin handling; this only swaps
 * the SOURCE of the raw value.
 */
export function serverUrl(): string {
  if (typeof window !== "undefined") {
    const injected = (window as { __AIRWAVE_ENV__?: Record<string, string> }).__AIRWAVE_ENV__?.VITE_SERVER_URL;
    if (typeof injected === "string" && injected.trim()) return injected.trim();
  }
  return env.VITE_SERVER_URL;
}
