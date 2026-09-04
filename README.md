<p align="center">
  <img src="docs/screenshots/splash.gif" alt="Airwave" width="620">
</p>

# Airwave

**Turn your Plex library into your own always-on live TV.**

<p align="center">
  <a href="https://www.getairwave.tv"><b>🌐 getairwave.tv</b></a>
  &nbsp;·&nbsp; <a href="https://www.getairwave.tv/docs">Documentation</a>
  &nbsp;·&nbsp; <a href="https://www.getairwave.tv/features">Features</a>
  &nbsp;·&nbsp; <a href="https://www.getairwave.tv/faq">FAQ</a>
</p>

Airwave is a self-hostable service that builds curated, 24/7 **live TV channels** out of the media you already
own — a "90s Sitcoms" channel, a "Saturday Morning Cartoons" channel, a channel that quietly marathons your
favorite show — and streams them to a proper 10-foot TV app with a channel guide, a now/next lineup, and instant
tune-in. Think Pluto TV or an old cable box, but every channel is **yours**, running on **your** hardware, from
**your** library.

The whole system is free and open to self-host — run the server, point it at your media server, make channels.
It's yours to change and tinker with. The only paid thing is the *optional* convenience of the prebuilt
Apple TV / iPad apps on the App Store — and you're welcome to build and sideload those yourself, too.

