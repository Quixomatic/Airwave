# Airwave promo video (`tools/promo`)

The Airwave sizzle reel, built with [Remotion](https://remotion.dev) (React + Tailwind v4 + `motion`).
Renders a 1920x1080, 60fps, ~61.6s hero reel from our screenshots + demo clips, on the getairwave.tv brand.

**Standalone project, deliberately OUTSIDE the pnpm workspaces** — it's a marketing tool, not shipped in any
app, so it never gets version-bumped, booted by `pnpm dev`, or built with the monorepo. It has its own
`node_modules` + lockfile.

## Setup

```bash
cd tools/promo
pnpm install --ignore-workspace   # own node_modules; won't touch the monorepo
pnpm rebuild esbuild              # Remotion needs esbuild's native binary (pnpm blocks its build script)
```

## Commands

```bash
pnpm studio         # live browser preview — scrub the whole reel instantly (best for iterating)
pnpm render         # render to out/reel.mp4 on the GPU (--gl=angle --concurrency=4) — fast
pnpm render:cpu     # software fallback (--concurrency=20) if the GPU path misbehaves
```

- Rendered MP4s go to `out/` (gitignored). Media is served from `assets/` via `staticFile()` (see
  `remotion.config.ts` `setPublicDir`).
- **GPU note:** `--gl=angle` at high concurrency crashes (ANGLE memory leak x many heavy-blur tabs), so the GPU
  path runs at concurrency 4. The 208px blob blur is the main per-frame cost. `EPERM: rename ...in-progress`
  means the output mp4 is open in a player — close it or render to a fresh name.

## Structure

- `src/Root.tsx` — the `AirwaveHero` `<Composition>` (1920x1080, 60fps).
- `src/Reel.tsx` — sequences Intro -> Features -> Outro.
- `src/theme.ts` — brand colors, fonts, the `FEATURES` list, and glass-frame geometry.
- `src/components/` — `Intro` (Logo splash), `SectionText` (apps/site SectionHeader styling), `Features`
  (two-column: text + the persistent aspect-morphing glass media frame with blur-swap), `Outro` (wordmark
  lockup + two static platform tile rows), `BlobBg` (GuideEngine "organic" blob SVG, recolored).
- `src/styles.css` — Tailwind v4 `@import` + brand `@theme` tokens. `src/fonts.ts` — loads bundled Inter.
- `assets/` — demo clips (`video/`, from `apps/site/public/demos`), `screenshots/`, `brand/`, `fonts/`.

## Brand

Pulled from `apps/site` (getairwave.tv): deep-navy surfaces (`#060a14`) + sky-blue accent (`#4a9fe0`); display
= the Avenir Next system stack; body = Inter; mono = system. Platform icons via `react-icons` (same set as the
site home page).

## Roadmap / next

- Better/cleaner demo clips; swap in admin-UI recordings for Build / Organize / Optional-AI.
- Background music bed + voiceover (Remotion `<Audio>` + volume automation; source/TTS via the media skill).
- A vertical (9:16) social cut, reusing these scenes.
