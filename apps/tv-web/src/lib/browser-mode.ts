/**
 * Whether tv-web is running as a DESKTOP BROWSER player rather than on a real 10-foot TV.
 *
 * tv-web ships one bundle to two very different homes: a real TV (webOS / Samsung, D-pad remote, viewed
 * across a room) and a desktop browser (the Docker web player + the packaged desktop server's player, mouse +
 * keyboard, viewed at a desk). Browser mode tunes the UI for the latter — smaller scale, mouse affordances,
 * an inset sidebar — while the default stays the 10-foot design.
 *
 * We can't sniff this at runtime: LG's Magic Remote makes webOS report `pointer: fine` + `hover: hover`, so a
 * pointer/hover media query would misclassify the exact TV platform we care about. So it's an explicit env
 * flag, read through the SAME dual build-time/runtime path as the server URL (see `server-url.ts`):
 *   - the Docker web player BAKES `VITE_IS_BROWSER` at Vite build time;
 *   - the packaged desktop server INJECTS it at runtime via `window.__AIRWAVE_ENV__` (it can't bake — fresh
 *     port each launch), and the injected value wins over the baked one;
 *   - a real TV build sets neither → `false` → the 10-foot design. Safe default.
 */
function readEnv(key: string): string {
  if (typeof window !== "undefined") {
    const injected = (window as { __AIRWAVE_ENV__?: Record<string, string> }).__AIRWAVE_ENV__?.[key];
    if (typeof injected === "string" && injected.trim()) return injected.trim();
  }
  return (import.meta.env[key as keyof ImportMetaEnv] as string | undefined) ?? "";
}

/** True on the browser / desktop-server web player; false (default) on a real TV. */
export const IS_BROWSER = /^(1|true|yes|on)$/i.test(readEnv("VITE_IS_BROWSER"));