> **Status:** actively developed, pre-1.0, and used daily on real hardware (LG webOS TV, Apple TV 4K, TrueNAS).
> See [Project status](#project-status) for what's solid vs. in progress.

![The Airwave channel guide on a TV](docs/screenshots/appletv-guide.webp)

<sub>The Aurora channel guide, running on Apple TV. More in [Screenshots](#screenshots) below.</sub>

---

## Why I built this

I built Airwave for myself — to bring back the feeling of flipping on live cable TV as a kid, and to set up
channels of good content for my own kid to grow up with. I self-host it, I use it every day, and I plan to keep
maintaining it for many years.

It goes further than the couch, too: on a recent road trip I put on a channel of mixed kids' shows for my son
instead of being stuck on one Plex title the whole drive and manually changing it — a nice variety kept him from
getting bored. That worked because Airwave streams from Plex **remotely** whenever your Plex server is reachable
from outside your network (see [Watch from anywhere](#what-it-does)).

It's yours to run and tinker with. The server, admin UI, and web/browser TV app are free and open — **change
whatever you want, that's encouraged.** You're welcome to modify the native TV apps and build/sideload your own
copies too, and **contributions and PRs are very welcome** — I'm happy to take improvements.

The one thing I ask — and the one thing the license draws a line around — is: **please don't repost my apps to the
app stores as your own.** The prebuilt, published Apple TV / iPad apps are a small paid download to hedge the time
and effort I've put in, for folks who just want to grab it and go. Everything else is free. (See [License](#license).)

## What it does

- **Channels from your library.** Define a channel by a **metadata filter** (genre, year, network, cast, rating,
  resolution, "added in the last 30 days", …), a **Plex collection**, a **Plex playlist**, or a hand-picked list
  of items. Airwave resolves it against your media server and keeps it up to date as your library grows.
- **A real, continuous schedule.** Every channel plays a deterministic, always-running lineup — like a broadcast
  station, not a shuffle button. Tune in and you join whatever's "on now," mid-program, with the correct offset;
  you can scrub back within the live buffer (DVR-style) but not skip ahead.
- **Channel strategies.** Go beyond plain shuffle or in-order: **group** by show and **rotate** across shows
  (round-robin), play **marathons**, size blocks by episode **count** or by **duration** ("~30 minutes of one
  show, then move on"), carve out a specific set (e.g. *Star Wars in release order*) with a filter, and enforce
  rules like *never repeat a show within an hour*. All deterministic and resumable.
- **Bumpers.** Optional between-program interstitials — a clean "Up Next" card with cover art — plus an optional
  **ambient music bed** you can point at a folder of tracks.
- **Per-user sharing.** Plex-style access control: give each user everything, a whole package of channels, or
  just specific channels. The admin UI is admin-only; everyone else just watches.
- **Capability-aware playback.** On first run each device measures **exactly what it can decode** (a short,
  automatic diagnostic), so Airwave direct-plays natively wherever possible and only transcodes when it must —
  4K HDR HEVC, TrueHD/DTS, the works, per device.
- **Watch from anywhere.** Off-network playback resolves the right connection to your media server
  automatically (local → remote → relay), so the same app works at home and on the road — **as long as your
  Plex server is set up for remote access** (Plex Remote Access, or a reachable domain/port). Tune in from a
  phone hotspot on a road trip and your channels just play.
- **Move channels between instances.** Export a lineup (packages + channels + filters) and import it into another
  Airwave — with dry-run and de-duplication.
- **Optional AI channel builder.** *Off by default.* If you want, bring your own API key and let an assistant
  draft channel lineups from a prompt — but everything above works fully without it, and it never phones home
  otherwise. (See [AI features](#ai-features-optional).)

---

## How it works

Airwave is a small server plus thin clients. The server does the thinking; the clients just tune in.

1. **Resolve.** A channel's definition (filter / collection / playlist / manual list) is resolved against your
   media server into a pool of playable items, with metadata cached locally.
2. **Schedule.** A deterministic engine lays that pool onto a timeline — seeded, so the same channel always
   produces the same lineup — and materializes it ahead in **windows**, auto-extending as time moves forward. A
   cursor lets it resume exactly where it left off, so a channel is watchable within seconds of creation even for
   a 2,000-episode pool. Channel **strategies** (grouping, rotation, run-length, no-repeat rules) are just a
   smarter ordering over that pool, applied at one point in the engine — still deterministic.
3. **Tune in.** Clients ask "what's on channel N right now?", get the item + the exact offset ("effective time"),
   and start playing there. There's no server-side transcode queue for the schedule itself — playback streams
   from your media server, with the device's measured capabilities deciding direct-play vs. transcode.

**One image, a few roles.** The whole backend ships as a **single Docker image** whose behavior is chosen at
runtime by `CG_ROLE`:

- `server` — the API (REST + tRPC), scheduling engine, jobs, and Plex integration.
- `web` — the admin web app (build + serve).
- `tvweb` *(optional)* — the 10-foot TV app served as an auth-gated browser player, for casting/kiosk setups.

A Postgres database and [`docker-compose.yml`](./docker-compose.yml) wire it together.

---

## Screenshots

<sub>Click any thumbnail to enlarge.</sub>

### On your TV (the 10-foot app)

<p align="center">
  <a href="docs/screenshots/appletv-guide.webp"><img src="docs/screenshots/appletv-guide.webp" width="150" alt="The Aurora channel guide"></a>
  <a href="docs/screenshots/appletv-fullchrome.webp"><img src="docs/screenshots/appletv-fullchrome.webp" width="150" alt="A channel playing with the DVR scrubber"></a>
  <a href="docs/screenshots/appletv-bumper.webp"><img src="docs/screenshots/appletv-bumper.webp" width="150" alt="The Up Next bumper card"></a>
  <a href="docs/screenshots/appletv-channelsurfing.webp"><img src="docs/screenshots/appletv-channelsurfing.webp" width="150" alt="Channel surf carousel"></a>
  <a href="docs/screenshots/appletv-sidebarfilter.webp"><img src="docs/screenshots/appletv-sidebarfilter.webp" width="150" alt="Filter the guide"></a>
  <a href="docs/screenshots/appletv-fullchrome-programinfo.webp"><img src="docs/screenshots/appletv-fullchrome-programinfo.webp" width="150" alt="Full program info"></a>
  <a href="docs/screenshots/appletv-diagnostic.webp"><img src="docs/screenshots/appletv-diagnostic.webp" width="150" alt="Device capability check"></a>
  <a href="docs/screenshots/tvweb-qrcode.webp"><img src="docs/screenshots/tvweb-qrcode.webp" width="150" alt="Sign in with a QR code"></a>
</p>

### In the admin (build & manage)

<p align="center">
  <a href="docs/screenshots/admin-channel-filter.webp"><img src="docs/screenshots/admin-channel-filter.webp" width="150" alt="Build a channel from a filter"></a>
  <a href="docs/screenshots/admin-channel-preview-and-schedule.webp"><img src="docs/screenshots/admin-channel-preview-and-schedule.webp" width="150" alt="Preview and schedule"></a>
  <a href="docs/screenshots/admin-guidepreview.webp"><img src="docs/screenshots/admin-guidepreview.webp" width="150" alt="The guide previewed in a TV mockup"></a>
  <a href="docs/screenshots/admin-channels.webp"><img src="docs/screenshots/admin-channels.webp" width="150" alt="All your channels"></a>
  <a href="docs/screenshots/admin-packages.webp"><img src="docs/screenshots/admin-packages.webp" width="150" alt="Channel packages"></a>
  <a href="docs/screenshots/admin-source.webp"><img src="docs/screenshots/admin-source.webp" width="150" alt="Connect your Plex source"></a>
  <a href="docs/screenshots/admin-users.webp"><img src="docs/screenshots/admin-users.webp" width="150" alt="Per-user access control"></a>
  <a href="docs/screenshots/admin-settings-sessions.webp"><img src="docs/screenshots/admin-settings-sessions.webp" width="150" alt="Now Playing sessions"></a>
  <a href="docs/screenshots/admin-bumpers.webp"><img src="docs/screenshots/admin-bumpers.webp" width="150" alt="Bumpers and music"></a>
  <a href="docs/screenshots/admin-settings-ai.webp"><img src="docs/screenshots/admin-settings-ai.webp" width="150" alt="AI connections"></a>
  <a href="docs/screenshots/admin-aiassistant.webp"><img src="docs/screenshots/admin-aiassistant.webp" width="150" alt="The AI assistant in action"></a>
  <a href="docs/screenshots/admin-jobs.webp"><img src="docs/screenshots/admin-jobs.webp" width="150" alt="Background jobs"></a>
  <a href="docs/screenshots/admin-importer.webp"><img src="docs/screenshots/admin-importer.webp" width="150" alt="Import a lineup"></a>
  <a href="docs/screenshots/admin-ailineupworkflow-observability.webp"><img src="docs/screenshots/admin-ailineupworkflow-observability.webp" width="150" alt="AI lineup run observability"></a>
  <a href="docs/screenshots/admin-importworkflow-observability.webp"><img src="docs/screenshots/admin-importworkflow-observability.webp" width="150" alt="Import run observability"></a>
  <a href="docs/screenshots/admin-settings-importexport.webp"><img src="docs/screenshots/admin-settings-importexport.webp" width="150" alt="Import / Export"></a>
</p>

---

## Clients

The TV app is a full 10-foot experience: an Aurora channel-guide grid, a native-first player with a DVR
scrubber, channel up/down, and the "Up Next" bumper card. The **same app** ships four ways, so features
land everywhere at once:

- **`tv-native`** — Expo / React Native + **mpv** for the living-room boxes (Apple TV, iPad, Android TV, Fire TV).
- **`tv-web`** — the same React app as a **browser player** and packaged for **LG webOS**.
- **`tv-tauri`** — a native **desktop** app (Windows/macOS/Linux) that reuses the `tv-web` React UI in a
  Tauri shell with its own bundled **libmpv**, plus desktop mouse / picture-in-picture / true fullscreen.
- **`tv-roku`** — an independent native Roku channel (BrighterScript + SceneGraph) held to strict parity.

### Platform availability

| Platform | Status | Distribution |
|---|---|---|
| **Apple TV** | ✅ Available | App Store |
| **iPad** | ✅ Available | App Store |
| **Android TV** | ✅ Available | Google Play |
| **Fire TV** | ✅ Available | Amazon Appstore |
| **LG webOS** | ✅ Available | LG Content Store |
| **Windows** | ✅ Available | native **desktop app** (Tauri + mpv) — a signed, self-updating installer |
| **macOS** | ✅ Available | the same **desktop app** (Tauri + mpv) — Apple Silicon + Intel, Developer-ID signed **and notarized**, self-updating |
| **Roku** | ✅ Built | native Roku channel (running on real hardware; Channel Store submission to come) |
| **Any browser** | ✅ Live now | the `tvweb` Docker role — an auth-gated web player (this is what runs at [tv.turboforge.io](https://tv.turboforge.io), served from the compose stack) |
| **Linux** | 🔜 Coming soon | the same desktop app (Tauri + mpv) — build target next |
| **Samsung (Tizen)** | 🔜 Coming soon | — |

The native apps are distributed through their platform stores (a small paid download — see
[Why I built this](#why-i-built-this)). Because Airwave is source-available, you can also **build and
sideload** any of them yourself. The browser player and the self-hosted server work today, for free.

Plus the **admin web** app (any browser) to create channels & packages, manage users/bumpers, run jobs,
and preview lineups.

---

## Requirements

- A **media server** — **Plex** today (Jellyfin/Emby support is on the roadmap).
- **Docker** + **PostgreSQL** (the compose file includes Postgres).
- Somewhere to run it — a NAS (TrueNAS is well-tested), a home server, a VPS, etc. Multi-arch images mean
  amd64 **and** arm64 (Raspberry Pi-class hardware) both work.

---

## Self-hosting

Two ways to run the Airwave **server** (they host the exact same thing — pick whichever fits):

- **🖥️ One-click desktop installer** — the easiest path, no Docker. **Airwave Desktop** (`apps/desktop`) is
  a native tray app that bundles the server, admin UI, browser TV player, and an **embedded PostgreSQL**
  into a single signed installer for Windows / macOS / Linux — install it next to Plex and it just runs.
  Grab it from the [Releases](https://github.com/Quixomatic/Airwave/releases).
- **🐳 Docker / compose** — the flexible path for a NAS, home server, or VPS (below).

> Not to be confused with the desktop **client** (`tv-tauri`) in the platform table above — that's a
> *viewer* app you install to watch. Airwave Desktop here is the *server*.

### Docker — quick start (Dockge or `docker compose`)

1. **Grab the stack files** — [`docker-compose.yml`](./docker-compose.yml) and [`.env.example`](./.env.example).
   In Dockge: create a stack, paste the compose, then the env.
2. **Copy `.env.example` → `.env`** and set at minimum:
   - `SERVER_PUBLIC_URL` / `WEB_PUBLIC_URL` — the addresses your **browser and TV** use (your host's LAN IP or a
     domain + the published ports), e.g. `http://192.168.1.50:36020` and `http://192.168.1.50:36021`. **Not**
     `localhost` unless you only browse from the host — these are baked into the admin build and used for
     auth/CORS.
   - `SERVER_PORT` / `WEB_PORT` — published host ports (must match the URLs above).
   - `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` (`openssl rand -base64 48`).
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — seeds the first admin on first boot.
   - `PUID` / `PGID` / `TZ` — match your host (important on TrueNAS datasets).
3. **Deploy:**
   ```bash
   docker compose up -d
   ```
   The `server` applies DB migrations (`prisma migrate deploy`) then starts. The `web` service builds the admin
   SPA against `SERVER_PUBLIC_URL` on first boot (takes a minute), then serves it.
4. **Open the admin** at `WEB_PUBLIC_URL`, sign in with the seeded admin, connect your Plex source, and run a
   metadata sync.
5. **Make a channel**, then **open the TV app** → it scans your LAN for the server (or enter `SERVER_PUBLIC_URL`
   manually) → sign in → watch.

### Image

Published to GHCR, multi-arch (amd64 + arm64): **`ghcr.io/quixomatic/airwave`**. Update with:

```bash
docker compose pull && docker compose up -d   # migrations apply automatically on start
```

### Build the image yourself

```bash
# stage the capability-probe clips (baked in for the TV diagnostic), then build:
gh release download media-v1 -p capability-media.tar.gz -D docker/cap-media
docker build -t airwave:local .
```
Set `CG_IMAGE=airwave:local` in your `.env` to run the local build.

---

## Development

Airwave is a **pnpm + Turborepo monorepo** on the [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).

### Prerequisites

- [Bun](https://bun.sh) and [pnpm](https://pnpm.io), Node 22+
- A local PostgreSQL (or point at any Postgres via `apps/server/.env`)

### Setup

The fastest path is the interactive setup wizard. It checks prerequisites, writes the `.env`
files (generating `BETTER_AUTH_SECRET`), wires the workflow engine at your Postgres, applies
migrations, and can optionally install the Rust toolchain for the desktop client:

```bash
pnpm install
pnpm dev:setup          # interactive first-run setup (add --dry-run to preview, writes nothing)
pnpm dev:core           # server + admin web + tv-web
```

Prefer to do it by hand? The wizard just automates this:

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # then fill in the values (see below)
cp apps/web/.env.example    apps/web/.env       # set VITE_SERVER_URL
pnpm run db:migrate     # apply committed migrations
pnpm run dev            # start everything (server + admin web)
```

- Admin web → http://localhost:3001
- API → http://localhost:3000

**Environment.** Both `.env.example` files document every variable inline. The server's required set —
`DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ chars), `BETTER_AUTH_URL`, `CORS_ORIGIN` — is validated at
boot (`packages/env/src/server.ts`), so the server refuses to start if any is missing. Also set
`ADMIN_EMAIL` + `ADMIN_PASSWORD` to seed the first admin — there's no public sign-up. The AI provider
keys are **not** env vars; add them in the admin UI (Settings → AI Assistant), stored encrypted.

> **Dev variants.** `pnpm dev` boots *everything* (server, admin web, tv-web, site, tv-native, tv-tauri) —
> heavy, and `tv-tauri` needs a Rust `cargo` toolchain (without it turbo tears the other dev servers down
> with it). For day-to-day work use **`pnpm dev:core`**, which boots just the **server + admin web + tv-web**.
> To test the packaged **desktop supervisor** (server + admin + tv-web + embedded Postgres in an Electrobun
> tray), run **`pnpm dev:desktop`** — it isn't part of `pnpm dev`.

> Schema changes go through **Prisma migrations** (`pnpm db:migrate` creates + applies one). `db:push` is for
> throwaway experiments only; Docker/production runs `prisma migrate deploy`.

### Project structure

```
airwave/
├── apps/
│   ├── server/      # API (Hono, tRPC + REST), scheduling engine, jobs, Plex integration
│   ├── web/         # Admin web app (React + TanStack Router)
│   ├── tv-web/      # 10-foot TV app for webOS + browser (Vite) — also reused by tv-tauri
│   ├── tv-native/   # Native TV app (Expo/React Native): Apple TV, iPad, Android TV, Fire TV
│   ├── tv-tauri/    # Native desktop client (Tauri + React/Vite + libmpv): Windows/macOS/Linux
│   ├── tv-roku/     # Native Roku channel (BrighterScript + SceneGraph) — its own codebase
│   ├── desktop/     # Airwave Desktop: one-click server installer (Electrobun + embedded Postgres)
│   └── site/        # getairwave.tv marketing + docs site (Next.js)
└── packages/
    ├── api/         # Business logic / services (scheduling, plex, bumpers, access, …)
    ├── auth/        # Better-Auth config (Plex OAuth + roles, device-code login)
    ├── db/          # Prisma schema, migrations, generated client
    ├── ui/          # Shared shadcn/ui primitives + design tokens (used by web apps)
    ├── env/         # Typed environment loading
    ├── config/      # Shared TS/build config
    ├── mpv-player/  # Native mpv player module (video + headless audio) for tv-native
    └── key-input/   # Native remote/hardware-key input module for tv-native
```

### Handy scripts

| Script | Does |
|---|---|
| `pnpm dev:setup` | interactive first-run setup wizard (`--dry-run` to preview) |
| `pnpm dev` | start all apps in dev |
| `pnpm dev:core` | server + admin web + tv-web (day-to-day) |
| `pnpm dev:server` / `pnpm dev:web` | start just one |
| `pnpm build` | build all apps |
| `pnpm check-types` | typecheck across the monorepo |
| `pnpm db:migrate` / `db:studio` / `db:generate` | Prisma migrate / studio / client |

The web apps share shadcn/ui primitives via `@airwave/ui` — edit tokens in `packages/ui/src/styles/globals.css`,
primitives in `packages/ui/src/components/*`. Import them with `import { Button } from "@airwave/ui/components/button"`.

### Documentation

Full guides and "how it works" docs live in **[`docs/`](docs/)** (see the [index](docs/README.md)):

- New here? Start with **[Getting started](docs/getting-started.md)** — connect a source → build a channel → watch.
- **Using it:** [sources](docs/sources.md) · [channels](docs/channels.md) · [packages](docs/packages.md) · [users & access](docs/users-and-access.md) · [AI assistant](docs/ai-assistant.md) · [sessions](docs/sessions.md) · [import/export](docs/import-export.md)
- **Internals:** [jobs](docs/jobs.md) · [durable workflows](docs/workflows.md) · [capability diagnostic](docs/capability-diagnostic.md)

More subsystem docs (the apps + stacks, the scheduling engine, playback) are on the way.

---

## Tech stack

- **Runtime/server:** Bun, [Hono](https://hono.dev), tRPC + REST
- **Data:** PostgreSQL + [Prisma](https://www.prisma.io)
- **Auth:** [Better-Auth](https://www.better-auth.com) (Plex OAuth + roles, TV device-code login)
- **Web:** React, TanStack Router/Query, TailwindCSS, shadcn/ui
- **Native TV:** Expo / React Native (react-native-tvos) with an **mpv** playback engine
- **Desktop client:** Tauri (Rust) + React/Vite + **libmpv**; **Roku:** BrighterScript + SceneGraph
- **Monorepo:** pnpm workspaces + Turborepo

---

## Project status

Built and proven in real use:

- Plex integration, filter/collection/playlist/manual channel definitions
- Deterministic continuous scheduling with windowed builds + resume
- Channel strategies (grouping, rotation, count/duration runs, no-repeat, marathons)
- Bumpers (interstitials + optional ambient music library)
- Per-user access control + admin-only admin UI
- Capability diagnostic + native-first playback (mpv); off-network local/remote/relay
- Lineup import/export between instances
- Native apps running on iPad, Apple TV 4K, Android TV, Fire TV, LG webOS, **Roku**, and a **Windows + macOS
  desktop** client (Tauri + libmpv; Apple Silicon + Intel, signed + notarized, self-updating installers)
- Self-host on TrueNAS **or** the one-click **Airwave Desktop** installer (bundled server + embedded Postgres)

On the roadmap / in progress:

- Rotation **weighting + freshness** (make a show air more/less often; surface just-added episodes)
- **Jellyfin / Emby** media-server support
- **Linux** desktop client + **Samsung (Tizen)** client; **Roku** Channel Store submission; macOS HDR-EDR on HDR displays
- A manual schedule editor and general pre-1.0 polish

---

## AI features (optional)

Airwave has an **optional** AI assistant for authoring channels — and it's genuinely optional: none of the core
product (channels, scheduling, playback, apps) depends on it, and **nothing is sent to any AI provider unless you
set one up**.

- **The assistant/chat** activates only when an admin adds an **AI connection** in the admin — *your* provider
  and *your* API key (Anthropic, OpenAI, Google, or any OpenAI-compatible endpoint). No connection → no
  assistant, and no external calls.
- The heavier **durable workflows** — the multi-agent AI *lineup generator* and the *lineup import/export*
  engine — additionally require `WORKFLOW_ENABLED=1` (off by default). This flag gates the workflow engine
  itself, not the chat.

Bring-your-own-key, opt-in, and fully separable — a convenience for authoring, not a dependency.

---

## Contributing

Airwave is source-available so you can make it your own: fork it and change whatever you like, no
permission needed. If you want to contribute **back**, pull requests are welcome for real fixes and
enhancements. Please skim **[CONTRIBUTING.md](./CONTRIBUTING.md)** first (short version: small housekeeping
changes are better raised as an issue than a PR, and for anything substantial, open an issue before you
build). Taking part means following the [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## License

Airwave is **source-available** under the [PolyForm Perimeter License 1.0.1](./LICENSE). In plain terms: use it,
self-host it, change it, and build your own copies freely — for **any purpose except providing a product that
competes with Airwave** (which includes republishing/reselling the apps or offering a competing hosted service).

| ✅ You can | ❌ You can't |
|---|---|
| Self-host the whole thing (server, admin, web/browser TV) — free | Repost/republish the apps to an app store (Apple / Google / LG) |
| Read, modify, and change **any** part — encouraged | Sell it, or offer it as a paid product/download |
| Build & sideload your own apps, with your own tweaks | Offer a hosted service that substitutes for Airwave |
| Use it for any purpose — personal, family, or business self-host | Remove the copyright / required-notice line |
| Open pull requests — contributions are welcome | — |

As the copyright holder, I publish the official prebuilt apps myself (a small paid convenience on the App Store).
This isn't legal advice — the [LICENSE](./LICENSE) is the authoritative text.

---

## Acknowledgements

Inspired by the self-hosted "make your own live TV" community (NostalgeX / BunnyEars and friends), built on
[Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).
</content>
