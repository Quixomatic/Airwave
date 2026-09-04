# Airwave promo video (`tools/promo`)

The Airwave sizzle reel, built with [HyperFrames](https://github.com/heygen-com/hyperframes)
(HeyGen's open-source HTML/CSS/GSAP -> MP4 renderer). It stitches our screenshots and demo clips
into a polished, on-brand showcase.

**This is a standalone marketing/dev tool, deliberately OUTSIDE the pnpm workspaces.** It is not in
`apps/*` or `packages/*`, so it is never swept into the version-bump lockstep, `pnpm dev`, or the app
builds. It manages its own deps and renders here.

## Targets

- **16:9 hero** (1920x1080), ~45-70s — for getairwave.tv, YouTube, the README. *(build first)*
- **Vertical cut** (1080x1920), ~20-40s — derived from the same scenes/assets afterward.

## Vibe

Sleek premium product showcase: calm, screenshot-forward, soft cross-dissolves and gentle Ken-Burns
pans, the demo clips front and center, one short caption per scene. Product speaks; minimal hype.

## Brand

Everything is pulled from the marketing site (`apps/site`), the "10-foot navy" look:

- **Palette:** deep-navy surfaces (`#060a14` / `#0b1120` / `#0f1626`) + a sky-blue accent (`#4a9fe0`).
- **Type:** display/title = the Avenir Next system stack the site uses; body = Inter (`Inter-Bold.ttf`
  bundled in `assets/fonts`); mono/eyebrow labels = system monospace.
- Use the tokens and helper classes in **`brand.css`** (`.scene`, `.scene--hero`, `.title`,
  `.subtitle`, `.eyebrow`, `.shot`, `.accent-bar`, `.chip`, `.vignette`). Import it in every scene.

## Assets (`assets/`)

- `screenshots/` — the full set of product screenshots (from `docs/screenshots`).
- `video/` — the site's feature demo clips (from `apps/site/public/demos`), all 1920x1078 16:9, 4-10s:
  `guide-surf` (guide navigation), `tune-in-info` (tune in + program info), `restart` (DVR restart),
  `channel-surf` (channel surfing), `dvr-bumper` (DVR + Up Next bumper), `filtered-pick` (building a
  channel from a filter), `lenses` (package guide lenses), `mini-player` (mini player). Plus
  `dev-setup.mp4`, the `pnpm dev:setup` wizard recording (portrait; ideal for the vertical cut).
- `brand/` — transparent wordmarks (row + column), the `splash` animation, and the logo mark.
- `fonts/Inter-Bold.ttf` — bundled so the render embeds Inter deterministically.

## Suggested scene flow (16:9)

Lead with the motion demos (`assets/video/*.mp4`); use screenshots as accents/holds between them.

1. **Intro** — wordmark on the radial-navy hero (`splash` / `wordmark-column-transparent.png`), tagline
   "Turn your Plex library into your own always-on live TV."
2. **The guide** — `guide-surf.mp4`, caption "A real channel guide, from your own library."
3. **Tune in** — `tune-in-info.mp4`, "Join what's on now, mid-program."
4. **DVR** — `restart.mp4`, "Rewind, restart, jump to live."
5. **Channel surf** — `channel-surf.mp4`.
6. **Bumpers** — `dvr-bumper.mp4`, "Clean 'Up Next' cards between programs."
7. **Build a channel** — `filtered-pick.mp4`, then hold on `admin-channel-preview-and-schedule` /
   `admin-guidepreview`.
8. **Organize & share** — `lenses.mp4` + `admin-packages` / `admin-users`.
9. **Everywhere** — `mini-player.mp4` + platform chips (Apple TV, iPad, Android TV, Fire TV, webOS,
   Roku, desktop).
10. **Optional AI** — `admin-aiassistant` / `admin-ailineupworkflow-observability`.
11. **Set up in one command** — `video/dev-setup.mp4` as a framed inset.
12. **Outro** — wordmark + `getairwave.tv` CTA.

## How to build it

HyperFrames is agent-driven. One-time setup (interactive; needs an agent restart):

```bash
npx skills add heygen-com/hyperframes   # choose "Core Skills" in the picker, then restart the agent
```

Then, from this folder, drive it with the router and our brief:

```
/hyperframes  Build a 1920x1080, ~60s sleek premium product-showcase reel for Airwave using the assets
in tools/promo/assets and the styling in tools/promo/brand.css. Follow the scene flow in the README.
```

Preview and render:

```bash
npx hyperframes preview                       # live browser preview
npx hyperframes render --output out/airwave-hero-16x9.mp4
```

Rendered MP4s go in `out/` (gitignored). Requires Node 22+, FFmpeg, and Chromium (Puppeteer, fetched
on first render).
