# tools/capture

A small **Playwright** harness for capturing real screenshots / videos of the running apps — the admin UI
(`:3001`), the tv-web player (`:3002`), and (optionally) the marketing/docs site — for getairwave.tv assets
and App Store candidates. Standalone (outside the pnpm workspace).

## Setup

```bash
cd tools/capture
pnpm install --ignore-workspace
pnpm exec playwright install chromium
```

## Sign in once (persists the session)

Start the servers (`:3000` server, `:3001` admin, `:3002` tv-web), then:

```bash
pnpm run signin
```

Opens two headed tabs (admin + tv-web) — sign into both (Plex OAuth / device code), come back and press
ENTER. Cookies + localStorage are saved to `.auth/state.json` (gitignored). Every capture script reuses it,
so runs stay logged in. Re-run when the session expires.

- tv-web keeps a stable `cg-device-id` and a `cg-caps-done` flag in localStorage, so the capability
  diagnostic does **not** re-run on capture (as long as you completed it once during sign-in).

## Capture

```bash
pnpm run admin      # admin routes — dark theme, 1920×1080
pnpm run channel    # focused, padded shots of a channel's filter / preview / schedule frames
pnpm run tvweb      # tv-web guide — tv4k (1920×1080 @2 → 3840×2160, real-TV look)
```

Output lands in `apps/site/public/screenshots/_captures/` (a gitignored staging dir) — promote the keepers
by hand.

## Building on it

- `lib.ts` — `open()` (viewport preset + dark theme + saved session + optional video), `settle()` (wait for
  network idle / fonts / "Loading…" gone), `shoot()` (full page), `shootEl()` (focused element shot with a
  bg-colored buffer), `frame(title)` (locate a `Frame` by its title), `smoothScroll()` (for recorded videos),
  `toMp4()` / `toGif()` (ffmpeg conversion of recorded `.webm`).
- `config.ts` — URLs, viewport presets (`desktop` 1920×1080, `tv4k`, `ipad`, …), output paths.
- Drive a custom flow and script it: `pnpm exec playwright codegen --load-storage=.auth/state.json http://localhost:3001`.

Requires `ffmpeg` on PATH for padded shots / video conversion.
