# Changelog

All notable changes to Airwave are documented here.

## [0.13.3] - 2026-09-04

Promo — the Airwave sizzle reel, rebuilt in Remotion.

### Added
- **`tools/promo` — the Airwave promo reel (Remotion).** A 1920x1080, 60fps, ~61.6s hero reel built with
  Remotion + Tailwind v4 + Framer Motion on the getairwave.tv brand: a Logo-splash intro; two-column feature
  scenes with a persistent glass media frame that morphs to each clip's aspect (blur-masked swaps, crisp inner
  edge); an outro with the wordmark lockup + static platform tiles (Apple TV, iPad, Android TV, Fire TV, webOS,
  Roku, Windows, macOS, Docker, Linux, browser); and a GuideEngine-style animated blob backdrop. GPU rendering
  (`--gl=angle`). Standalone project, outside the pnpm workspaces (never version-bumped or built with the apps).

### Removed
- The earlier HyperFrames version of the promo (`index.html`, `hyperframes.json`, etc.), superseded by the
  Remotion build.

## [0.13.2] - 2026-09-04

Admin web — a device-code CTA on the non-admin notice so viewers (and app reviewers) aren't stranded.

### Fixed
- The **`/not-authorized`** page (where a signed-in non-admin lands) now shows a prominent **"Approve a
  device code"** button linking to `/device`. A viewer's main reason to reach the admin web is to approve a
  TV device-code sign-in, but the bare "Admin access only" notice was a dead-end — it stranded viewers, and
  repeatedly stranded App Store review (reviewers signed in, saw "admin only", and stopped without reaching
  `/device`). The button makes the next step obvious.

## [0.13.1] - 2026-09-03

Docs (getairwave.tv) — a dedicated Local Development page with a screencast of the setup wizard.

### Added
- **New "Local Development" docs page** (getairwave.tv): clone → `pnpm dev:setup` → `pnpm dev:core`,
  with an embedded screencast of the wizard, a breakdown of what it writes, the re-run / secret-safety
  behavior, the `--dry-run` preview, the by-hand alternative, and the dev-script variants. Added to the
  docs nav under a new "Development" section. Screencast at `public/screenshots/dev-setup.mp4` (trimmed
  + re-encoded with ffmpeg).

## [0.13.0] - 2026-09-03

Contributor onboarding — one interactive `pnpm dev:setup` wizard that takes a fresh clone to a
running dev stack.

### Added
- **`pnpm dev:setup` — interactive dev setup wizard** (`scripts/dev-setup.ts`, built on
  `@clack/prompts`). Checks prerequisites (Node 22+, Bun, pnpm), prompts for your Postgres (with a
  TCP reachability probe and a `?schema=public` default), seeds the first admin, and writes all four
  dev env files — `apps/server/.env`, `apps/web/.env`, `apps/tv-web/.env.local`,
  `apps/tv-native/.env.local` — from the `.env.example` templates, then applies migrations and points
  you at `pnpm dev:core`.
  - **Generates and preserves secrets.** Generates `BETTER_AUTH_SECRET` and a stable
    `PLEX_CLIENT_IDENTIFIER` on a fresh run, and *keeps* them (and your other values) on a re-run —
    regenerating the auth secret would make every stored encrypted secret undecryptable. Existing
    `.env` files are backed up to `.env.bak` before overwrite, and any extra vars you've tuned are
    preserved.
  - **Optional AI workflow engine** — one prompt enables it and wires `WORKFLOW_POSTGRES_URL` at the
    same database (its own schema), with `AI_LINEUP_BUILD_LIMIT=0` (full lineup).
  - **Optional tv-tauri desktop client** — detects the Rust toolchain and, on macOS/Linux,
    auto-installs it via rustup behind an animated progress bar; on Windows it detects and guides
    (rustup + MSVC/WebView2). Flags the non-Rust system deps rustup can't provide.
  - **`--dry-run`** walks the entire flow — prompts, the Postgres probe, and a simulated Rust-install
    progress bar — without writing a single file or touching the database.
- README: a "first run" path leading with `pnpm dev:setup`, plus `pnpm dev:setup` / `pnpm dev:core`
  entries in the scripts table.

### Changed
- `apps/server/.env.example`: the `AI_LINEUP_BUILD_LIMIT` example now shows `0` (full lineup) instead of `3`.

## [0.12.49] - 2026-09-03

AI lineup builder — slow/local models no longer time out (GitHub #22), Z.ai (GLM) as a first-class cloud
provider with a reasoning-effort knob, and run-page polish.

### Fixed
- **Slow/local models no longer time out at ~300s (GitHub #22, #21).** The AI lineup planner — and any long
  channel build — failed at ~300 seconds with a timeout at zero output tokens, which looked like the model
  being incapable. The real cause was **Bun's default 300-second `fetch` watchdog** firing on the idle AI
  request (and on the internal loopback workflow dispatch); both are now disabled for those calls. A step now
  runs as long as your hardware needs — a 35B offloaded to CPU/RAM can grind for many minutes and still finish
  — which is what finally makes the AI lineup builder complete end-to-end on modest local hardware, including
  the concurrent per-channel builds.

### Added
- **Z.ai (GLM) — first-class cloud provider.** Pick a GLM model, paste a z.ai key — like Claude/GPT, no base
  URL to configure. It's the cheapest way to run the planner: `glm-5.3-flash` is ~$0.002 per plan and the
  `*-flash` models are free, so a cloud-planner + local-worker split gives fast, near-free planning with no
  GPU. Curated GLM model dropdown, plus GLM pricing in the run cost panel.
- **Reasoning-effort knob for Z.ai (GLM).** GLM-5.3 has always-on thinking and defaults to `max` (slow, and it
  can exhaust the plan's token budget). A low / high / max dropdown on z.ai connections dials it; set **low**
  for a fast planner.
- **Auto-refresh toggle** on the AI lineup run page — turn off the live polling and update only via Refresh, so
  the server log stays clean while you read it.

### Changed
- z.ai's OpenAI-compatible API doesn't honor OpenAI's strict `json_schema` structured-output format, so Airwave
  transparently converts the lineup planner's request to JSON-object mode with the schema in the prompt — GLM
  structured output "just works" for the planner.
- Docs (getairwave.tv): local-models timeout notes corrected, a new Z.ai/GLM cloud section, and the
  run-observability page updated for the rebuilt run detail UI (fresh screenshot).

### Migration
- Adds `reasoning_effort` to `ai_connection`. No data migration.

## [0.12.48] - 2026-09-02

AI lineup builder — a dry-run preview and a planner token budget (#22), a rebuilt run-observability
page, and real-time build traces.

### Added
- **Preview AI lineup (dry run).** Runs the full pipeline — library analysis, the planner's design,
  and every per-channel filter authoring + verification against Plex — but persists **nothing** (no
  wipe, no packages, no channels, no schedules). Run it from Settings → Jobs → "Preview AI Lineup
  (dry run)"; the run detail page tags it as a dry run and reports what it *would* build (and which
  channels it would decline).
- **Planner max output tokens** setting (Settings → General, default 32000, range 4000–128000) so a
  large library or a verbose model doesn't truncate the plan. Applied per run, alongside the existing
  concurrency settings.
- **Real-time build traces.** Each channel build now opens its trace up front and streams every tool
  call into it as it happens, so the run page shows a build filling in live instead of appearing only
  when the step finishes. Best-effort — a trace write never slows or fails a build.
- **New Local & self-hosted models docs page** (getairwave.tv): the two settings that decide whether a
  local model works (tool-calling + disable-thinking), the planner's hard ~300s step-duration cap and
  how to stay under it, concurrency tuning, and a known-good config — cross-linked from the AI pages.
- `apps/server/scripts/report-run.ts` — a terminal, decoded report of any AI lineup run (args, final
  report, per-step outcomes, duplicate-build detection).

### Changed
- **AI lineup run detail page, rebuilt.** Headline stat tiles (cost / tokens / duration / channels)
  and stacked per-model token bars with hover tooltips and colour swatches; the plan as hovercard
  package tiles; each channel build as a numbered agent-transcript stepper (readable tool calls, model
  reasoning as markdown) with an attempt switcher; interactive JSON tree views; a clickable step
  timeline that jumps to and opens the matching build or the plan; single-open build cards with
  slide-open animations; run-status and dry-run badges; skeleton and empty states throughout; and
  polling that follows the run status so it no longer stalls in the gap between the plan and build
  steps.
- **Settings → Jobs** now separates Manual and Scheduled jobs into their own frames.

### Migration
- Adds `plannerMaxOutputTokens` (default 32000) to `app_settings`. No data migration.

## [0.12.47] - 2026-09-02

AI connections — a per-connection "disable thinking" toggle for local models, and a keyless-endpoint fix.

### Added
- **Disable thinking / reasoning** toggle on OpenAI-compatible (Local) AI connections (Settings → AI
  Assistant). Reasoning models otherwise burn the whole window "thinking" and time out the lineup planner at
  zero output tokens. When on, Airwave injects the no-think flag every engine understands — Ollama
  (`reasoning_effort: "none"`), vLLM / SGLang (`chat_template_kwargs.enable_thinking: false`), and OpenRouter
  (`reasoning`) — so one switch covers them all, and cloud providers never receive it. Plus an advanced
  **Extra request body (JSON)** field that's merged into every request, an escape hatch for engine-specific
  params the toggle doesn't cover.

### Fixed
- **Keyless local connections now work.** A local endpoint with no API key (Ollama, LM Studio) failed with
  "OpenAI API key is missing" because the OpenAI SDK throws when it can't load a key, even though the endpoint
  ignores it. Compatible connections now send a harmless placeholder key when none is set — affecting both the
  Test button and actual use.

### Migration
- Adds `disable_thinking` + `extra_body` columns to `ai_connection`. No data migration.

## [0.12.46] - 2026-09-02

AI lineup — actually apply the "Max parallel AI channel builds" setting (GitHub #21).

### Fixed
- The **"Max parallel AI channel builds"** setting (Settings → General, added in 0.12.40) was ignored: the
  admin "Build with AI" button runs the `ai-lineup-build` **job**, and that job never forwarded the value to
  the workflow, so every run fell back to the hardcoded default of 6 concurrent builds. (The `ai.buildLineup`
  tRPC mutation that *did* forward it has no caller.) The job now reads `AppSettings.channelBuildConcurrency`
  and passes it into the run, so lowering the setting (e.g. to 1 or 2 for a slow local model) takes effect on
  the next run. No rebuild needed — it's a runtime argument. Thanks to @area51tazz for the precise diagnosis.

## [0.12.45] - 2026-09-02

Site (getairwave.tv) — reflect the new Fire TV, Roku, and Android TV store availability.

### Changed
- **Fire TV** and **Roku** are now live on their stores. Added the Amazon Appstore and Roku Channel Store
  links to `lib/store-links.ts`, and updated the downloads table so Fire TV points at the Amazon Appstore and
  Roku points at the Roku Channel Store (both "Available", no longer "In review" / "Sideload").
- The **platforms matrix** now lists **Android TV, Fire TV, and Roku** as **Full support** (were "Supported").
- The **home page** platform grid marks **Fire TV** as Ready, and the platforms/downloads docs prose was
  refreshed to say Airwave is live on Apple TV, Fire TV, and Roku (iPad in App Store review, Android TV /
  Google TV in closed testing on Google Play, webOS by sideload).

## [0.12.44] - 2026-09-02

Admin — stop the setup checklist from polling every 5s forever.

### Fixed
- The onboarding checklist in the sidebar polled `onboarding.status` every 5 seconds indefinitely, even after
  every step was done (a constant trickle of requests visible in the server log at idle). It now polls fast
  (5s) only while setup is still in progress, where the live sync spinner and step ticks need it, and drops to
  a lazy 30s cadence once all steps are complete (from there the state only changes on a deliberate action).

## [0.12.43] - 2026-09-02

Channels (admin) — preview the show list from your UNSAVED filter, before saving (GitHub #12).

### Added
- The channel **Preview** now resolves the filter you're currently editing, so you can see what your
  conditions catch **without saving first**. It updates automatically a moment after you edit (debounced),
  and each new resolve cancels the previous in-flight request so rapid edits don't stack up or hang. There's
  also a manual **Update preview** button. On the edit page the saved-filter preview still loads on open,
  unchanged.
- Preview now works on the **New channel** page too, before the channel exists, artwork included. A new
  source-keyed artwork proxy (`/img/source/:sourceId`) serves posters when there's no channel to key on yet.
- Layout-matched **loading skeletons** for the preview (metric line, poster tiles, title/subtitle bars) using
  the shared `Skeleton` component. A reload shows the same number of skeletons as the results on screen; the
  first load shows a single row. Empty and "nothing to preview yet" states use the shared `EmptyState`.

### Notes
- To avoid hammering Plex, the automatic preview only fires once a filter condition actually has a value; a
  brand-new, empty filter (which would resolve the whole library) waits for the manual button.
- New tRPC query `channels.previewFilter` (resolves an ad-hoc filter, reusing the same validation as save).
  Self-hosters need the updated server image for the create-page artwork proxy and this endpoint.

## [0.12.42] - 2026-09-01

Desktop app (Airwave Desktop supervisor) — reliably reap an orphaned embedded Postgres on startup so
`pnpm dev` / relaunch never dies on "shared memory block still in use".

### Fixed
- The supervisor could fail to start the database with `FATAL: pre-existing shared memory block is still in
  use` after an unclean exit (the dev watcher SIGKILLs the supervisor, so the graceful `pg.stop()` never
  runs and Postgres is left attached to the data directory). The old reap keyed off `postmaster.pid`, which
  is exactly the file that goes missing: our own reap deleted it unconditionally even when the kill silently
  failed, and on Windows a PG18 `io_worker` child can outlive a dead postmaster while still holding the
  shared-memory block. Because that block is keyed to the **data directory** (not the port), picking a fresh
  port only guaranteed the collision.
- The supervisor now records the postmaster's PID in its runtime ledger (the same pattern already used for
  the server child) and, before binding any port, reaps a prior embedded Postgres by that PID + verified
  port ownership. It no longer deletes `postmaster.pid` (Postgres owns that file), `killTree` verifies the
  process actually died on Windows (`taskkill` can silently miss) and retries, and any orphaned `io_worker` /
  backend child of a dead postmaster is found by its recorded parent PID and killed. The freed port is
  reclaimed so the admin URL stays stable across restarts.

### Scope
- `apps/desktop/src/bun/index.ts` only. The Windows-specific child reap is a no-op on macOS/Linux, where
  Postgres already cleans up (the port frees when the postmaster dies and a fresh postmaster clears stale
  shared memory). No schema or server change.

## [0.12.41] - 2026-09-01

Desktop app (Airwave Desktop supervisor) — sensible first-run defaults, run at login, and a silent
startup mode.

### Changed
- **Onboarding now defaults "Expose on the local network" and "Enable Workflow SDK" to on.** A desktop
  Airwave is a TV server meant to be reached from the couch, so LAN exposure is the expected posture; the
  Workflow SDK powers AI lineup builds and imports. Both remain toggles you can turn off in setup or
  settings.

### Added
- **Run at login.** A new "Launch at login" toggle (in onboarding and settings, default off) registers the
  supervisor to start with the OS so the server is already up when you sit down: a per-user
  `HKCU\...\Run` entry on Windows, a `LaunchAgent` plist on macOS, and a `~/.config/autostart` desktop
  entry on Linux. It points at the real user-facing launcher, applies immediately when toggled, and is a
  no-op in development. Turning it off removes the entry.
- **Silent startup.** A new "Silent startup" toggle (default off) stops the app from opening the browser to
  the admin UI on every boot, for a quiet Plex-like background server. Paired with "Launch at login" it
  boots straight into the tray at login with no popup. The tray "Open Admin" item (and a manual relaunch)
  still open the browser on demand.

## [0.12.40] - 2026-09-01

AI channel building — fix filter tool calls on local models, and add configurable build/import concurrency
(GitHub #3).

### Fixed
- **AI channel filters now work on local models** (LM Studio, Ollama, vLLM, and other OpenAI-compatible servers).
  With `tool_choice: "auto"` (what the agent uses), those servers free-form the tool call and return the nested
  `filter` as a JSON **string**, so it failed validation (`expected object, received string`) while cloud models
  (guided decoding) were fine. The filter schema the AI sees is now **one level deep and non-recursive** — removing
  the `z.lazy` self-`$ref` that free-form parsers choke on, matching what the planner already does and the admin
  builder's real one-level cap — and **tolerant of a stringified filter** (it parses + re-validates against the
  same schema). Cloud models send an object and are unaffected. New `services/agent/ai-filter-schema.ts`, applied
  to both the chat tools and the workflow worker; the operator field is standardized to the canonical enum.

### Added
- **Configurable parallelism for AI lineup builds and imports** (#3). A new **Settings → General** section with
  two knobs — "Max parallel AI channel builds" (default 6) and "Max parallel channel imports" (default 4) — lets
  you dial concurrency down (to 1) for slow local models / hardware that can't keep up with parallel runs. Stored
  in a new singleton `AppSettings` row (general-purpose, room for future server-wide settings) and threaded into
  both WDK workflows. Adds the `@coss/number-field` component to `@airwave/ui` for the inputs.

### Migration
- Adds the `app_settings` table (one singleton row). No data migration.

## [0.12.39] - 2026-09-01

tv-native (iOS / Apple TV) — bind the remote's **Play/Pause** button to the playing channel (GitHub #16).

### Added
- The dedicated **Play/Pause** button on the Apple TV Siri remote (and any media remote / the iOS Remote app) now
  toggles the currently playing channel. It was previously unbound. The tvOS `playPause` event is normalized in
  `tvEventToKey` and routed through the **same centralized zoned dispatcher** as every other key; a top-priority
  `media-play-pause` key layer in the persistent player claims only `playPause` (letting all other keys fall
  through), so it works across the feature panel, channel surf, the audio/subtitle/quality picker, and the mini
  feed. Same toggle as the on-screen Pause control; active only while a program or bumper is playing.

### Notes
- iOS / tvOS only for now (Android TV's `KEYCODE_MEDIA_PLAY_PAUSE` comes through a different native path and would
  map to the same `playPause` key in a later follow-up).

## [0.12.38] - 2026-08-31

Docs site (getairwave.tv) — add a Changelog page generated from this file.

### Added
- A **`/docs/changelog`** page listing the 20 most recent releases, generated at build time from the root
  `CHANGELOG.md` (`scripts/gen-changelog-doc.mjs`, invoked from `next.config.mjs` so it runs on every dev/build,
  Vercel included). It's a real fumadocs MDX page, so it gets the automatic version **table of contents**, search
  indexing, and docs styling, and appears in the sidebar under a new **"Release notes"** group with a link to the
  full history on GitHub. The generated `content/docs/changelog.mdx` is gitignored — the root `CHANGELOG.md` stays
  the single source of truth, and every release refreshes the page on the next build.

## [0.12.37] - 2026-08-31

tv-tauri (desktop client) — keep the computer awake while video is playing, on macOS, Windows, and Linux
(GitHub #17).

### Fixed
- The desktop client no longer lets the machine or display sleep while a channel is playing. Reported on macOS
  (#17), fixed for all three desktop targets. Tauri has no first-class sleep-inhibition API, so the app now holds
  an OS wake assertion during playback via the `keepawake` crate — **IOPMAssertion** (macOS, the same mechanism
  our references use), **SetThreadExecutionState** (Windows), and **D-Bus / systemd-inhibit** (Linux). Keeps the
  **display** awake, not just the system.
- Rule: awake while a program is loaded and **not** user-paused — buffering counts as playing — and released the
  moment playback is paused, stopped, goes idle, or the app shuts down (so a paused/idle player sleeps normally).
  Driven off mpv's `pause` + `idle-active` in the event loop, on the same thread that owns the assertion.
  Fail-soft: a wake-assert failure only logs a warning and never affects playback. New `src-tauri/src/wakelock.rs`;
  desktop-scoped dependency so a mobile build won't pull it.

## [0.12.36] - 2026-08-31

tv-native (Android) — fix a flat purple screen for SDR video on the NVIDIA Shield.

### Fixed
- On **NVIDIA Shield** models, SDR H.264/HEVC content rendered as a solid purple screen with working audio. The
  Shield's custom Android 11 GPU/driver can't composite hardware-MediaCodec-decoded SDR frames through mpv's
  `gpu-next` (libplacebo) video output — a known upstream gpu-next + hwdec issue (mpv-android #1081, mpv #14934,
  findroid #686). Reported by two Shield users (issue #15); the tell was that MPEG4 SDR (software-decoded) and all
  HDR content played fine, and only hardware-decoded SDR broke.
- The SDR video output is now the classic `vo=gpu` on Shield models only (`Build.MANUFACTURER == NVIDIA` **and**
  `MODEL` contains "SHIELD"), and stays on the proven `gpu-next` everywhere else (Google TV Streamer, Sony Bravia,
  Fire TV, tablets, emulator — byte-for-byte unchanged). HDR is untouched: it uses `mediacodec_embed`, which
  already works on the Shield. Fixing the SDR renderer also clears the same purple on the bumper card (it shows
  the previous program's last frame) and the mini player (the same mpv player, scaled down).

### Scope
- `packages/mpv-player/android/.../MpvCore.kt` only — one `sdrVo` field gated on the Shield model; no JS, server,
  or schema change. iOS / tvOS / iPad / webOS / desktop are unaffected. Needs an Android build to reach devices.

## [0.12.35] - 2026-08-30

Docs site (getairwave.tv) — blog revamp + an App Store launch post.

### Added
- Rebuilt the blog list as a magazine-style feed: horizontal cards with a **required featured image**, a 2-line
  excerpt, `date · author · reading time`, a hover wash + animated title underline, and a newsletter sidebar slot.
  `image` is now a required field on the blog schema; both existing posts point at their hero screenshot.
- Blog post pages: a **centered header** (meta / title / subtitle) with a soft radial glow that fades into the
  page, a **featured image wider than the prose**, reading time, **prev/next post tiles**, and per-post
  og:image / Twitter share cards.
- Reading-time helper (`lib/reading-time.ts`, ~200 wpm from the raw MDX) and an **RSS feed** at `/blog/rss.xml`
  (linked from the blog metadata).
- New post: **"Airwave is now on the Apple TV App Store."**

### Changed
- Added section headings to the "I missed channel surfing" post so its table of contents is complete, and dated
  "Introducing Airwave" a few days earlier so the feed orders correctly.

## [0.12.34] - 2026-08-30

Docs site (getairwave.tv) — add a generated Open Graph / Twitter share image + social metadata.

### Added
- `scripts/gen-og-image.py` (Pillow, mirrors the tv-native/roku brand generators) produces the 1200×630
  share image — the Airwave mark + wordmark with a tight "Turn your Plex library into live TV" subtext on the
  navy radial gradient — into `app/opengraph-image.png` + `app/twitter-image.png` (Next's file convention wires
  `og:image` / `twitter:image` with dimensions automatically).
- `openGraph` + `twitter` (`summary_large_image`) metadata in `app/layout.tsx` so a shared getairwave.tv link
  renders a rich card.

## [0.12.33] - 2026-08-30

Docs site (getairwave.tv) — add a `robots.txt` so Google (and other crawlers) can index the site properly.

### Added
- `app/robots.ts` (a Next metadata route → served at `/robots.txt`): allows crawling, points at the dynamic
  `sitemap.xml`, sets the canonical host, and excludes `/api/` (the roadmap vote endpoint isn't content). Pairs
  with the existing `sitemap.ts` now that the site is verified in Google Search Console.

## [0.12.32] - 2026-08-30

Server — keep Plex HLS-transcode sessions alive so Plex can't reap them mid-playback (GitHub #13).

### Fixed
- On the HLS-transcode path, the server now sends Plex a liveness ping (`/video/:/transcode/universal/ping`)
  ~every 10s, driven off the watch-session heartbeat whenever a transcode session is active. Without it, Plex
  classified the stream as **paused** — Airwave intentionally sends no `/:/timeline` progress, to avoid polluting
  the owner's watch history — and on servers where **"Terminate Sessions Paused for Longer Than"**
  (`MinutesAllowedPaused`) is a non-zero value, killed the transcode after that many minutes ("Playback has been
  paused for too long"), even while the client was actively fetching segments. Playback then stalled until a skip
  forced a fresh session. Servers with that setting at 0 were unaffected, which is why it only hit some users.
- The ping is transcode-scoped (no ratingKey, no progress), so it keeps the session alive **without** reporting
  watch state to Plex (no Continue Watching / on-deck pollution) — see `.docs/playback-model.md` §8a. It runs at
  Plex's own documented 10s liveness cadence, and is fire-and-forget with a 5s timeout so it never adds latency to
  the heartbeat. New `apps/server/scripts/test-transcode-keepalive.ts` (a real A/B probe against the live Plex).

## [0.12.31] - 2026-08-29

Roku (tv-roku) — on-device login screen polish.

### Changed
- More prominent field borders on the email / password / show controls (the unfocused outline was nearly the
  background color, so it read as borderless).
- Left-aligned the email + password text so the fields read like real inputs — via a new `align` prop on
  `RoundedButton` (default stays `center`, so nothing else changes).
- "More sign-in options" now matches the "Change server" button's width + styling, and sits a uniform gap below
  Sign in.
- "Change server" is reachable from **every** view now — the form, the secondary chooser, and the QR/code pending
  view (which previously swallowed navigation).

## [0.12.30] - 2026-08-29

Admin (apps/web) — polish the TV device-approval page (`/device`) with a proper OTP field.

### Changed
- The `/device` page now uses a dedicated **4-slot OTP field** instead of a single text input: large slots,
  obviously four alphanumeric characters, auto-uppercased, with per-slot invalid styling on a bad/expired code. The
  QR pre-fill (`?user_code=`) still populates it and the approve/deny flow is unchanged.
- Added the coss **`@coss/otp-field`** component (built on Base UI) to `@airwave/ui`
  (`components/otp-field.tsx`). Only its imports were adapted to our aliases; the existing `separator.tsx` is
  untouched, and the caret-blink keyframe it uses was already in `globals.css`.

## [0.12.29] - 2026-08-28

Roku (tv-roku) — add **on-device email/password sign-in**, the fix for the Roku Channel Store rejection.

### Added
- Roku rejected the store submission (not exemptable): apps must not include *any* off-device sign-in flows, and
  our two login paths (Plex PIN, better-auth device code) both finish in a browser on a second device. The Roku
  login now leads with an **on-device email/password form** (on-screen keyboard, primary), with the Plex and code
  flows kept behind a "More sign-in options" expander (jellyfin-roku ships both and is certified). Smooth-typing
  polish: auto-advance focus (email → password → Sign in), a show/hide-password toggle, remember-email, and inline
  errors.
- New server endpoint `POST /api/tv/auth/password` (`services/auth/tv-password-link.ts`): verifies the credentials
  with better-auth's `signInEmail` and returns the same bearer the Plex/device-code flows do (in the response body,
  so the TV client's existing token handling is reused). A generic "invalid" for every auth failure (no account
  enumeration); real faults answer 502. Password hashing, verification, and rate limiting stay with better-auth.
- Real test `apps/server/scripts/test-tv-password-login.ts` (mints a throwaway user, proves the bearer validates via
  get-session, checks every failure mode). No schema change; verified on a real Roku device.

### Unchanged / next
- Roku-only plus one additive server endpoint — the Plex-first login on tv-web / tv-native / webOS is untouched.
  Plex-imported users (who have no password) will get an admin "set password" flow in a later release so they can
  use the Roku app too.

## [0.12.28] - 2026-08-28

Desktop app — the supervisor now **reclaims its own ports across restarts** instead of drifting to new ones, and
enforces a **single running instance**. Fixes the report where closing and reopening (or changing a setting, which
restarts the server) left the previous process holding the ports, so the app moved to new ones and the admin URL
changed.

### Fixed
- **Ports no longer drift on restart.** The supervisor records the server child it spawned (and the ports it
  bound) in a small `runtime.json`. On the next launch — before anything binds — it reaps that recorded server if
  it's still alive from an unclean exit (crash / force-quit) and reclaims the same ports, so the admin URL and the
  tray "Server:" line stay stable. This mirrors the existing embedded-Postgres reap (`postmaster.pid`), extended
  to the server process.
- **Settings → Save no longer races the old server.** Stopping the stack now waits for the server child's whole
  process tree to actually exit (`killTree` + await) before restarting, instead of firing a kill and moving on —
  so the immediate restart can't collide with a still-draining server on the same port.
- **Only one instance runs.** A second launch that finds a live prior supervisor (verified — see below) opens that
  running instance's admin and exits, instead of spinning up a parallel stack on shifted ports.

### Safety
- **Only ever kills a process we started AND that provably still holds the port.** Ownership is verified with
  `netstat` (Windows) / `lsof` → `ss` fallback (macOS/Linux) before any kill, so a recycled PID or an unrelated
  app that happens to hold the port is never touched. If a probe is unavailable it returns "no match" and nothing
  is reaped.
- **Cannot break startup.** A missing `runtime.json` (every fresh install / first update), a corrupt or partial
  one, a wedged probe command (4s timeout), or any unexpected error all fall through to the previous behavior:
  resolve to nearby free ports. New pure parsers (`apps/desktop/src/bun/port-probe.ts`) with unit tests; the
  Windows reap cycle and the boot-safety fallbacks are verified end-to-end.

## [0.12.27] - 2026-08-28

Docs (getairwave.tv) — document the new text-filter operators on the Channels → Filters page: the
`text` operator row now lists contains / does not contain / is exactly / is not exactly / begins with /
ends with, plus a "substring vs exact" note (including the year-in-title caveat, e.g. "Bluey (2018)").

## [0.12.26] - 2026-08-28

AI channel builder — corrected stale guidance about the title operator (worker prompt still said
`title is` was a substring match, from before exact-match existed). Now: `contains` = substring,
`equals` = exact, and a note that Plex titles often carry the year. No behavior change to resolution —
the AI chat, the lineup planner, and the workflow-SDK workers all already resolve and preview filters
through the same `buildParam` path as the admin UI.

## [0.12.25] - 2026-08-28

Channels — fix: **"is exactly" / "is not exactly" returned no results.**

### Fixed
- The exact-match operators (0.12.23) sent Plex a raw `title==value`, but Plex splits the query string on
  the first `=`, so that became field `title` = value `=value` — a substring search for the literal "=value",
  which matches nothing. Verified against a real library (new `scripts/test-filter-ops.ts`): the operator's
  own `=` must be URL-encoded as `%3D`, leaving the final `=` as the separator. So **equals** now sends
  `title%3D=value` and **is not exactly** sends `title!%3D=value`; `contains` / `does not contain` /
  `begins with` / `ends with` were already correct (their only `=` is the separator). Exact match now works
  (e.g. `equals "3 Ninjas"` returns only the base film, not the sequels).
- Note: Plex titles often include the year (a show may be stored as "Bluey (2018)"), so an exact match needs
  the full stored title; use "begins with" or "contains" for looser matching.

## [0.12.24] - 2026-08-28

Channels — fix: the new exact-match operators from 0.12.23 couldn't be **saved**.

### Fixed
- Saving a channel with an `equals` / `notEquals` / `beginsWith` / `endsWith` condition failed validation
  (`Invalid option: expected one of is|isNot|gte|lte|contains|notContains`). The create/update-channel Zod
  schema (and the AI tool schema) hardcoded the old operator list. The filter operators are now a **single
  source of truth** (`FILTER_OPS` in `filter-fields.ts`): both the `FilterOp` type and every `z.enum(...)`
  validator derive from it, so an operator can never again exist in the model but be rejected on save.

## [0.12.23] - 2026-08-28

Channels — **exact-match text filtering** (is / is not / begins with / ends with), alongside the existing
contains.

### Added
- Text filter fields (Title, Episode title) now support the full set of Plex string operators, not just
  substring: **contains** / **does not contain** (the existing `=` / `!=` behavior), plus **is exactly**
  (`==`), **is not exactly** (`!==`), **begins with** (`<=`), and **ends with** (`>=`). Discovered from
  Plex's OpenAPI media-query spec, where the operator is encoded by the number of `=` signs (a single `=`
  is contains; `==` is exact equality). Previously the system assumed string fields could only do contains.
- Purely additive: `contains` stays the default operator, so every existing channel keeps its exact current
  behavior. No schema change (filters are stored as JSON) and no migration.
- Wired through the whole stack: the Plex query builder, the local (in-code) filter matcher used by grouping
  strategies, the admin filter-builder UI, and the AI channel-builder's field catalog + guidance. Added bun
  tests for both the query builder and the local matcher.

## [0.12.22] - 2026-08-27

Apple TV (tv-native) — fix the audio / subtitle / quality pickers doing nothing when you select an item.
**Needs a new build.**

### Fixed
- **Picker selections now apply on Apple TV.** The pickers were rendered in a native `<Modal>`, which on
  tvOS presents in its own view controller with no TV remote handler — so `useTVEventHandler` (the source
  that feeds the whole app's zone-machine input) goes deaf while the modal is open, and D-pad/Select never
  reached the picker (react-native-tvos#609). Android was unaffected because its modals get their own handler
  (#628), which is why this was Apple-TV-only. The picker is now a **full-screen in-tree overlay** rendered
  at the player-chrome root (lifted out of the feature panel into a small picker context), so the root
  `useTVEventHandler` stays live and the picker is driven by the same key-layer system as everything else. No
  native `<Modal>`; visually identical; touch on iPad unchanged.

## [0.12.21] - 2026-08-27

Android TV (tv-native) — HDR on the HLS transcode path now switches **live** (no reload), so seeking keeps
its offset, and the aspect-fit is re-enabled for transcode. **Needs a new Android build.**

### Fixed
- **Transcode HDR no longer restarts the program on the HDR switch.** HDR requires switching to
  `vo=mediacodec_embed` + direct `hwdec=mediacodec`. Previously that was done with a `loadfile replace`
  reload — fine for direct-play (a real file re-seeks cleanly) but destructive for a Plex HLS transcode:
  re-requesting the session URL un-anchors it (Plex restarts from the program beginning) and resets mpv's
  `time-pos`, which the channel clock depends on. Now, **for transcode we switch the VO/decoder live on the
  running stream and never reload** — mpv reconfigures the video chain in place at the current position, so
  the HLS session, the seek offset, and `time-pos` are all left untouched (mirroring how iOS switches the
  tvOS display without reloading). Direct-play HDR keeps its clean reload.
- **Aspect-fit re-enabled for transcode HDR** (0.12.20 had disabled it): with no reload there's no surface
  churn to worry about, so the letterbox applies everywhere.

## [0.12.20] - 2026-08-26

Android TV (tv-native) — disable the HDR aspect-fit on the HLS transcode path so seeking stays intact
there. **Needs a new Android build.**

### Fixed
- **HDR seeking on the HLS-transcode path no longer restarts the program from the beginning.** The HDR
  switch re-opens the stream URL (`loadfile replace`, required to change the video output for HDR
  passthrough); on a **Plex transcode session** that re-open plus the aspect-fit's surface reconfig makes
  Plex restart the transcode from 0, dropping the seek offset. So the view now **disables the aspect-fit for
  transcode streams** (detected by `/transcode/` in the URL) — the surface stays full, seeking is rock-solid,
  and we accept the minor HDR stretch on that fallback path. **Direct-play HDR keeps the full aspect-fit**
  (its URL is a real file, so the re-open re-seeks cleanly) — confirmed working: correct letterbox + correct
  offset on seek.

## [0.12.19] - 2026-08-26

Android TV (tv-native) — the HDR aspect fix, done right (no offset regression). **Needs a new Android
build.** Supersedes 0.12.18's aspect approach.

### Fixed
- **HDR content no longer restarts from the beginning after the HDR switch.** 0.12.18's aspect fix resized
  the video surface imperatively, which triggered an early surface reconfig that made the one-shot HDR probe
  read the *pre-seek* position (~0.04s on a mid-program tune-in) and re-open there — throwing away the seek
  offset. Two fixes: (1) the HDR re-open now clamps its resume point to **≥ the original seek offset**
  (`maxOf(time-pos, start)`), so it can never regress behind where you tuned in; (2) aspect is now handled by
  an **AspectRatioFrameLayout** container (the ExoPlayer pattern) that applies the ratio once, declaratively,
  in the layout pass — instead of mutating the surface on every event — eliminating the churn.
- **HDR video aspect is correct (no vertical stretch).** `vo=mediacodec_embed` (HDR10/HLG passthrough) fills
  the surface and ignores mpv's keepaspect, so non-16:9 content (e.g. 3840×2076 cinema) stretched ~4% taller
  on a 16:9 panel. The container now letterboxes it to the content's PAR-correct display aspect. SDR
  (gpu-next) is unchanged. iOS / Apple TV / iPad are untouched.

### Kept from 0.12.18
- **Device Settings shows the panel's real resolution** (4K reads 3840×2160 + HDR) via native display-mode
  detection (`mpvDisplay`), Android-only.

## [0.12.18] - 2026-08-26

Android TV (tv-native) — fix HDR video zoom/stretch, and report the real 4K panel resolution in Device
Settings. **Needs a new Android build to take effect (native module change).** *(Superseded by 0.12.19 —
the aspect approach here caused an HDR offset regression.)*

### Fixed
- **HDR content no longer zooms/stretches on Android TV / Google TV.** HDR plays through
  `vo=mediacodec_embed` (MediaCodec → SurfaceView, for real HDR10/HLG passthrough), which renders the decode
  surface directly and **ignores mpv's aspect handling** (`keepaspect`/`panscan`) — so a full-screen surface
  stretched HDR content, most visibly as "everything slightly taller" after the HDR switch. The video surface
  is now letterboxed to the content's display aspect at the view layer (the same fix ExoPlayer's
  `AspectRatioFrameLayout`, findroid, and plezy use — no mpv option does it, mpv-android#486). SDR (gpu-next)
  is unchanged, and aspect uses mpv's PAR-correct display dimensions (`dwidth`/`dheight`).
- **Device Settings now shows the panel's real resolution.** Android TV renders its UI at 1080p even on 4K
  panels, so we were reporting the 1080p UI surface as the panel — a 4K Sony showed as 1080p. We now read the
  display's supported modes (max physical width×height) + HDR capability natively (new `mpvDisplay` in
  `@airwave/mpv-player`, mirroring jellyfin-androidtv), so a 4K TV reads 3840×2160. **iOS / Apple TV / iPad
  are unaffected** (their UI surface equals the panel). Note: playback was never capped by this — 4K always
  direct-played at native resolution via mpv's hardware surface; this only corrects the reported number.

## [0.12.17] - 2026-08-26

Website — App Store links go live, the downloads page one-click-downloads the right file, and the
architecture diagram becomes a real rendered diagram.

### Added / Changed
- **Apple App Store links.** The homepage hero and the downloads page now link Apple TV and iPad to the
  live App Store listing (one universal app). Apple TV shows **Available**; iPad shows **In review**.
- **The downloads page downloads the exact right file directly.** Desktop and server rows now resolve the
  current versioned asset off the latest GitHub Release (the same resolver the homepage hero uses, cached
  hourly) instead of dropping you on the releases page to hunt for it — and gracefully fall back to the
  releases page if an asset is ever missing.
- **Separate macOS Apple Silicon and Intel rows** in both the client and server download tables.
- **Architecture docs.** Replaced the ASCII "How the pieces talk" diagram with a rendered **Mermaid**
  diagram, matching the self-hosting page.

## [0.12.16] - 2026-08-26

Website — a public **Roadmap** on getairwave.tv with login-less upvoting, plus a dynamically generated
sitemap so the whole site is crawlable.

### Added
- **Roadmap page (`/roadmap`)** — a public, ranked list of what's coming to Airwave, backed entirely by a
  GitHub Project (no separate database). Visitors **upvote** the features they want with **no login required**;
  the list is ranked by votes, highest first. Each row carries a Status badge (Planned / In Progress /
  Exploring / Shipped). Voting is optimistic, and a row only changes rank on reload — it never jumps while
  you're looking at it. Content is authored directly in the GitHub Project (draft items with a Description +
  Status field), so there's no admin UI to maintain.
- **Dynamic `sitemap.xml`** covering every marketing, docs, blog, and roadmap URL, generated from the fumadocs
  content sources so newly added pages are crawlable automatically.
- "Roadmap" links in the site header and footer.

### How it works
- Votes are stored as salted, hashed voter ids inside each roadmap item's body — a per-browser `rmv_id` cookie
  plus IP, sha256'd — so there's no personal data and no backend database. All GitHub calls run server-side
  through a `project`-scoped token the browser never sees, and a per-IP rate limit guards the vote endpoint.
- Scoped entirely to `apps/site`; the API, database, and every other app are untouched.

## [0.12.15] - 2026-08-26

Admin — an onboarding checklist, honest per-source sync state, and one consistent "source ready" gate.

### Added
- **"Get set up" onboarding checklist** in the admin sidebar: a collapsible card with a donut progress ring
  and five steps (Connect a source → Sync media metadata → Create your first channel → Create your first
  package → Import Plex users). The sync step shows a **live spinner** while a first sync runs. Progress is
  computed live from the data (no stored state) and the card stays visible — celebrating "You're all set!" at
  5/5 — until dismissed with the **Hide** button (persisted locally). New `onboarding.status` endpoint.
- A subtle Airwave mark + version in the sidebar footer, linking to the repo.

### Fixed / Changed
- **Honest per-source sync state.** New `MediaSource.syncStatus` (`never | syncing | synced | failed`) +
  `lastSyncedAt` / `lastSyncError`, set by `syncMediaItems` around every sync. Previously "synced" meant
  "has ≥1 cached media item" — which was true mid-sync or after a partial 5-minute scan, so channel creation
  could open before a full sync had ever finished. A nightly re-sync of an already-synced source keeps it
  "synced" (the gate never regresses during routine refreshes). Migration backfills existing synced sources.
- **One shared readiness gate.** Channel creation, `sources.list`, channel import, and the AI lineup (both the
  job and the tRPC entry) now all gate through a single `sourceReadiness` helper — "ready" means one honest
  thing everywhere (connected + a completed sync), replacing three subtly different ad-hoc checks (the AI
  lineup previously only required "any enabled source").
- **Auto-sync on connect.** Connecting a source now kicks off a full metadata sync automatically, so it flows
  never → syncing → synced without hunting for a button.
- **Honest sync-status badges** on the sources list *and* the source detail page: Disconnected / Syncing
  (spinner) / Ready / Sync failed / Not synced.

## [0.12.14] - 2026-08-26

Desktop CI — fix the **macOS Intel** installer failing to build (`hdiutil: No space left on device`).

### Fixed
- The signed macOS DMG step failed on the Intel runner with `hdiutil: create failed - No space left on device`
  even though the runner had ~110 GB free. `hdiutil create -srcfolder … -format ULFO` auto-sizes the temporary
  volume it mounts to stage the bundle, and that estimate under-provisioned for our incompressible ~116 MB
  `tar.zst` payload, so the copy into `/Volumes/Airwave` ran out of room (on the volume, not the disk) — borderline
  enough that it tipped over on Intel. We now build an explicitly oversized read-write image (staging size +
  400 MB) and `convert` it to the compressed ULFO we ship, so it no longer relies on hdiutil's estimate. Applies
  to both Mac arches.
- No app changes — this only unblocks the macOS Intel installer. The rest of 0.12.13 (including the
  self-hosted / OpenAI-compatible model AI fix, GitHub #3) already shipped.

## [0.12.13] - 2026-08-26

AI assistant on **self-hosted / OpenAI-compatible models** (LM Studio, Ollama, vLLM, OpenRouter) — fix the
`Invalid type for 'input'` error (GitHub #3).

### Fixed
- The `compatible` AI provider used the Vercel AI SDK's default OpenAI route, which now targets OpenAI's newer
  **Responses API** (`/v1/responses`, `input` field). Self-hosted OpenAI-compatible servers implement only the
  **Chat Completions API** (`/v1/chat/completions`, `messages`), so the chat failed with `Invalid type for
  'input'` as soon as tools were attached (the connection *test* passed because a trivial prompt slipped
  through). The compatible provider now explicitly uses Chat Completions (`.chat()`) — chat history and tool
  calls work exactly as before, and being the universally-supported path, more reliably. Cloud OpenAI
  (Responses API), Anthropic, and Google are untouched.

## [0.12.12] - 2026-08-25

Desktop app — one-click **Report to developer** on the setup failure screen.

### Added
- When first-run provisioning fails, the setup UI now shows a **Report to developer** button next to Try again.
  It copies your **secret-scrubbed** `desktop.log` (Plex tokens + the home-dir username redacted) to the
  clipboard and opens a **prefilled GitHub issue** in your browser — the bug form with area = Server, the exact
  install/platform (Windows / macOS Intel or Apple Silicon / Linux), and the app version already filled — so you
  just paste the logs and submit. The repo is public, so there's **no backend and no telemetry**: nothing is sent
  automatically; it only acts on your click.
- New supervisor endpoints: `GET /diagnostics` (scrubbed log tail + the platform's install label) and
  `POST /open-url` (restricted to the repo's New-Issue links so it can't be an open redirect). The setup app bakes
  its version via a Vite `define` to prefill the form.
- Pairs with the new `.github/ISSUE_TEMPLATE` bug form, whose dropdown options these values match exactly.

## [0.12.11] - 2026-08-25

Desktop app — restore a working **macOS Intel** build: signed, notarized, and boots.

### Fixed
- Every prior macOS Intel desktop build crashed at launch (`EXC_BAD_ACCESS`/SIGSEGV in electrobun's launcher at
  `fs.path.resolve`, before our code runs). Root cause is [electrobun#485](https://github.com/blackboardsh/electrobun/issues/485):
  electrobun's darwin-x64 core binaries (launcher/extractor) ship with **zero Mach-O headerpad**, so codesigning
  them — required to notarize — makes `codesign` silently overwrite the start of `__text` and corrupt the binary.
  (arm64 is immune; it always reserves the code-signature load command.) The upstream fix exists only in
  Hutch-based betas, which can't build x86_64 at all — so no electrobun version both builds Intel *and* is safe to
  sign.
- Fix: `apps/desktop/scripts/fix-x64-headerpad.ts`, called from `build-mac-signed.ts` before each `codesign`. For
  every unsigned thin-x86_64 Mach-O with headerpad < 16, it drops an expendable 16-byte load command
  (`LC_SOURCE_VERSION`, else `LC_UUID`) to make room for `codesign`'s `LC_CODE_SIGNATURE`, so signing no longer
  corrupts `__text`. No-op on arm64 and on already-signed/padded binaries. (Mach-O technique adapted from
  deer-flow/llm-space#29.)
- The Intel CI job pins electrobun `1.18.1` (the last line with the classic `electrobun build` CLI that targets
  x86_64); every other matrix job stays on v2. Net result: a fully signed + notarized Intel DMG that launches.

### Notes
- Desktop macOS only; arm64 / Windows / Linux and iOS / Apple TV are unaffected (the headerpad step is a no-op
  off the Intel job).

## [0.12.10] - 2026-08-25

Build/CI + dev tooling — try to restore a native macOS Intel desktop build via an Electrobun version split, and
move the docs site's dev port off a collision.

### Changed
- **Desktop CI: pin Electrobun 1.18.1 for the `macos-15-intel` job only.** Electrobun v2 is Hutch-orchestrated
  and Hutch has no Darwin x86_64 build, so `electrobun build` aborts on the Intel runner
  (`hutch installer: unsupported platform: Darwin x86_64`). That one matrix job now downgrades to the last
  pre-Hutch line (1.18.1) *after* install (v2 installs fine — Hutch only runs at build time) and strips the
  v2-only `build.mainProcess` config key; every other job stays on v2 (`^2.0.1`). This lets the Intel `.app` +
  signed DMG build again, as it did at v0.12.6. ⚠️ It remains unverified whether v1.18's launcher fixes the
  Intel *runtime* segfault — a green build proves it compiles + signs, not that it launches.
- **`apps/site` dev/start port 3003 → 3004** so it stops colliding with `apps/tv-tauri` (3003) when `pnpm dev`
  boots the whole monorepo.

## [0.12.9] - 2026-08-25

Desktop app — harden embedded-Postgres startup so a leftover database process can't brick onboarding, and surface
start failures instead of hanging silently on "starting the database."

### Fixed
- **An orphaned Postgres bricked "starting the database."** If the desktop app was force-quit or crashed (or, on a
  developer's machine, a `pnpm -F desktop dev` instance was left running), the embedded `postgres` stayed attached
  to the data directory. On the next launch the supervisor's port-probe picked a *different* free port and started
  a *second* postmaster on the same `pgdata`, which Postgres rejects with `FATAL: pre-existing shared memory block
  is still in use` — surfacing to the user as a permanent hang. The supervisor now reaps any live postmaster still
  attached to its `pgdata` (via `postmaster.pid`, killing the whole process tree on Windows so backend children
  die too) and clears the stale pid file before starting.
- **Dev and packaged no longer share a data directory.** Both defaulted embedded Postgres to the same port and
  `Airwave/pgdata`, so a running `pnpm dev` instance and the installed app fought over one data folder (the
  collision above). Dev now uses a separate `Airwave-Dev` user-data tree; the packaged app keeps `Airwave`
  unchanged (existing installs' data is untouched).
- **Start failures are shown, not swallowed.** A boot error used to leave the onboarding UI polling forever on the
  phase it died in, logging a useless `{}`. The supervisor now captures a real per-phase error and exposes it via
  `/status`; the setup UI shows which phase failed, the message, and a **Try again** button (`/retry`). A
  configured app that fails to start on relaunch now opens its window with that error instead of sitting silently
  in the tray.

### Notes
- Desktop-only (`apps/desktop` + `apps/desktop-setup`); no server, TV-client, or iOS/Apple TV impact.
- The fix paths run against the bundled embedded Postgres, so they validate in a packaged build — verify via a
  `workflow_dispatch` desktop build.

## [0.12.8] - 2026-08-25

Desktop app — **migrate to Electrobun v2** to fix the macOS launcher crash (candidate; macOS build being
verified).

### Fixed
- The v1 Electrobun launcher segfaulted at startup on macOS (SIGSEGV in the Zig launcher's `fs.path.resolve`,
  *before* our supervisor runs), so the desktop server never launched on an Intel iMac — it self-extracts a
  `.tar.zst` payload, and the crash was in that path-resolution/extraction step. Upgraded `electrobun`
  `^1.15.1` → `^2.0.1` (now Hutch-orchestrated). Config migration: added `build.mainProcess: "bun"`; we use
  none of the removed v1 fields and already use `--env=stable`/`canary`. v2's dev/build eagerly process the
  `copy` sources, so `prebuild` is now chained into the `dev`/`start` scripts. `.hutch/` + `.cottontail-tmp/`
  gitignored.

### Verification
- `pnpm -F desktop dev` boots the full stack on Windows under v2 (no regression). The macOS build is being
  verified via `workflow_dispatch` before this ships — watch `build-mac-signed.ts` (`.app` layout) and the
  SHALLOW pg-native layout (the v1 self-extractor long-name workaround may no longer be needed).

## [0.12.7] - 2026-08-25

AI lineup generation on **OpenAI / non-Anthropic providers** — fix the `Invalid schema for response_format`
error (candidate fix, under verification).

### Fixed
- The AI lineup **planner** (`services/agent/lineup-plan.ts`) builds its channels with `generateObject`,
  which `@ai-sdk/openai` runs in **strict** structured-output mode by default. Strict mode requires every
  property to appear in the schema's `required` array, so the `.optional()` fields added during the
  strategy/sorting work (`sortField`, `sortDir`, `callsign`, and the package `existingKey`) made OpenAI
  reject the request with `Invalid schema for response_format … 'required' … Missing 'sortField'`. This
  never surfaced on Anthropic because that path uses a lenient tool-based route. Those four fields are now
  `.nullable()` (still "optional" for the model — it may return null — but present in `required`), and the
  reserve step converts the now-nullable `sortField`/`sortDir` back to `undefined` before persisting.
  Anthropic behaviour is unchanged; the planner keeps strict enforcement.
- Audited the other AI-facing schemas (chat `create_channel`/`update_channel`, the WDK builder): they run
  through non-strict `tool()` calls and already work on OpenAI, and their executes persist all
  sorting/ordering fields correctly. `strategy` remains intentionally absent from the AI (deferred per the
  channel-strategies plan). No changes needed there.

## [0.12.6] - 2026-08-24

Fix a `42P01` error on the observability page when the workflow SDK is disabled (GitHub issue #1).

### Fixed
- The workflow engine is opt-in (`WORKFLOW_ENABLED=1` on Docker; onboarding/tray toggle on desktop), and
  when it's off the `workflow.*` schema is never bootstrapped. The four observability read functions
  (`listLineupRuns` / `listLineupRunSteps` / `listImportRuns` / `listImportRunSteps`) queried
  `workflow.workflow_runs` / `workflow.workflow_steps` **without** the same gate the runners and the Import
  button use, so opening the AI-lineup or import observability page polled a table that didn't exist →
  `Raw query failed. Code: 42P01. relation "workflow.workflow_runs" does not exist`. They now short-circuit
  to an empty result when `WORKFLOW_ENABLED !== "1"`, so the page renders an empty state instead of
  throwing. Enabling the workflow SDK remains the way to actually use it; this just stops the read path from
  erroring when it's off.

## [0.12.5] - 2026-08-24

apps/site — reflect that webOS + Roku are usable now via sideload.

### What ships
- Downloads table: **LG webOS** and **Roku** moved from "Coming" to **Available (Sideload / from source)** —
  both apps run today; only their store submissions are still pending.
- Matching copy on the reddit-facing messaging (webOS + Roku work now via sideload; store submissions a WIP).

## [0.12.4] - 2026-08-24

apps/site — Downloads page tweaks.

### What ships
- Fire TV moved from "Coming" to **"In review"** (Amazon Appstore submission is in review).
- Added a **"Sideload before the store"** note: the Roku, Android TV, Fire TV, and LG webOS apps can be
  installed from source today (Roku Developer Mode, Android TV / Fire TV `adb install`, webOS `ares-install`).
- Corrected the desktop-client line — Windows + macOS available, **Linux next** (was implying Linux shipped).

## [0.12.3] - 2026-08-24

apps/site — add a dedicated **Downloads** page to the docs.

### What ships
- New `/docs/downloads` page listing every client and server build, which OS each is for, and where to get
  it — mirroring the platforms table's style. Previously downloads were only reachable from the homepage.
- New `components/downloads-table.tsx` (`ClientDownloads` + `ServerDownloads`) — static, PlatformMatrix-style
  tables with status badges, linking to the GitHub releases/latest page (desktop installers), store pages,
  and the GHCR container package (`ghcr.io/quixomatic/airwave`) for Docker. Registered in the MDX component
  map; added to the docs nav after Platforms.

## [0.12.2] - 2026-08-24

tv-native (Android) — **restrict the Google Play release to Android TV / Google TV only** (no phones or
tablets).

### What ships
- Added `androidTVRequired: true` to the `@react-native-tvos/config-tv` plugin in `apps/tv-native/app.json`.
  This marks `android.software.leanback` as **required** (and touchscreen not required) in the Android
  manifest, so Google Play only lists and installs the app on TV devices — the previous config left leanback
  optional, which would have made the app available to phones/tablets too. Android-only; zero iOS/Apple TV
  impact.

### Required for release
- Needs a fresh `production-androidtv` build (the manifest changed) — the next EAS build picks up the new
  versionCode. In Play Console, enable the **Android TV** form factor only; leave phone/tablet, Wear,
  Android XR (a separate VR/AR platform, not TV), Auto, and ChromeOS off.

## [0.12.1] - 2026-08-24

apps/site — flesh out the "Introducing Airwave" blog post.

### What ships
- Rewrote `content/blog/introducing-airwave.mdx` from a stub into a full post in the project's voice — the
  personal "I miss TV" framing, the kids'-channel and stumble-into-a-movie anecdotes, the server-first
  model, and an honest note on the AI-assisted build.
- Wove in five existing product screenshots (Apple TV guide, channel surfing, full-screen DVR playback, the
  admin channel-filter builder, and the schedule preview), each auto-rendered as an optimized,
  click-to-zoom image via the existing MDX pipeline — no schema or component changes.

## [0.12.0] - 2026-08-23

tv-native (Android) — **properly fix the mini-player ANR** + version-source cleanup.

### Fixed
- **Mini-player close no longer ANR-kills the app on real hardware.** v0.11.80's `withTimeoutOrNull(1500)`
  guard didn't help on the Google TV Streamer (MediaTek) — the gpu-next GL/`aimagereader` teardown stalls
  inside a **non-cancellable native call**, so the coroutine timeout never fired and the main thread still
  blocked past Android's 5s input-dispatch limit → SIGKILL. Now `MpvCore.detachSurface()` runs the whole
  ordered teardown (`vo=null` → `force-window=no` → detach) on a **background thread**, so `surfaceDestroyed`
  (main thread) returns instantly and the GL deinit can take as long as it needs off-thread. The video is
  paused when the mini closes, so mpv isn't rendering and there's no live frame to hit the destroyed surface
  (this mirrors mpv-android's fire-and-forget teardown; it uses fast JNI on the main thread, our wrapper's
  `setProperty` blocks so we move it off-thread). Android-only (`packages/mpv-player/android`), zero iOS
  impact. Verified on the emulator; needs a real-Streamer confirm.
- **tv-native version no longer stuck at 0.11.9.** `app.json`'s `expo.version` was never part of the
  lockstep bump, so the About page (`Constants.expoConfig.version`) and the built app's versionName drifted
  stale. `app.json` is now bumped in lockstep with `package.json` every release.
- **Restored the webOS app manifest** `apps/tv-web/public/appinfo.json` (accidentally removed in v0.11.76
  while chasing the same stale-version issue). It's the webOS packaging/submission manifest (`id`,
  `version`, `title`, `icon`, …) and is read at runtime by `webOSTV.js` — removing it would have broken the
  webOS `.ipk` build. It's now bumped in lockstep too.

### Versioning
- The `/version-bump` flow now bumps **every** version file in lockstep, not just `apps/*/package.json`:
  `apps/tv-native/app.json` (`expo.version`), `apps/tv-web/public/appinfo.json` (webOS manifest),
  `apps/tv-tauri/src-tauri/{Cargo.toml,tauri.conf.json,Cargo.lock}`, and `apps/tv-roku/manifest`. Skill
  updated so none can drift again.

## [0.11.80] - 2026-08-23

tv-native (Android) — **fix the ANR-kill when closing the SDR mini player**. Pressing Back to close the
mini player crashed the whole app on SDR content (`ANR in com.airwave.tv — Input dispatching timed out,
Waited 5002ms for KeyEvent`). `MpvCore.detachSurface()` runs on the main thread (surfaceDestroyed) and did
an **unbounded** `runBlocking { setProperty("vo","null") … }` to stop rendering before the surface dies;
for `vo=gpu-next` (SDR) the GL/`aimagereader` teardown stalls waiting for MediaCodec frames that never
arrive once paused (`Waiting for frame timed out`), hanging the main thread past the 5s ANR threshold →
SIGKILL. HDR was unaffected (`mediacodec_embed` has no GL path). Fixed by **bounding that wait**
(`withTimeoutOrNull(1500)`): `vo=null` lands in a few ms normally; if the teardown stalls it bails well
under the ANR threshold and detaches anyway. Android-only (`MpvCore`) — pre-existing gpu-next teardown
code, zero iOS/Apple TV impact.

## [0.11.79] - 2026-08-23

tv-native (Android) — **keep the screen awake during video playback**. Android has no automatic idle-timer
hold like iOS/tvOS, so a channel could dim and even sleep mid-playback. `MpvPlayerView` now sets
`keepScreenOn` on the mpv `SurfaceView` while a video is playing (sets the window's `FLAG_KEEP_SCREEN_ON`),
and releases it on pause/stop/unmount so the device can still sleep when idle. Matches how the references
do it (plezy → `wakelock_plus`, streamyfin → `expo-keep-awake`, both gated on the playing state), done the
Android-native way so there's **zero iOS/Apple TV impact**.

## [0.11.78] - 2026-08-23

tv-native (Android) — **fix the capability-diagnostic freeze** + re-enable HDR.

The diagnostic mounted a fresh mpv instance per clip and destroyed it between clips (`setSource(null)` →
`mpv_terminate_destroy`). On Android that leaks the MediaCodec session + surface + 4K buffers every cycle
— native memory climbs → GC death-spiral → the app freezes after only a few clips (device-dependent: ~clip
2 on the Streamer's MediaTek, ~8 on the emulator). **Fix (Android only): reuse ONE mpv instance for the
whole run** — keep the `MpvPlayerView` mounted and let each clip's `source` change reload it in place
(`core.load` → mpv `loadfile replace`, which closes the old `h264_mediacodec` decoder before opening the
next, so ~1 is alive at a time). No per-clip teardown, so nothing to leak. **iOS/Apple TV is byte-for-byte
unchanged** — it keeps destroying per clip, gated by `Platform.OS === "ios"`, because Apple has the
*opposite* failure (v0.7.20: reusing one instance stacked **VideoToolbox** sessions → OOM ~clip 8, which is
why per-clip-destroy was adopted there). That VT-reuse OOM was Apple-specific (MPVKit's avfoundation VO
holding sessions); mpv-Android's `loadfile` is expected to release the MediaCodec cleanly between clips —
**being validated on-device** (RES must stay flat across all 49). If Android reuse also stacks, the
fallback is deterministic per-clip destroy (wait for a real teardown-complete signal before the next clip).

Also re-enabled the Android dynamic-HDR switch (`HDR_SWITCH_ENABLED = true`): the isolation build (v0.11.75)
with it gated off still froze, proving HDR was never the cause.

## [0.11.77] - 2026-08-23

tv-native (Android TV) — **crisp, pixel-snapped guide hairlines**. The guide grid scales with screen
width via `vw()`, but a handful of thin lines were hardcoded raw dp and never scaled, so on Android TV's
half-scale 960dp layout they rendered ~2× too thick (and could land on blurry half-pixels). Added a
`line()` helper to `layout.ts` that scales by `CHROME_SCALE` **and snaps to a whole physical pixel**
(floored at 1px so it can't vanish) — a hardcoded `1` now reads as a single crisp 1px hairline on Android
instead of a doubled 2px one. Routed the **focused-program outline**, the **on-now left-edge indicator**,
and the rail-circle / featured-tile borders through it. Identity on iPad / Apple TV / Android tablets
(`CHROME_SCALE === 1`) — their hand-tuned look is untouched.

## [0.11.76] - 2026-08-23

tv-web — the browser TV player's About page now shows the **real app version**. It had been reading a
static `public/appinfo.json` (stuck at 0.11.9); switched `lib/app-info.ts` to import the version from
`package.json` (bumped in lockstep every release, like tv-tauri does), so it auto-updates and there's no
separate file to keep in sync. Removed the stale `appinfo.json`.

## [0.11.75] - 2026-08-23

tv-native (Android) — **isolation build: gate the HDR switch OFF** to diagnose a capability-diagnostic
freeze on the Google TV Streamer. The diagnostic mounts a fresh mpv per clip and destroys it between
clips; it hangs at the clip-2→3 teardown (JS thread pegged, no crash). The HDR probe is proven a no-op on
the SDR test clips, but its two `video-params` `getDouble` reads fire on `PlaybackRestart` at the exact
moment the view unmounts + `mpv_terminate_destroy` runs — a plausible teardown race. `HDR_SWITCH_ENABLED`
(new `MpvCore` flag) is set to `false` so this build reverts to the pre-HDR behavior (vo always
`gpu-next`, no probe); if the diagnostic then completes, the probe is confirmed as the cause and gets
re-added teardown-safe. Android-only (`packages/mpv-player/android/MpvCore.kt`) — zero iOS/Apple TV
impact.

## [0.11.74] - 2026-08-22

tv-native (Android) — **fix the mpv-player gradle project name broken by the Airwave rename**, which had
been failing every Android build with `Project with path ':Airwave-mpv-player' could not be found`. Expo
Android autolinking names a local module's gradle project after its npm package (strip `@`, `/`→`-`,
**case preserved**), so `@airwave/mpv-player` → `:airwave-mpv-player` (lowercase scope). The rename had
capitalized the constant in `packages/mpv-player/app.plugin.js` to `:Airwave-mpv-player`; corrected to
lowercase. This was the first tv-native Android build since the rename, so it surfaced now — it also
unblocks the v0.11.73 Android HDR work.

## [0.11.73] - 2026-08-22

tv-native (Android) — **HDR passthrough via dynamic `mediacodec_embed`** (Path A). mpv's OpenGL-ES
`gpu-next` path on Android can't passthrough HDR (it always tone-maps HDR→SDR, which also tanked the frame
rate), so `MpvCore.kt` now detects HDR on the first decoded frame (`video-params/sig-peak` / `max-luma` via
the AAR's `getDouble`) and, for HDR content, switches to **`vo=mediacodec_embed` + zero-copy
`hwdec=mediacodec`** — MediaCodec renders straight to the SurfaceView (real HDR10/HLG passthrough + full
frame rate) — re-opening the file at the same offset (a clean reload, not a fragile live VO flip). SDR
stays on `gpu-next` (mpv's full renderer). The switch mirrors the Apple side (read the video's color params
on first frame → switch), converges via a one-shot `hdrChecked` guard, and `attachSurface` restores the
active VO so HDR survives a mini↔full reposition.

Entirely inside the Android native `packages/mpv-player/android/.../MpvCore.kt` — **zero shared-JS
changes, zero Apple involvement** (the proven iPad/Apple TV builds are untouched). Pending validation on a
real Android TV / Fire TV via an EAS `preview-androidtv` build. Plan: `.plans/tv-native.md` §13.

## [0.11.72] - 2026-08-22

tv-tauri — device-page frame fixes.

### What ships
- The **Recent playback issues** frame now uses `bg-frame` to match the Playback capabilities frame above
  it (it had been missed).
- `@airwave/ui` `FrameHeader` gained a small `gap-1` between the title and description (applies wherever
  Frame is used, including the admin web).

## [0.11.71] - 2026-08-22

tv-tauri — settings styling cleanup: converted the static inline styles in the settings pages
(`settings-ui.tsx` + `settings-pages.tsx`) to standard Tailwind utility classes, mapping exact-match
colors to the Aurora theme tokens (`text-foreground`, `text-muted-foreground`, `bg-frame`, …) and keeping
every non-token color/size exact via arbitrary classes. Focus/tone-dependent styling (the `SettingRow`
focus surface + ring, `Pill` tone colors) and the capability grid's row-count math stay inline;
`settings-sidebar.tsx` (motion/layout math) was left as-is. No visual change — purely a mechanical
translation so the styles flow through the token system.

## [0.11.70] - 2026-08-22

tv-tauri — device-page summary as icon tiles.

### What ships
- The device summary row (OS / System / Resolution / HDR) is now a **grid of tiles**, each with a category
  icon: System (Cpu), Resolution (MonitorPlay), HDR (Sparkles), and **OS** showing its **brand logo next
  to the name** (Windows / Apple / Linux) rather than a category icon.
- Added a reusable **`bg-frame`** utility (a `--color-frame` theme token = the faint `#94a3b8 @ 6%` tile
  wash) and applied it to the stat tiles and the device-page **Frame** containers, so a Frame's outer
  surface matches the tiles (its panel/border/shadow are unchanged). Use `className="bg-frame"` on any
  future Frame to match.

## [0.11.69] - 2026-08-22

tv-tauri — settings device-page polish.

### What ships
- **Codec toggle grid no longer shifts** — the 2-column capability grid is now `repeat(2, minmax(0, 1fr))`,
  so adding an Override/Forced badge to a row can't widen its column and shrink the other; the columns stay
  exactly half-and-half.
- **`Frame` grouping** — adopted the admin settings `@airwave/ui` Frame pattern for the sections that read
  as real groups: **Playback capabilities** and **Recent playback issues** (header + description + panel).
  Left "This device" and Tools as plain sections (not everything needs a frame).
- **Collapse/Expand is D-pad reachable** — the settings rail's bottom toggle now sits at the end of the
  keyboard nav (▼ past the last section → OK toggles), not mouse-only.
- **Sticky header gradient** stays opaque through the subtitle now (fades in the last ~10% instead of ~30%).

## [0.11.68] - 2026-08-22

tv-tauri — settings + device polish, plus a macOS titlebar seam fix.

### What ships
- **macOS titlebar seam fixed** — inside the authed app the custom titlebar is now transparent on macOS
  (`html.platform-mac.in-app`), so the single full-window navy backdrop paints both the top strip and the
  guide instead of two separately-composited same-color layers seaming on the transparent macOS window.
  Windows (opaque window) and non-auth routes keep the opaque titlebar.
- **Settings rail is now persistent** — expanded by default and part of the layout (it pushes the content
  pane over instead of overlaying it with a scrim); a Collapse/Expand toggle pinned at the bottom folds it
  to the slim icon rail.
- **Device page shows the OS** — added `@tauri-apps/plugin-os`; the info card now shows the OS name with its
  brand logo (Windows / Apple / Linux, via `react-icons`) plus the OS version and CPU arch.
- **Device page uses the real `@airwave/ui` Switch** for the per-codec capability toggles (read-only,
  row-driven), replacing the custom toggle visual.
- **Settings sticky header** — replaced the full-width hairline divider (which overhung the padded content)
  with a soft top-navy → transparent gradient.

## [0.11.67] - 2026-08-22

getairwave.tv — a **reusable section system** + a display font. Added a `--font-display` token (a system
stack — Avenir Next / SF Pro Display / Segoe UI Variable, no web-font load) so Tailwind generates a
`font-display` utility, and three reusable primitives (`components/landing.tsx` + `scroll-reveal.tsx`):
**`SectionHeader`** (a muted label pill + a large `font-display` heading at `clamp(2.5rem,7vw,4.75rem)`
with tight tracking + a `titleCh` width cap for clean line-wraps + a muted description), **`Section`**
(a `clamp(4rem,9vw,8rem)` vertical rhythm), and **`ScrollReveal`** (fade + `translateY(24px→0)`, 600ms
ease-out, IntersectionObserver, respects `prefers-reduced-motion`). All colors stay on the existing theme
tokens — this only introduces the larger type scale.

### What ships
- **Home** — the hero heading now uses `font-display` at the section-header size (lighter weight); the
  "Self-host it in minutes." (top-left grid cell), "Everything a channel needs.", and "Built for the living
  room." sections converted to `SectionHeader` + `ScrollReveal`.
- **Features** — the four group headers (Watching / Building / Playback / Access & privacy) converted.
- **Channel guide** — the three editorial block headers + the admin-preview header converted.

## [0.11.66] - 2026-08-21

getairwave.tv — reposition the hero clip across breakpoints. On **sm** the clip now scales with the hero
panel (`w-[560px]` → `w-[90%]`) instead of a fixed width, so it shrinks with the layout rather than
overflowing; **lg** drops lower (`top-56%` → `top-62%`) and **xl** nudges right (`left-46%` → `left-49%`)
so it sits better beside the copy. Purely positional CSS on the hero `<HeroReel>`; no logic changes.

## [0.11.65] - 2026-08-21

Fix the getairwave.tv favicon build. The icons copied from apps/web were **RGB**, which Next/Turbopack
rejects when processing `app/favicon.ico` ("Ico: The PNG is not in RGBA format"), failing the Vercel build.
Regenerated `favicon.ico` / `icon.png` / `apple-icon.png` as **RGBA** from the 180px master; verified with a
full `next build`.

## [0.11.64] - 2026-08-21

getairwave.tv — set the site favicon / app icons. Added the Airwave `favicon.ico`, `icon.png` (32×32), and
`apple-icon.png` under `apps/site/app/` (Next App Router file conventions, auto-detected), matching the
other apps — the site was showing the default Next icon.

## [0.11.63] - 2026-08-21

getairwave.tv — replaced the downloads section with **OS-aware split-button downloads in the hero**. Two
pills — **Server** and **Client** — each a cohesive button plus a caret that opens a dropdown to switch
platform. The **Server** button leads with **Docker** (→ self-hosting docs); the **Client** button
auto-detects the visitor's OS and defaults its main download to the matching installer (with Apple TV /
iPad App Store, Windows, and macOS Apple Silicon / Intel in the menu). All installer links resolve to the
latest GitHub Release's real assets at request time. Also: "Get started" is a full button again alongside a
round GitHub icon button, and the hero clip was repositioned + resized responsively.

## [0.11.62] - 2026-08-21

getairwave.tv — a **Download** section on the home page (below the intro, above the compose block): inline
platform pills split into a **Server** row (Windows / macOS / Linux installers) and a **Client** row (Apple
TV + iPad App Store stubs, then Windows / macOS desktop). Download URLs resolve to the latest GitHub
Release's real assets at request time (`lib/releases.ts`, cached hourly), so they auto-update every release;
a hero **Download** button jumps to `#download`. App Store product URLs are stubs (the `APPSTORE` constant)
to fill in once live.

## [0.11.61] - 2026-08-21

getairwave.tv polish + release-pipeline improvements.

### Marketing site
- **Hero + final CTA now stay dark in light mode** — they sit on dark shader panels, so pinning them dark
  (explicit dark background + forced-dark shader + `isolate` stacking) keeps the shader visible and the text
  readable regardless of the site theme.
- **Platform section reworked into square app-grid tiles** with status badges: **Ready** (green), **WIP**
  (amber, Android TV / Fire TV — partial HDR), **Soon** (muted, Linux / Samsung). Windows, macOS, and Roku
  moved into the working set; tiles ordered Ready → WIP → Soon.
- Hero clip is now responsive (shows + repositions from mobile through xl instead of vanishing below
  1024px); the "See the full platform matrix" link became a muted footer bar; tightened the footer gap.

### Release pipeline
- **macOS Intel server build restored** — the Airwave **Server** (Electrobun) can't cross-compile arch, so
  the Intel build now runs natively on GitHub's new standard **`macos-15-intel`** runner (replacing the
  retired `macos-13`); mac signing/notarization applies to both arches.
- **Linux server assets renamed** to the brand-first `Airwave-Server-<ver>-linux-<arch>-*` shape (matching
  Windows/macOS) instead of `stable-linux-<arch>-Airwave-*`.
- **Release notes** — each workflow now appends a component section (📺 Client, 🖥️ Server, 🐳 Docker) to the
  GitHub Release body instead of five repeated "Full Changelog" lines.

## [0.11.60] - 2026-08-21

tv-tauri — macOS **HDR-EDR passthrough** on HDR-capable displays (full quality), bundled with the centered
titlebar brand (0.11.59). The render path checks the window screen's EDR headroom
(`maximumPotentialExtendedDynamicRangeColorComponentValue`): on an HDR display it uses a **float
extended-range framebuffer** and reports `GL_RGBA16F` to mpv so HDR values > 1.0 survive (passthrough via
`target-colorspace-hint`), and sets an extended-range window colorspace so the compositor engages EDR. On
SDR displays it keeps the proven 8-bit path (mpv tone-maps) — so SDR panels (incl. the 5K iMac) render
exactly as before. HDR peak brightness only appears on HDR Macs (Pro Display XDR / recent MacBook Pro /
HDR externals); it can't be shown on an SDR display.

## [0.11.59] - 2026-08-21

tv-tauri — macOS titlebar polish: **center the Airwave brand** in the window header (was shifted right of
the native traffic lights, where its slightly-larger mark read as off-balance). macOS-only CSS
(`html.platform-mac`); the native traffic lights stay top-left and never overlap the centered brand.

## [0.11.58] - 2026-08-21

tv-tauri — macOS video **embedded via mpv's render API** (soia's approach; the real fix). mpv 0.41 has no
CAMetalLayer/NSView embed *window* context on macOS (cocoa/`macvk` always open their own window), so we
stop using `wid` there: macOS now runs `vo=libmpv`, creates an OpenGL `mpv_render_context`, and drives it
with a `CVDisplayLink` into an `NSOpenGLContext` attached to a view inserted BEHIND the transparent
WKWebView (`src/render_macos.rs`). Render-API FFI added to `mpv/ffi.rs`; `build.rs` links CoreVideo +
OpenGL. The mini-feed (`video-margin-ratio`) and all mpv commands/events are unchanged and shared. Windows'
child-HWND `wid` path is completely untouched (`#[cfg]`-gated). HDR-EDR passthrough is a follow-up.

## [0.11.57] - 2026-08-21

tv-tauri — macOS video embedding experiment: try mpv's `macvk` Vulkan context into a CAMetalLayer `wid`.
0.11.56 rendered but in mpv's own separate window (the cocoa backend can't embed via `--wid`). Upstream
exposes the macOS Vulkan-into-CAMetalLayer path as `macvk` (`moltenvk` is the iOS name our build rejects).
This sets `gpu-api=vulkan` + `gpu-context=macvk` and restores the CAMetalLayer-as-`wid` surface (sublayer 0,
behind the webview). If `macvk` isn't compiled into our libmpv it errors clearly (guiding a libmpv rebuild).
Windows unaffected.

## [0.11.56] - 2026-08-21

tv-tauri — **macOS video: embed into an NSView (cocoa backend), not a CAMetalLayer**.

The `CAMetalLayer`-as-`wid` + `gpu-context=moltenvk` path is iOS-oriented (mpv PR #7857) and our libmpv
rejects that context (`-7`) — which is why 0.11.54/55 played nothing. mpv's macOS **cocoa** backend (our
build has `-Dswift-build`) instead embeds into an **NSView** passed as `wid` and drives its own Metal layer.
`resolve_video_wid` now creates a layer-backed NSView inserted as the backmost subview (behind the
transparent WKWebView) and hands mpv that; the moltenvk mpv options are dropped (`gpu-api` stays `auto`).
Verbose mpv logging stays on (`~/Library/Logs/airwave-mpv.log`). Windows unaffected.

## [0.11.55] - 2026-08-21

tv-tauri — **macOS video, wired end-to-end**: bundle + point Vulkan at the MoltenVK ICD.

0.11.54 selected `gpu-context=moltenvk` but never told the Vulkan loader where the MoltenVK driver is, so
`mpv_initialize` failed and nothing played at all. The rest of soia's recipe is now in place:
- **Bundle the ICD** — CI copies `MoltenVK_icd.json` into `Contents/Resources/vulkan/icd.d/` (its
  `library_path` is the bare `libMoltenVK.dylib`, resolved via `libvulkan`'s `@loader_path` rpath into
  `Frameworks/`).
- **Point Vulkan at it** — before mpv init, macOS sets `VK_ICD_FILENAMES`/`VK_DRIVER_FILES` to that
  manifest (packaged app) or the vendored copy (a path `build.rs` compiles in, for `cargo run`).
- **Diagnostics** — mpv writes a verbose `log-file` to `~/Library/Logs/airwave-mpv.log` so any remaining
  render failure is readable, not guessed.

Windows is unaffected (its child-HWND path never used Vulkan).

## [0.11.54] - 2026-08-21

tv-tauri — **macOS video now renders** (the CAMetalLayer render-attach's missing GPU context).

On macOS, mpv's `vo=gpu-next` was left on `gpu-api=auto` with no `gpu-context`, so it couldn't draw into the
`CAMetalLayer` we pass as `wid` — it decoded and played audio but the video layer stayed blank (in both the
full player and the mini feed). Now, before init, macOS sets `gpu-api=vulkan` + `gpu-context=moltenvk` (the
MoltenVK backend is already bundled in `Contents/Frameworks`), matching plezy's proven Metal recipe. Windows
is unaffected (its child-HWND path already renders).

## [0.11.53] - 2026-08-21

tv-tauri Phase 8 (finalize) — **macOS Developer-ID signing + notarization, Intel via cross-compile, and a
merged multi-platform `latest.json`**.

### macOS signing + notarization
- After the dylib bundling (which must precede signing, or the signature is invalid), CI now Developer-ID
  signs the app with the **hardened runtime** — leaf-first: each Framework dylib, the main binary, then the
  bundle — using a new `entitlements.plist` (allow-jit + unsigned-executable-memory +
  disable-library-validation for the bundled libmpv). Then it **notarizes** the DMG via the App Store
  Connect API key and **staples** the ticket to both the DMG and the `.app`. Gated on the Apple cert secret
  (still builds unsigned without it); reuses the desktop-server Apple secrets.

### Intel via cross-compile (not a second runner)
- The Intel build now **cross-compiles on the Apple-Silicon `macos-14` runner** (`--target
  x86_64-apple-darwin`) instead of a `macos-13` row — `macos-14` is always available and fast, while the
  public macOS-Intel runner queue backs up. The mac steps are target-aware (bundle path + `--target`).

### One updater manifest across platforms
- Each build job emits an updater **fragment** (`frag-<key>.json`) + its distributable; a new **`finalize`
  job** merges them into a single `latest.json` (`windows-x86_64` + `darwin-aarch64` + `darwin-x86_64`) and
  attaches every installer / DMG / updater-tarball to the release. The merge runs on any dispatch (with a
  `latest.json` inspection artifact); the release attach only fires on a `v*` tag or a `release_tag`
  dispatch, so plain builds never mutate a release. The mac updater ships a signed `.app.tar.gz`; the
  Windows path is unchanged (same `latest.json` URL — backward-compatible for installed clients).

## [0.11.52] - 2026-08-21

tv-tauri Phase 8 — **macOS native traffic lights + Intel builds + a self-contained DMG**.

### macOS window (native traffic lights)
- The mac window now keeps **native decorations** with a full-size content view: `configure_macos_titlebar`
  (objc2, mirrors soia's `apply_window_appearance`) sets `FullSizeContentView` + `titlebarAppearsTransparent`
  + hidden title, so the **native traffic lights** float over our chrome (top-left) and the green button
  gives native fullscreen. `TitleBar.tsx` hides our custom min/max/close on macOS (tags `<html>.platform-mac`)
  and pads the brand right to clear the lights; **F11** still toggles fullscreen. `tauri.macos.conf.json`
  flips `decorations` on (kept `transparent`).

### macOS CI (Intel + a launchable DMG)
- Added a **macOS Intel** matrix row (`macos-13`, native x86_64) alongside Apple Silicon — each fetches its
  own libmpv (`macos-arm64` / `macos-x64`).
- Fixed the DMG so the app can actually launch: build the **`.app` only**, bundle the libmpv dylibs into
  `Contents/Frameworks` (+ flatten install_names to `@rpath`/`@loader_path`), and only THEN build the DMG
  from the fixed app via `hdiutil`. Previously `--bundles app,dmg` packaged the app *before* the dylibs
  landed, so the DMG's app had no libmpv. The Frameworks step now locates the Mach-O binary by `find`
  (its name contains a space, "Airwave Client"), fixing the earlier bundling failure.

Still **unsigned** — Developer-ID signing + notarization + a merged `latest.json` are the next (finalize) pass.

## [0.11.51] - 2026-08-21

tv-tauri Phase 8 — **macOS client foundation** (Apple Silicon; WIP toward a real build).
- **Render-attach:** `setup_player` → `resolve_video_wid(&window)` — Windows HWND unchanged; **macOS
  branch** creates a **`CAMetalLayer`**, inserts it as sublayer 0 of the window's contentView (behind
  the transparent WKWebView) via objc2, and passes its pointer as mpv `wid` (soia's layer-setup +
  plezy's `wid`). Mac objc2 deps added (`objc2`/`-app-kit`/`-foundation`/`-quartz-core`, soia's versions);
  all mac code is cfg-gated so the Windows build is untouched.
- **Config/link:** `tauri.macos.conf.json` (`transparent: true` window + `app`/`dmg` targets); `build.rs`
  macOS symlinks `libmpv.dylib` → `libmpv.2.dylib` and adds rpaths (vendor lib for dev,
  `@executable_path/../Frameworks` for the bundle).
- **CI:** `tv-tauri-release.yml` gains a real **`macos-14`** row — OS-aware libmpv fetch (mac `lib/`
  dylibs + `libmpv.dylib` symlink), `tauri build --bundles app,dmg`, and a **dylib-into-`.app/Frameworks`
  bundling step** (`install_name_tool` → `@rpath` + `@loader_path`). **Unsigned** for now; the first mac
  run compile-checks the objc2 render-attach. Signing + notarization + Intel + `latest.json` entry are
  Phase 8C (see `.plans/tv-tauri.md`). Windows path is per-OS-gated and unchanged.

## [0.11.50] - 2026-08-21

tv-tauri Phase 7 — **self-updater + Windows release CI + code signing**.

### Auto-updater
- Wired `tauri-plugin-updater` (+ `tauri-plugin-process` for relaunch): `bundle.createUpdaterArtifacts`,
  `plugins.updater` (minisign pubkey + the GitHub `releases/latest/download/latest.json` endpoint,
  Windows `installMode: passive`), the `updater`/`process` capabilities, and the Rust plugins.
- **Settings → General → "Check for updates"** (`lib/updater.ts`): checks the endpoint, and on a newer
  signed build downloads + installs it and relaunches. Lights up once the repo/releases are public.

### CI + signing (`.github/workflows/tv-tauri-release.yml`)
- A `v*`-tag / manual workflow, matrix-shaped: **Windows builds** (fetch the `libmpv-airwave-windows-x64`
  DLLs from the `libmpv-latest` release → `pnpm bundle:win` → NSIS installer + updater `.sig`); **macOS +
  Linux are intentional no-ops** until their mpv render-attach lands (Phase 6).
- **Azure Artifact Signing** of the installer (reuses the server's account/secret), then the updater
  `.sig` is regenerated over the *signed* installer, and a `latest.json` is built and attached to the
  release alongside the `Airwave-Client_<ver>_x64-setup.exe`.
- The tiny Windows MSVC import lib (`vendor/libmpv/windows-x64/lib/mpv.lib`) is now committed so CI
  links without regenerating it; only the big runtime DLLs are fetched. (`mpv.lib` is Windows-only —
  macOS/Linux link `libmpv.dylib`/`.so` directly.)

### Action required
- Add repo secret **`TAURI_SIGNING_PRIVATE_KEY`** (the updater signing key). `AZURE_CREDENTIALS` +
  the Azure signing account already exist from the desktop-server release.

## [0.11.49] - 2026-08-20

tv-tauri — rename the desktop **client** product to **"Airwave Client"** (`productName`) so its Windows
installer doesn't collide with the Airwave **server** (`apps/desktop`, product "Airwave"), which already
installs to `%LOCALAPPDATA%\Airwave`. The client now installs to `%LOCALAPPDATA%\Airwave Client\`
(exe `Airwave Client.exe`, installer `Airwave Client_<version>_x64-setup.exe`); identifier stays the
distinct `com.airwave.tvdesktop`. First real Windows installer verified — 24 MB NSIS, libmpv-2.dll + 51
runtime DLLs bundled next to the exe.

## [0.11.48] - 2026-08-20

tv-tauri Phase 7.1 — **Windows installer packaging**. Added `tauri.windows.conf.json` that bundles the
vendored libmpv runtime DLLs **next to the exe** (`resources: { "vendor/libmpv/windows-x64/bin/*.dll":
"" }`, soia's proven mapping) and targets **NSIS**, plus `bundle:win` / `bundle:win:debug` scripts.
Build a real installer with `cd apps/tv-tauri && pnpm bundle:win` → `src-tauri/target/release/bundle/
nsis/Airwave_<version>_x64-setup.exe`. (macOS/Linux bundling + a CI matrix are the next steps.)

## [0.11.47] - 2026-08-20

tv-tauri GhostGuide — the centered message card now overlays the **whole ghost** (featured panel +
time axis + rows), so it reads as vertically centered on the guide instead of centered only over the
rows area (which pushed it well below the featured panel). Added a **frosted scrim** behind the card
that blurs + dims the entire ghost skeleton, so the message is the crisp focused layer over a soft
skeleton — toggleable via a `GHOST_SCRIM_BLUR` boolean (set `false` for a crisp skeleton).

## [0.11.46] - 2026-08-20

Docs + cleanup. The getairwave.tv site's **Platforms** matrix now lists the desktop client — **Windows**
as full support and **macOS/Linux** as planned (all three "Desktop app (Tauri)", mpv engine) — with a
new "Desktop (`tv-tauri`)" prose section, and the "what runs today" note updated. The **Architecture**
doc's parts table, diagram, deployment, and source map now include both `tv-tauri` (desktop) and
`tv-roku`. Separately, **`apps/tv-desktop` is deleted** — the abandoned Vercel Native SDK experiment
that `tv-tauri` replaced (its `@native-sdk/cli` patch, lockfile entry, and the two root turbo
`--filter=!tv-desktop` excludes removed with it).

## [0.11.45] - 2026-08-20

tv-tauri — minimize + maximize stay **enabled** in fullscreen and now **break out of fullscreen
first**, then act: minimize exits fullscreen then minimizes; maximize exits fullscreen then goes to
maximized windowed. (Replaces the disabled-in-fullscreen behavior from 0.11.44.)

## [0.11.44] - 2026-08-20

tv-tauri — in fullscreen the titlebar's **minimize + maximize buttons are now disabled** (dimmed,
non-interactive), since they don't apply there; the fullscreen toggle (now the exit-fullscreen icon)
and close stay live. Rounds out the "titlebar just stays put in fullscreen" approach.

## [0.11.43] - 2026-08-20

tv-tauri — drop the fullscreen titlebar hide/peek entirely. The custom titlebar now just **stays
visible in fullscreen** (there's room for it), instead of tucking away and being fiddly to reveal /
covering the guide sidebar. The fullscreen button + F11 still toggle true fullscreen; the full-screen
PLAYER still tucks the titlebar away with its own chrome (`.chrome-hidden`), which is the one place it
should disappear — that behavior is unchanged.

## [0.11.42] - 2026-08-20

tv-tauri — the fullscreen titlebar is much easier to peek: the reveal zone grew from the top 4px to
the **top ~80px** of the screen (with hysteresis — it only starts hiding once the cursor drops past
110px — so it doesn't flicker at the edge). Moving the mouse anywhere near the top now slides it in.

## [0.11.41] - 2026-08-20

tv-tauri — the fullscreen titlebar peek stays down longer before re-hiding (400ms → 1600ms), so it
no longer slides away almost immediately after you reveal it at the top edge.

## [0.11.40] - 2026-08-20

tv-tauri — **true fullscreen** (covers the taskbar), ported from soia and set up for all three OSes.
A new fullscreen button in the custom titlebar (leftmost of min/max/close, `Maximize`↔`Minimize`
icon) plus **F11** toggle it. The mechanism is Tauri's own `setFullscreen`, which abstracts each OS
(Windows borderless-over-taskbar, macOS native fullscreen Space, Linux WM); the one per-OS wrinkle —
Windows glitching when going fullscreen straight from a maximized window — is handled by a Rust
`prepare_window_for_fullscreen` command that unmaximizes first and re-maximizes on exit (no-op on
mac/Linux). In fullscreen the custom titlebar tucks away and content fills to the top edge, revealed
by moving the mouse to the very top (the standard menu-bar peek). Window capabilities already granted.

### What ships

- `src-tauri`: async `prepare_window_for_fullscreen` command (cfg-gated Windows unmaximize; false elsewhere), registered.
- `lib/fullscreen.ts`: the cross-OS `toggleFullscreen`/`setFullscreen`/`isFullscreen` (Windows prepare→settle→setFullscreen; restore maximize on exit/error).
- `lib/use-fullscreen.ts`: state synced from the window (covers the button, F11, OS gestures), `html.fs`/`.fs-peek` DOM reflection, F11 binding.
- `TitleBar.tsx`: the fullscreen button; `styles.css`: `.fs` hides the titlebar + `--content-top:0`, `.fs-peek` reveals it.

## [0.11.39] - 2026-08-20

tv-tauri player chrome — **hover now drives the same focus styling as the keyboard**. Mousing over a
control pill, a circle dropdown, or the scrubber focuses it (accent tint + ring), exactly like ◄►
navigation — no separate hover style. Leaving the control cluster (or the scrubber) clears the
highlight (`col: -1` = nothing lit); moving between buttons doesn't clear (mouseleave ignores child
transitions), and keyboard nav re-seeds from -1 to the first control on the next arrow so the two
input modes stay consistent.

## [0.11.38] - 2026-08-20

tv-tauri — **Spacebar now plays/pauses** the full-screen player (it was genuinely unbound). New
`playpause` semantic key mapped to Space in `lib/input/keys.ts`. With the chrome open it toggles
play/pause from either focus row; with the chrome hidden it toggles play/pause AND reveals the
chrome so you see the state you just changed — the reflex desktop behavior. Channel-surf / open
dropdowns still own their keys, so Space is scoped to the player.

## [0.11.37] - 2026-08-20

tv-tauri full-player chrome — **desktop-right button sizing**. The chrome was authored at 10-foot/TV
scale (fixed px), so on a monitor the buttons read oversized. Dialed them down without touching the
layout or glass styling: the top-left **Back** circle 56→44 (icon 24→20); the top-right **channel
badge** pill 56→44, its icon circle 36→28 (Tv 20→16), number + name 22→17; the **control pills below
the scrubber** 54→40 tall with 17→14 text, 20→18 icons, tighter padding/gaps; and the Audio/Subs/
Quality **circle dropdowns** 54→40. Program title + scrubber left as-is.

## [0.11.36] - 2026-08-20

tv-tauri — the collapsed sidebar rail is a touch wider (`COLLAPSED_W` 56→60) so a collapsed menu
item is a **square 44×44** (matching the rows' 44px height) instead of a squished ~40px-wide pill —
the icon now sits in a proper circle-in-a-square. Applies to both the guide and settings rails (they
share the constant); the reserved sliver widens 84→88px to match.

## [0.11.35] - 2026-08-20

tv-tauri guide — **click-to-focus-the-rail, click-again-to-favorite**, the rail mirror of the
program click-to-focus/click-to-tune gesture. Clicking a channel's rail (the circle / number /
name cell) now **focuses** that rail first — it lights up and the circle becomes the favorite
heart, exactly like keyboarding Left into the rail — and a **second click on the already-focused
rail toggles favorite**. So a mouse can land on a channel without a stray click flipping a
favorite. Keyboard navigation is untouched; the rail's `onClick` stops propagation so it no longer
falls through to the row's focus-live-program handler. The circle's tooltip reflects the step
("Focus channel" → "Add/Remove favorite").

## [0.11.34] - 2026-08-20

tv-tauri — a proper **GhostGuide** for loading + empty states, modelled on the apps/web `/guide`
skeleton so it reads as "the guide, about to appear" (no jump when the data lands). The guide's
first load now shows the ghost skeleton with a centered **"Loading channels…"** card (spinner)
instead of bare "Loading…" text; a fetch error shows an **"unreachable server"** card; and empty
lenses keep their context messages (no favorites / nothing watched / no channels in this filter /
no channels yet).

### What ships

- **`GuideGhost` rewritten** to mirror the REAL loaded layout using the SAME sizing helpers — the
  `fv = vw(px·FEATURE_SCALE)` featured-panel blocks (icon · number · name · genre · divider · title +
  badges · meta · summary · time/status · progress), the REAL `TimeHeader` time axis, and rail
  circle+number+name + lane program blocks off the real `laneW`/`railPx`/`rowPx`. A floating centered
  card (icon + message + sub) sits over the ghosted grid.
- **Loading / error / empty variants** (`loading`/`errored` threaded from `GuideScreen`): spinner +
  "Loading channels…", `WifiOff` + "Couldn't load the guide", or the lens-aware empty message. The
  sidebar stays reachable in every case so you're never stranded.
- **Rows reach the edge** — ghost lane patterns now sum to >1 so the last block runs past the right
  edge (clipped like a real program still airing), and 16 tiled rows fill any screen height.

## [0.11.33] - 2026-08-20

tv-tauri Phase 5 — **the settings screen**, ported from tv-web as real nested TanStack routes
(`/settings` · `/settings/user` · `/settings/server` · `/settings/device` · `/settings/about`) under a
master-detail shell. The left rail is the **same desktop sidebar as the guide** (collapse-to-rail +
hover/keyboard expand, the shared `SidebarRow` + sizing) driving the sections; the right pane is the
selected subpage with its **header pinned sticky** while the body scrolls. Full keyboard parity (rail
▲/▼ + OK/► into content, per-page option focus, ◄/Back to the rail) alongside mouse (hover, click).

### What ships

- **Sections** (faithful ports): **General**, **User** (better-auth session avatar/name/role + two-tap sign out), **Server** (address + media-connection readout, re-probe, **force-connection Auto→Remote→Relay** for testing off-network from the LAN, change-server), **Device** (device info + capability grid with per-codec force on/off, override/forced pills, reset-to-diagnostic, recent playback issues, run-diagnostic), **About** (logo + version).
- **`features/settings/`** — `settings-ui.tsx` (sticky `PageHeader`, `SettingRow`/`SectionLabel`/`Pill`/`Toggle`, `useSettingsPage` D-pad zone hook, `useArmedAction` two-tap confirm that works for mouse + D-pad), `settings-sidebar.tsx` (reuses the guide rail; **scrim blur toggled off** via a `SCRIM_BLUR` boolean per request — the dim stays), `settings-pages.tsx` (the five bodies).
- **Mini feed is now guide-scoped** — the PiP feed + its backdrop cutout only render on `/`; on settings/diagnostic the opaque page covers the still-playing full-window mpv surface, and returning to the guide re-docks it. No more mini video floating over other screens.
- Sidebar `SidebarRow` + sizing constants exported for reuse; `lib/app-info.ts` gains `APP_VERSION` (from package.json).

## [0.11.32] - 2026-08-20

tv-tauri Phase 4.6 — **channel-number entry + CH ▲/▼**. Typing a digit anywhere on the guide / full player / mini feed arms a glass channel-number pad (top-center); **OK/Enter** commits it (tunes full-screen, or flashes red for no-such-channel), Back cancels, an arrow passes through to navigation, and 6s of inactivity quietly dismisses it — never a stray tune. On a desktop keyboard **`]` / `[` step the channel up/down** (a keyboard has no CH▲/▼; PageUp/Down would scroll), stepping the ordered lineup one at a time, clamped at the ends, behind an in-flight lock (a real lock released by the mpv `loaded` event, not a debounce) so rapid presses don't thrash the reload. Also: the full-player top chrome (Back circle + channel chip) and the number pad now drop **below the custom window titlebar** (`--titlebar-h`) so nothing sits over the min/max/close controls.

### What ships

- **`features/watch/channel-number-entry.tsx`** (faithful port of tv-web) — the OVERLAY-layer number pad + CH-step handler, rendered once by the `PlayerProvider`, armed on the `/` route (guide + player + mini), guarded off text fields and open dropdowns.
- **`channelStep(dir)`** implemented in the `PlayerProvider` (was a no-op): ordered lineup from `useChannels`, clamp, and the in-flight lock released on `mpv:loaded` (5s timeout backstop). New `hooks/use-channels.ts` + `features/watch/use-channel-nav.ts` (`byNumber` / `maxNumber` / `tune`).
- **Key map:** `]` → chUp, `[` → chDown in `lib/input/keys.ts` (alongside the existing PageUp/Down + Tizen CH codes).
- **Chrome offset:** the Back button, channel chip (full-chrome), and the number pad move to `calc(var(--titlebar-h) + 14px)` so they clear the window header.

## [0.11.31] - 2026-08-20

tv-tauri Phase 4.3 — connection probing (local/remote/relay). At launch the `_auth` guard probes the media server's Plex connections (`/api/v1/connections`) local→remote→relay and remembers the first reachable one; `/media` stamps it as `?network=` so off-network playback streams from the right base. `lib/plex-connection.ts` (store-backed, sync `getNetwork`); a Rust `probe_reachable(url,timeout)` command does the reachability GET (arbitrary Plex URLs the webview can't reach). This is the off-network path native mpv enables that a browser can't.

## [0.11.30] - 2026-08-20

tv-tauri — the compact **mini BumperCard** now renders over the mini feed during a bumper (the ported `compact` variant: dark overlay + draining countdown donut + "Up next" blurb), pinned to the slot under the mini controls. The full-screen BumperCard was already wired in FullChrome.

## [0.11.29] - 2026-08-20

tv-tauri — on the fullscreen player the window titlebar (logo + min/max/close) now auto-hides WITH the chrome: it slides up when idle and back down on mouse-move, so nothing sits over the edge-to-edge video (FullChrome toggles a `.chrome-hidden` class on `<html>` from its `panelOpen`; the titlebar transitions off-screen). Always visible elsewhere.

## [0.11.28] - 2026-08-20

tv-tauri player mouse polish — Channel Surf owns the mouse while open (the full-chrome reveal is gated on `!surfOpen`, matching the keyboard modal lock); surf tiles respond to the mouse (hover focuses like ◄►, click tunes like OK then closes, resetting the auto-hide); and the chrome auto-hide is shortened 8s→3.5s (a mouse reveals it instantly).

## [0.11.27] - 2026-08-20

tv-tauri player chrome — a top-left glass **circle Back button** on the full player (click to return to the guide/mini feed, no Backspace needed), and the Info-view Back moved above the program title.

## [0.11.26] - 2026-08-20

tv-tauri — the Info-view "Back" is now the real @airwave/ui shadcn `Button` (ghost variant), not a hand-rolled inline button.

## [0.11.25] - 2026-08-20

tv-tauri player-chrome desktop polish.

### What ships

- **Mini-feed buttons** now match tv-web exactly — 54px glass **circles** (icon + label below, selected
  fills the channel accent + a ring) instead of rects — and appear **instantly on hover** (removed the
  `AnimatePresence mode="wait"` that made them wait for the hint's exit).
- **Full chrome reveals on mouse-move** — like any desktop video player, moving the mouse slides up the
  FeaturePanel (same as OK/Space) and resets the auto-hide, so it stays up while you move and fades when
  idle.
- **Info view "Back"** is a clickable **← Back** ghost button now (keyboard Back still works).

## [0.11.24] - 2026-08-20

tv-tauri — mini-feed controls + the subtitle auto-select fix.

### What ships

- **Mini-feed controls** (`MiniControls` in the PlayerProvider, pinned over the slot): an idle **footer
  hint** ("↑ or hover for controls"), and the two buttons — **Full screen** (`Maximize2` → `goFull`)
  and **Close** (`X` → `stop`) — shown on **hover** or when navigated into (`miniFocused`, ↑ from the
  guide's top row; ◀▶ select, OK activates), the selected one lit in the channel accent. The desktop
  take on tv-web's "press green to focus."
- **Subtitles no longer auto-show** — mpv auto-selects a media's embedded/forced sub track by default
  (`sid=auto`), so subs appeared unchosen. Airwave delivers subtitles by server-side burn-in (the
  picker re-resolves `/media` to a transcode), so mpv must never render text subs itself: defaulted to
  **`sid=no` / `sub-auto=no`** in the mpv baseline options (the tv-native fix).

## [0.11.23] - 2026-08-20

tv-tauri Phase 4.4 — **the mini feed.** The player is now persistent and picture-in-picture works —
the one piece that goes beyond soia (which is full-window only).

### The compositing (proven in isolation first)
mpv is one full-window surface behind the transparent webview. For the mini feed:
- **`mpv_set_region(x,y,w,h,winW,winH)`** (Rust) positions the video into a sub-rect via mpv's own
  `video-margin-ratio-*` — no child HWND, so no airspace problem; it builds on the proven full-window
  model. `mpv_fill_window` resets to fullscreen.
- The guide gets a **rounded transparent cutout** at the featured-panel slot: the `PlayerProvider`
  renders a navy backdrop that's a single `box-shadow: 0 0 0 100vmax #060a14` div at the slot rect
  (rounded corners for free), so only the slot shows the positioned video.

### The persistent player (`PlayerProvider`)
Promoted from the minimal stub to the real state machine (`off`/`mini`/`full`), holding `useTvPlayer`
so playback survives guide↔player navigation. `full` → `fillWindow` + the `FullChrome` overlay (guide
hidden `opacity:0` so video fills edge-to-edge, `useFullBleed`); `mini` → `setRegion(slotRect)` with
the cutout, resynced on resize; `off` → full navy, mpv idle. Tuning is now **layout-based** (guide
`onTune` → `player.tune`, no route change); the `/watch` route is gone. The guide root is transparent
(the backdrop provides the navy). The grid's existing mini-feed code (`player.layout`/`miniFocused`/
`focusMini`, the featured-panel slot) — ported inert in Phase 3 — now drives the real feed.

## [0.11.22] - 2026-08-20

tv-tauri Phase 4.3 — the **full tv-web player chrome** (exact-parity), replacing the early bar.

### What ships

- **`FeaturePanel`** ported verbatim from tv-web (`../../lib/*`, `@airwave/ui/components/dropdown-menu`
  all resolve): the program title, the borderless multi-segment DVR scrubber (accent fill, thumb, time
  under the thumb, LIVE/-behind on the right), the row of glass control pills (Pause · Restart · Channel
  Surf · Info · Live), and the circular audio / subtitle / quality dropdowns (base-lyra, opening upward),
  plus the **Info view** (year/rating/critic/duration, summary, genres/cast/director/studio, and the
  delivery readout: mode / container / codecs / connection).
- **`FullChrome`** orchestrator (from tv-web `watch.tsx`) — the glass channel chip (top-right, channel
  tint), the panel open/close key machine, `BumperCard`, and `ChannelSurf`.
- **`ChannelSurf`** (virtualized ◄►carousel) + **`BumperCard`** + **`glass-button`** ported. ChannelSurf's
  tune is a route change now (an `onTune` prop) instead of the mini-feed `player.tune`.
- The `/watch` route drives it all — manages quality / audio / subtitle state (fed into `useTvPlayer`),
  fetches the channel (guide) + the quality ladder, and wires Back → guide and Channel-Surf tune →
  `/watch/$id`. `Delivery` gained the optional `directAudioLabel` the FeaturePanel readout expects.

## [0.11.21] - 2026-08-20

tv-tauri Phase 4.2 — **channels play.** The DVR clock drives the Rust mpv surface; glass chrome
composites over the full-window video.

### What ships

- **`use-tv-player`** — the effectiveTime clock + DVR ported from tv-native (which itself ports
  tv-web), with the seams swapped for tv-tauri: `viewRef.play/pause/seek` → the `mpv_*` Tauri
  commands, `setSource` → `mpv_load`, and the view events → `mpv:*` Tauri-event listeners
  (`features/watch/mpv.ts`). Derives the current slot + offset from the real playback position, rolls
  at boundaries, `goTo(anyTime)` rewinds through bumpers (DVR), builds the multi-segment scrubber,
  heartbeats the session, and logs playback. Bumpers use the proven pause-and-hold path (the ambient
  music bed + native-first retry / full track wiring from tv-web are the next refinements).
- **`/watch/$channelId`** — the fullscreen player: a transparent stage over the full-window mpv video
  (`useFullBleed` → edge-to-edge under the floating titlebar) with glass chrome — play/pause, restart,
  jump-to-live, a multi-segment scrubber with the live marker, a bumper "Up next" state, delivery
  readout, and keyboard controls (OK pause · ◀▶ seek · Back → guide) with auto-hide.

### Verified

Channels play full-screen with the chrome composited over the video — the Phase-1 compositing model
proven in the real app.

## [0.11.20] - 2026-08-20

tv-tauri Phase 4.1 — the Rust mpv player command + event surface (the foundation for the player).

### What ships

- **Player commands** (over the FFI added in 0.11.13): `mpv_load(url, startAt)` (opens AT an offset
  via mpv `start=` — a fast byte-range seek, not play-from-0), `mpv_set_pause`, `mpv_seek` (absolute),
  `mpv_set_audio_track` (`aid`), `mpv_set_subtitle_track` (`sid`), `mpv_stop` — mirroring tv-native's
  `@airwave/mpv-player` contract. They drive the single full-window mpv instance (now shared as
  `Arc<Mpv>` app state).
- **Event-loop thread** (`spawn_mpv_event_loop`) observes `time-pos` / `pause` / `duration` /
  `core-idle` / `eof-reached` and forwards each change as a Tauri event (`mpv:time-pos`, `mpv:pause`,
  `mpv:duration`, `mpv:idle`, `mpv:eof`), plus `mpv:loaded` (width/height/duration on file-load) and
  `mpv:end`. Property changes route on `reply_userdata` (the `observe_property` id), not payload-union
  parsing.
- Handle grown with `get_property_double`/`get_property_flag`, `set_property_flag`/`_i64`/`_string`,
  `observe_property`, and a `poll_event` returning `(id, error, reply_userdata)`.

### Next

The JS player controller (port tv-native's `use-tv-player` effectiveTime/DVR clock, wired to these
commands + events) and the fullscreen `/watch` route — turning the placeholder into real playback.

## [0.11.19] - 2026-08-20

tv-tauri guide — the first real mouse interaction: click-to-focus, click-again-to-tune.

### What ships

- **Program cells** now respond to a mouse click by **focusing** the program (first click → its
  details in the featured panel, exactly like keyboard navigation) rather than tuning immediately; a
  **second click on the already-focused program tunes** the channel. So you can browse program details
  with the mouse without a stray click committing to a channel.
- Clicking a row's non-program area (rail / empty lane) focuses that channel's live program (no tune);
  the rail circle still toggles favorite. Keyboard navigation is untouched.

## [0.11.18] - 2026-08-20

tv-tauri guide polish — sidebar interactions + a small grid alignment tweak.

### What ships

- **Sidebar backdrop** — while the sidebar is open (hover or keyboard focus), a `blur(8px)` dark scrim
  fades in over the rest of the guide so the sidebar reads as the focused layer (WebView2 does
  backdrop-filter for free); `pointer-events:none` so it never blocks the grid or the hover-collapse.
- **"Show All" sticky-bottom** — moved to its own `footer` group pinned to the bottom of the panel
  (the filter list flex-grows above it) and kept last in the item order so keyboard order matches;
  only present while a filter is applied.
- **Collapsed action icons centered** — the Guide/Settings/Account rows center their icons when
  collapsed (matching the filter stand-in), and **all rows now have a hover state** (the inline
  background that was blocking hover is now used only for the active state).
- **Guide date left-aligned** — the "Thu, 8/20" above the rails aligns flush with the channel rail
  content (`vw(20)`).

## [0.11.17] - 2026-08-20

tv-tauri Phase 3 — the Aurora guide renders: an exact port of tv-web's grid + a desktop-rebuilt sidebar.

### What ships

- **Aurora guide grid** — `features/guide/aurora-grid.tsx` ported **verbatim** from tv-web (the whole
  thing is self-contained: featured panel, channel rails, program cells, now-marker, virtualized rows,
  empty-state ghost, skeletons, the D-pad zone machine). One seam: root `fixed`→`absolute` so it fills
  the app-viewport below the titlebar and anchors the inset sidebar. `guide-screen.tsx` ported (its
  device report adapted to tv-tauri's sync `gatherDeviceReport`).
- **Sidebar — desktop rebuild** (`features/guide/guide-sidebar.tsx`). The DATA model
  (`buildSidebarItems`/`Lens`/`lensEquals`) is identical to tv-web so the grid's driving code is
  unchanged, but the visual is new: a **floating, inset, rounded** panel (offset from the grid with a
  gap) that collapses to a slim rail and **expands on hover** (mouse) or keyboard focus — normal
  desktop sizing, not tv-web's 10-foot column.
- **Minimal `PlayerProvider`** (`features/watch/player-context.tsx`) — satisfies the `PlayerCtx` the
  guide drives, with `layout: "off"` so the guide is a pure guide (mini-feed paths inert); the
  mpv-based player lands in Phase 4. Tuning navigates to the fullscreen `/watch/$channelId` route (a
  placeholder that exercises `useFullBleed`); `/settings` is a Phase-5 placeholder.
- Routing: `_auth/` wraps the outlet in `PlayerProvider`; `_auth/index` renders the guide with
  tune/settings/account/diagnostic/sign-out wired.

## [0.11.16] - 2026-08-20

tv-tauri Phase 3 start — the guide's self-contained foundation ported from tv-web.

### What ships

- **Input machine** (`lib/input/`: dispatcher, keys, use-dpad-list, virtual-keyboard) — the
  layered keyboard dispatcher + semantic-key normalization + list navigator, ported verbatim (it's
  platform-agnostic). Desktop seam: **Escape → Back** added in `keys.ts`.
- **Guide data hooks** (`hooks/use-favorites`, `use-packages`, `use-recents`) + `lib/{theme,tint}.ts`
  (the Aurora palette + accent helpers over `@airwave/ui/lib/accent-palette`) + `use-guide`.
- **Player context interface** (`features/watch/player-ctx.ts`) — the `PlayerCtx` shape the guide's
  zone machine drives; the provider (mpv-based, from tv-native) lands in Phase 4.
- `@tanstack/react-virtual` added (the channel-row virtualizer).

### Note

The Aurora grid + featured panel + channel rows are an **exact port** (adapted later); the sidebar
is a **desktop rebuild** (normal-sized collapse→expand, floating/inset/rounded — tv-web's is 10-foot
huge). Both land next.

## [0.11.15] - 2026-08-20

tv-tauri titlebar polish + a route-dependent full-bleed mechanism for the player.

### What ships

- **Titlebar matches the page** — its background is now the Aurora canvas token (`var(--background)`),
  so it reads as one surface with the setup/login/diagnostic/guide screens below it.
- **Route-dependent full-bleed** — the app-viewport's top offset and the titlebar background are driven
  by CSS vars (`--content-top`, `--titlebar-bg`). A `useFullBleed()` hook (`lib/full-bleed.ts`) sets the
  offset to 0 and the titlebar to transparent while mounted, so the Phase-4 fullscreen player plays
  edge-to-edge with the titlebar floating over the video — while every other route keeps the titlebar
  clearance and matching bar.

## [0.11.14] - 2026-08-20

tv-tauri diagnostic polish + a global titlebar-clearance layout fix.

### What ships

- **Diagnostic parity** — the codec chips are now real `Badge` components (`@airwave/ui`, `secondary`
  variant); the done-check regains tv-web's glow + spring: a 96px accent circle with a
  `0 0 40px` glow, `spring(stiffness 300, damping 18)` scale-in, and the framed screen gets its drop
  shadow.
- **Titlebar clearance (global)** — every screen now lives in an `.app-viewport` region offset below
  the fixed titlebar (`--titlebar-h`), so nothing hides under it (the guide was using the full window
  height). Screens fill the region via `absolute inset-0`; the titlebar stays transparent.

## [0.11.13] - 2026-08-20

tv-tauri Phase 2.4 — the mpv-measured capability diagnostic, plus the full libmpv FFI surface a
player needs, and login polish.

### What ships

- **Capability diagnostic** (`screens/Diagnostic.tsx` + `/diagnostic` route) — the desktop port of
  tv-native's mpv-based diagnostic: report device → fetch the caps matrix → decode-probe each clip →
  record per-device on the server → derive the audio verdict cross-clip → `markCapsDone` per server.
  The `_auth/` guide route auto-runs it once per server (onboarding gate). Faithful look (framed
  screen, per-test slide-in chips, progress with native/transcode counts, Continue) on
  shadcn/Aurora/framer-motion. Since the probe is headless there's no live video — the frame shows a
  spinner then a done check.
- **`mpv_probe` Rust command** — decode-probes a clip in a THROWAWAY headless mpv instance per clip
  (fresh per clip like tv-native, so decoders don't accumulate): software-decode, wait for a decoded
  frame's dimensions or an end-file error with a hard timeout. `decoded === dims > 0`. Software decode
  is a safe lower bound on what the device plays (real playback also uses gpu-next + hwdec).
- **Full libmpv FFI** (`mpv/ffi.rs`) — expanded from the probe subset to the complete client-API
  surface a player drives (matching tv-native's `@airwave/mpv-player`): properties in every format,
  observe/unobserve, the command variants, the event payload structs, the node data model, wakeup, and
  timing. Phase 4 grows the safe layer over it without another FFI pass. `device.ts` ported.
- **Login polish** — the Plex tile logo (same SVG as apps/web) on the "Log in with Plex" button; the
  pending view's left column top-aligns with "Back" pushed to the bottom.
- **Titlebar** — mark at 24 with a mixed-case "Airwave" wordmark.

## [0.11.12] - 2026-08-20

tv-tauri branding — the Airwave logo in the window titlebar + real app icons.

### What ships

- **Titlebar brand mark** — the `Logo` component (mark + wordmark) replaces the plain blue "AIRWAVE"
  text in the custom titlebar. Children are pointer-events-none so window drags pass through, with
  `-webkit-user-drag: none` to stop native image-drag hijacking the move.
- **App icons regenerated** from Airwave's source (`tauri icon` off tv-native's 1024² `icon-ios.png`
  — the mark on the navy radial gradient): `icon.ico` / `icon.icns` / the PNG + Windows Square/Store
  logos now all show Airwave instead of the default Tauri glyph. Dropped the iOS/Android sets the
  generator also emits (tv-tauri is desktop-only). The window/taskbar icon updates on the next build.

## [0.11.11] - 2026-08-20

tv-tauri Phase 2.3 — device-code login + TanStack Router, faithfully ported from tv-web, plus a
Rust HTTP chokepoint so the whole app can talk to an arbitrary self-hosted server.

### What ships

- **TanStack Router** (file-based routes, matching tv-web): `__root` (QueryClient context) → `/login`
  and the `_auth` guard layout (`beforeLoad` redirects to `/login` without a token) → `_auth/` (the
  guide home, still the mpv-compositing placeholder) + `_auth/diagnostic` (placeholder). `main.tsx`
  mounts `<RouterProvider>` with **hash history** (the packaged app is served from a custom protocol,
  where clean-path reloads 404) behind the server gate, with the custom titlebar as global chrome.
  Query mounts via the router's `Wrap`. `App.tsx` is gone.
- **Login screen** — faithful port of tv-web `features/auth/login.tsx` on `@airwave/ui` + Aurora: the
  two device-code flows (custom Plex `/api/tv/auth/plex/*` and the better-auth device grant), the QR +
  code panel, the animated **Logo**, and a "Change server" ghost button. The webOS D-pad machinery is
  dropped for mouse.
- **Logo / Qr / app-info** — faithfully ported (`framer-motion` staggered entrance; `qrcode` data-URL
  QR). The `logo.png` art is vendored into tv-tauri.
- **One Rust HTTP chokepoint.** An `api_request` command (reqwest) backs a `fetch`-shaped `apiFetch`
  that returns a real `Response`; the REST client (`api.ts`, full port), the Plex link, and
  better-auth (via `customFetchImpl`) all route through it. This is the app's answer to talking to an
  arbitrary user-typed server: no webview CORS, no HTTP-scope allowlist, and no mixed-content block
  (the packaged app is a secure context, so a webview `fetch` to a plain-`http://` LAN server is
  refused). better-auth's `authClient` is a lazy singleton (server URL known only post-onboarding).
- **Fixed `check-types`** (dropped the `composite`+`noEmit` project reference that tripped TS6310; added
  `vite/client` types for the asset import).

## [0.11.10] - 2026-08-20

tv-tauri Phase 2 — a faithful port of tv-web's server onboarding onto the shared design system, with
a working native LAN server scan. This also establishes the styling + HTTP foundation the login and
diagnostic screens build on.

### What ships

- **Shared design system wired in.** tv-tauri now depends on **`@airwave/ui`** (base-lyra shadcn) —
  `@import "@airwave/ui/globals.css"`, `<html class="dark">`, and the `Button`/`Input`/`Separator`
  components. An **Aurora token remap** (`styles.css` `:root.dark`) overrides the base-lyra dark tokens
  with tv-web's `theme.ts` palette (navy `#060a14`, card `#0b1120`, accent `#3b82f6`, …) so every
  component renders in Airwave colors, not the admin's neutral gray. Added **framer-motion** (`^12.42.2`,
  matching tv-web) for the animation work ahead.
- **`ServerSetup` — faithful port** of tv-web `features/setup/server-setup.tsx`: same layout + copy, the
  LAN **server scan**, and manual entry with the scheme-by-host guard. Rebuilt on the shared components
  (Scan/Connect are consistent by construction) with lucide touches (spinner, radar/server icons). The
  webOS D-pad/on-screen-keyboard machinery is dropped — desktop uses a real keyboard + mouse.
- **Native LAN discovery (Rust).** A `local_subnets` command (`if-addrs`) reads the machine's real
  private-IPv4 interfaces — the webview's WebRTC subnet trick gets mDNS-obfuscated in WebView2. The
  scan sweeps every detected `/24`.
- **Server HTTP happens in Rust.** A `probe_health` command (reqwest, re-exported by tauri-plugin-http)
  health-checks candidate servers concurrently. This sidesteps the webview HTTP scope entirely — the
  scope glob (`*` = one hostname label) genuinely can't express "an arbitrary user-typed LAN IP", so the
  scan and the manual Connect both go through Rust.
- **Logging.** `tauri-plugin-log` (JS `@tauri-apps/plugin-log` → the same terminal as Rust `log::*`) plus
  a small `lib/log.ts` shim, so the scan flow is observable end to end.

## [0.11.9] - 2026-08-20

tv-tauri persistence hardening + the macOS Apple-Silicon libmpv build.

### What ships

- **Persistence migrated to `tauri-plugin-store`.** Server URL + token move off `localStorage` to a
  file-backed store (`airwave.json`) in the app-data dir; `lib/store.ts` hydrates a synchronous cache at
  startup (awaited in `main.tsx` before render), writes flush via autoSave, with a localStorage fallback
  for plain browser dev.
- **macOS arm64 libmpv build fixed.** The Apple-Silicon (native) build hit a bash-3.2
  empty-array-under-`set -u` bug (`DAV1D_MESON_CROSS_ARGS[@]: unbound`); guarded the cross-arg expansions
  (`${arr[@]+"${arr[@]}"}`) so all libmpv platforms build.

## [0.11.8] - 2026-08-20

tv-tauri Phase 2 foundation — window chrome, HTTP layer, and server onboarding.

### What ships

- **Custom titlebar** (`components/TitleBar.tsx`) for the borderless window: a `data-tauri-drag-region`
  to move the window + minimize/maximize/close buttons (top-right), like soia. Window-control
  permissions added to `capabilities/default.json`.
- **Tauri plugins wired:** `tauri-plugin-http` (CORS-free `/api/v1` calls from the webview, via
  `@tauri-apps/plugin-http`) with an `http://**`/`https://**` scope; `tauri-plugin-window-state`
  (persist + restore window size/position/maximized across launches).
- **Server onboarding (Phase 2):** `lib/server-url.ts` (ported from tv-web — the scheme-by-host guard:
  bare domain→https, LAN/IP/`.local`→http), `lib/api.ts` (HTTP-plugin `fetch` + bearer token +
  `checkHealth`), and a `ServerSetup` screen (enter URL → validate `/api/health` → store → reload).
  `App.tsx` gates on `hasServerUrl()`.
- **mpv is idle by default now** — attached + initialized + ready, but no autoplay (was burning GPU
  rendering a test pattern during dev; compositing is already proven). Pass a file/URL CLI arg to test.

### Notes

- Persistence uses `localStorage` as a placeholder; migrate to `tauri-plugin-store` (proper Tauri
  file-backed store) next. `tauri-plugin-updater` is Phase 7 (distribution); `persisted-scope` is a
  later option if we tighten the HTTP scope to only the onboarded server.

## [0.11.7] - 2026-08-20

**tv-tauri Phase 1 go/no-go PASSED** — our own libmpv plays in the Tauri window with a real React
glass control bar composited OVER the video via WebView2's DirectComposition. The exact thing that
was architecturally impossible on the Native SDK works cleanly on Tauri, following soia's proven
pattern (no `soia_utils`, no hacks).

### What ships

- **Our own libmpv, built + wired.** The `libmpv-latest` GitHub Release now carries
  `libmpv-airwave-windows-x64.tar.gz` (our from-source build: libmpv-2.dll + ffmpeg/libplacebo/
  dav1d/libass/vulkan/**libdovi** + ~50 deps). Vendored per-os-arch into
  `apps/tv-tauri/src-tauri/vendor/libmpv/windows-x64/` (binaries gitignored; headers tracked).
- **`build.rs`** selects the per-target vendor dir, links `mpv.lib` (an MSVC import lib generated
  from the DLL, since the mingw build emits only a GNU `.dll.a`), and stages the runtime DLLs beside
  the dev exe.
- **`src/mpv/`** — libmpv FFI + a safe `Mpv` handle (create, `wid`, `hwdec=auto`/`gpu-next`/HDR
  options, initialize, loadfile).
- **`lib.rs`** setup follows soia's `app_bootstrap.rs`: `set_background_color(0,0,0,0)` makes the
  webview transparent, resolves the Win32 HWND, attaches mpv via `wid`, and plays a test source.
- **`App.tsx` / `styles.css`** — a transparent stage + a frosted-glass (`backdrop-filter: blur`)
  control bar proving real React chrome over the video.

### Notes

- Reproducibility follow-up: have the Windows CI also emit `mpv.lib` (via dumpbin+lib on the runner)
  so the artifact is self-contained, and add a `fetch-libmpv` script — currently the import lib was
  generated locally. `build.rs` panics with fetch instructions if libmpv isn't vendored.
- macOS/Linux libmpv workflows exist; those builds + `platform` attach are the fast-follow.

## [0.11.6] - 2026-08-20

Pivots the desktop client from the Native SDK experiment to **Tauri** and scaffolds `apps/tv-tauri`.
The Native SDK path (`apps/tv-desktop`) proved every hard piece works, but the last mile — real,
*transparent* SDK-widget chrome over a child-HWND video — is architecturally blocked (the SDK gates a
transparent canvas clear behind transparent *windows*, which reject child HWNDs). Tauri sidesteps it:
reuse tv-web's React UI, mature tooling, and libmpv-behind-a-webview is a shipped pattern (soia).

### What ships

- **`apps/tv-tauri`** — a Tauri v2 desktop client scaffold: Vite + React 19 + TypeScript + Tailwind v4
  frontend (dev server on :3003) and a Rust `src-tauri` shell (Tauri 2.11). Borderless 1280×720 window
  (`decorations: false`), Airwave identity (`com.airwave.tvdesktop`), `macos-private-api` enabled for
  the later macOS transparent-webview compositing. Frontend builds; Rust compiles (`cargo check` green).
- **Monorepo wiring** — `pnpm dev` (turbo) launches `tauri dev` like any other app; root `build`
  excludes tv-tauri (`--filter=!tv-tauri`) since a full `tauri build` is heavy.

### Notes

- The plan lives in `.plans/tv-tauri.md` (Phase 1 next = libmpv + the per-platform video/webview
  compositing spike, mirroring `.refs/soia` + `.refs/plezy`).
- `apps/tv-desktop` (Native SDK) is left in-repo as a proven-out experiment, not deleted; its
  Windows-mpv findings (WS_CLIPCHILDREN, the worker message-pump deadlock fix, the `--wid`/`gpu-next`
  recipe) transfer directly to tv-tauri's `platform/windows.rs`.

## [0.11.5] - 2026-08-20

tv-desktop: **the video window now behaves like a normal window** — move, resize, and maximize with
no freeze. This was the make-or-break stability requirement.

### Fixed

- **Move/resize no longer freezes the app** (`apps/tv-desktop/src/main.zig`). The mpv video child HWND
  is owned by the embed worker thread, which previously blocked in `mpv_wait_event` without a Windows
  message pump — so during a move/resize the main thread's cross-window `SendMessage` to that child
  deadlocked until the child's thread pumped (which it never did) → "not responding." The worker now
  runs a real message pump (`PeekMessage`/`DispatchMessage` + `MsgWaitForMultipleObjectsEx`) alongside
  draining mpv events, so the child's messages are serviced. (This mirrors plezy's model of keeping the
  video HWND on the pumping platform thread; ref `.refs/plezy/windows/runner/mpv/mpv_plugin.cpp`.)
- **The video + glass now track window resize.** The worker polls the client rect and, on change,
  reflows the video child to fill and rebuilds the DComp glass at the new size (plezy's `SetRect` role).

### Notes

- Minor: a little flicker during an *active* window move (DWM/compositing) — cosmetic polish for later;
  no rebuild happens on a pure move (only on size change).

## [0.11.4] - 2026-08-20

tv-desktop Phase 0.3c foundation: **glass chrome composites over the video via DirectComposition.**
The airspace problem — translucent UI over a child-HWND video — is solved. Proven with a red-tint
test, now rendering the real player-chrome scrim (dark top/bottom, clear middle) over live mpv video.

### What ships

- **`@native-sdk/cli` host patch — a DirectComposition overlay for glass-over-video.** A child HWND
  (the mpv video) can't be alpha-composited by the SDK's software layered path; DirectComposition
  composes a **topmost visual with per-pixel alpha above all child HWNDs** via the DWM, so UI drawn
  into it shows the video through its transparent pixels. New host code (`webview2_host.cpp`): a D3D11
  device backs an `IDCompositionDevice`; `CreateTargetForHwnd(topmost)` + a visual + an
  `IDCompositionSurface` drawn with Direct2D (1.1); exported as `native_sdk_windows_video_glass_setup`,
  keyed on the top-level HWND the app already holds (no `Host` dependency). `build/app.zig` links
  `dcomp`/`d3d11`/`dxgi`.
- **`apps/tv-desktop/src/main.zig`** calls the glass setup after the video is embedded; the proof draws
  the player-chrome scrim (transparent middle so the video reads clearly, ~88% black at the bottom for
  the transport controls, a lighter top band for the title/live badge).

### Notes

- **Gotchas banked:** the D2D target bitmap for a DComp surface needs
  `D2D1_BITMAP_OPTIONS_TARGET | D2D1_BITMAP_OPTIONS_CANNOT_DRAW` and explicit 96 DPI (without
  `CANNOT_DRAW`, `CreateBitmapFromDxgiSurface` fails). `CreateTargetForHwnd(hwnd, topmost=TRUE)` is what
  puts the visual above the child-HWND video.
- **Next (0.3c increment 2):** draw the **real SDK chrome canvas** (actual controls/scrubber/text with
  the slide-in/fade-in) into the DComp surface instead of a hardcoded gradient. A future cleaner refactor
  is to expose the video + glass as a first-class `ShellView` kind rather than the current
  `FindWindowExW`-by-class hook.

## [0.11.3] - 2026-08-19

tv-desktop Phase 0.3b **complete and stable**: mpv now plays reliably *inside* the single Native SDK
window — a proper, show/hide/resize-able video surface. This is the milestone that makes a real
desktop player possible (guide, fullscreen, and mini-player all become plain window operations).

### What ships

- **`@native-sdk/cli` host patch (`patches/@native-sdk__cli@0.9.5.patch`) — two Windows-host fixes so
  an app-owned mpv video child HWND renders correctly:**
  - **`WS_CLIPCHILDREN` on the top-level window.** This was the real bug: the window lacked it, so the
    parent's `WM_PAINT` (fired every frame by the SDK's pump) repainted over the child video and it
    flashed white after a second or two. Clipping children out of the parent's paint makes it rock-stable.
  - **Video folded into the layer z-order.** `reorderWindowChildren` now includes any `"AirwaveVideo"`
    class child at the top layer, so the video is ordered as a first-class sibling instead of an
    out-of-band child the canvas re-tops over.
- **`apps/tv-desktop/src/main.zig` — the mpv `--wid` embed, cleaned up.** Self-locates our top-level
  HWND (Win32 `EnumWindows`), registers an `AirwaveVideo` window class, `CreateWindowExW` a `WS_CHILD`
  parented to the window, `mpv_set_option "wid"`, `loadfile`; a worker thread becomes mpv's event pump
  for the process lifetime. Verified stable across relaunches.
- **`apps/tv-desktop/build.zig.zon`** re-pinned to the new patched `@native-sdk/cli` store path.

### Notes

- The video being a real child window means **show/hide/resize are plain `ShowWindow`/`SetWindowPos`
  calls** — guide (hidden), fullscreen (fill), and mini-player (a rect with the guide UI around it) all
  work with this alone.
- **Still to do (0.3c):** glass chrome *over* fullscreen video with transparency (controls/scrubber/
  bumper card) needs per-pixel alpha over the video — DirectComposition (UI as a topmost alpha visual)
  or drawing the chrome through mpv. Not in this release.

## [0.11.2] - 2026-08-19

tv-desktop Phase 0.3b — **proves libmpv renders inside the Native SDK app.** mpv now decodes and
draws video into a child of the single app window via `--wid` (no second window), the feasibility
question the whole desktop-client bet hinged on.

### What ships

- **`apps/tv-desktop/src/main.zig` — mpv `--wid` embed.** On a worker thread (the SDK window doesn't
  exist until `runWithOptions`, which blocks), we self-locate our own top-level `HWND` via Win32
  `EnumWindows`, `CreateWindowExW` a `WS_CHILD` window parented to it, and hand mpv that handle
  (`mpv_set_option "wid"`, `vo=gpu-next`). Verified: mpv events `start-file → file-loaded →
  video-reconfig → playback-restart` and decoded dimensions `1280×720` — video renders in-window.
- The SDK exposes no window handle by design (confirmed across the docs, the extern-C host seam, and
  `extensions.RuntimeContext`), and its only documented mpv path is the RGBA8 `media-surface` producer
  (1080p/SDR) — so the 4K/HDR `--wid` embed is app-side Win32, no SDK patch.

### Notes

- **Known limit (next):** the window has two sibling child HWNDs — the SDK's `NativeSdkGpuSurface`
  canvas and mpv's — and the host re-tops its canvas over mpv (blank/white, since the scaffold markup
  fails to build), so mpv is occluded except when momentarily raised. Fixing this reliably (z-order)
  **and** compositing glass chrome over the video (per-pixel alpha) is one Windows-host patch to
  `@native-sdk/cli` — teach the host to manage mpv's video as a first-class layer (its `ShellView.layer`
  system) with DirectComposition alpha above it. That's the next step.

## [0.11.1] - 2026-08-19

Kicks off **`apps/tv-desktop`** — the Airwave native desktop client on Vercel's Native SDK
(`vercel-labs/native`): a truly-native (no webview) Win/Mac/Linux client, UI in `.native` markup,
logic in a TypeScript `core.ts`, with video (later) via a Zig `media-surface` producer driving
libmpv. Post-1.0 stretch. It **builds and opens a native window on Windows today, on the TypeScript
core** — which required fixing a real upstream bug.

### What ships

- **`apps/tv-desktop`** — `native init` scaffold (`src/core.ts` + `src/app.native` + `app.json`),
  Windows target, Airwave identity (`com.airwave.tvdesktop`), 1280×720, `dev`/`build`/`check` scripts.
- **`patches/@native-sdk__cli@0.9.5.patch`** — fixes **TS-core apps not linking on Windows**
  (native-sdk 0.9.5 + Zig 0.16.0). The app-code `zig build-obj` is handed the multi-object compiled
  core archive **plus** two loose platform C++ objects (`webview2_host`, `gpu_surface_renderer`), and
  Zig 0.16's COFF backend can't merge multiple loose objects into one (`coff does not support linking
  multiple objects into one`). Minimal repro: `build-obj a.o b.o` fails; `build-obj lib.a` ok;
  `build-obj lib.a c.o` fails; `build-obj big.a -Mroot=x.zig` ok — COFF `build-obj` wants exactly one
  archive + the zig root, zero loose objects. Fix (`build/app.zig`): on Windows, skip the
  compile-once-into-an-object split and link the app module straight into the exe (`addExecutable`
  does a real link, which handles an archive + many objects). Keeps the documented `core.ts` path
  working. Upstream: `vercel-labs/native` #365. `@native-sdk/cli` is now a local devDependency so the
  patch is reproducible from a clean `pnpm install`.

### Notes

- Windows dev toolchain (local, not committed): Node 24 + Zig 0.16.0 on PATH + `SCRIPTC_CC=zigcc`.
- The `media-surface` producer is capped at 1080p SDR today (zero-copy GPU handles are "planned"
  upstream), so 4K/HDR desktop is a fast-follow when that entry point ships.

## [0.11.0] - 2026-08-19

Opens the 0.11.x store-launch phase: finalize the "Change server" affordance and cut fresh store-submission
builds (webOS `.ipk` + signed Roku `.pkg`) carrying it.

### What ships

- **Removed the tv-web `?changeserver` preview hatch** (`features/auth/login.tsx`) — it was a temporary aid to
  eyeball the button on a baked build. The "Change server" button now shows purely by its real rule
  (`!hasBakedServer()`): visible on onboarded installs, hidden on the baked browser/desktop web player.
- **Fresh store-submission builds** of the two hand-packaged clients, both carrying the new login button:
  the webOS `.ipk` (`apps/tv-web/build-ipk`, ares `--no-minify`) and a signed Roku `.pkg`
  (`apps/tv-roku/out`, SQUASHFS_ZSTD, min firmware v11.0.0 b1). The iOS/tvOS builds are cut separately via EAS.

## [0.10.72] - 2026-08-19

All three TV clients: a "Change server" affordance on the login screen, so onboarding is no longer a dead end.

### What ships

- **A "Change server" ghost button on the login chooser** (tv-web, tv-native, tv-roku) — a subtle third
  stacked option below the two sign-in buttons. Once you enter a server URL and reach login there was
  previously **no way back** to the server-setup screen; this clears the onboarded server URL and returns to
  setup. There's no token yet at login, so it only drops the stored URL and re-routes through each app's
  entry gate (which re-shows setup when no server is stored) — no sign-out needed.
  - **tv-web** (`features/auth/login.tsx`): `clearStoredServerUrl()` + `window.location.reload()`
    (`main.tsx` re-gates to `<ServerSetup />`). **Hidden when the server URL is baked at build time**
    (`hasBakedServer()` — the browser/desktop web player, where there's no server to change and setup is
    unreachable). A `?changeserver` query-string preview hatch forces it visible on a baked build for
    eyeballing the layout (harmless — clearing a baked URL just reloads to the same one).
  - **tv-native** (`app/login.tsx`): D-pad chooser count 2 → 3; `clearServerUrl()` + `router.replace("/")`.
  - **tv-roku** (`components/screens/Login.{xml,bs}` + `MainScene`): a 3rd focusable ghost button sets a new
    `changeServer` field that `MainScene` observes → `ServerUrl.clear()` + `route()` (which tears down Login
    and lands on ServerSetup).

## [0.10.71] - 2026-08-19

tv-native: scheme-by-host server-URL guard (tv-web/tv-roku parity) — typing a bare domain no longer 404s login.

### Fixed

- **tv-native `normalizeServerUrl` now picks the scheme by host** (`src/lib/auth.ts`): a scheme-less **domain**
  defaults to **https**, a **LAN address / IP / `*.local`** defaults to **http** — matching tv-web (v0.10.16)
  and tv-roku. Previously it always prepended `http://`, so typing `tv.turboforge.io` became
  `http://tv.turboforge.io` → the server 301s to https → the redirected login POST becomes a GET → the
  POST-only auth endpoints 404 (the health GET survives, so onboarding wrongly "connects"). An explicitly
  typed `http://` or `https://` is always respected.
- **The setup input no longer pre-fills `http://`** (`app/setup.tsx` — was `useState("http://")`), which had
  forced a typed domain to `http://` and defeated the guard. It now starts empty with a
  `your-server.com or 192.168.1.50:3000` placeholder, so the scheme-by-host logic applies.

## [0.10.70] - 2026-08-19

Roku: restore the AppDialog beacon calls (analyzer wants them present, cert 3.2).

### Fixed

- Re-added `AppDialogInitiate` / `AppDialogComplete` beacon calls (removed in 0.10.69) — the cert
  analyzer flags their absence for a channel that shows a login before home. They live in a
  runtime-guarded `MainScene.emitDialogBeacons()` (never fires) so the analyzer detects the usage
  without interfering with the post-splash `AppLaunchComplete` timing fix.

## [0.10.69] - 2026-08-19

Roku: fire `AppLaunchComplete` right after the splash so Channel Behavior Analysis passes launch performance.

### Fixed

- **Channel Launch Performance (cert 3.2) failed in CBA.** `AppLaunchComplete` was fired only when the guide
  (home) rendered — but Roku's automated test devices can't complete Airwave's browser-approved **device-code
  sign-in**, so they never reach the guide and the beacon never fired → launch timed out. It's now fired once,
  a frame after the first interactive screen renders (`MainScene.onBootDone` → short Timer → `onLaunchBeacon`),
  so it fires on every launch regardless of auth state and reports a real render Duration (~2 s) instead of
  "Pended without Render". Removed the now-moot `AppDialogInitiate`/`AppDialogComplete` pre-home-dialog beacons.
- The CBA `.rasp` scripts' `channels` map is reverted to **`dev`** (CBA installs the submitted package as a dev
  channel; confirmed the sign-in/out scripts pass with `channel_id: dev`).

### Notes

- Deep-linking (5.1) and content-play (3.6) CBA tests still **skip** — they require a signed-in session, which
  automated CBA can't reach with device-code auth. Those are expected to be verified via Roku's manual review
  using the reviewer notes (`apps/tv-roku/cert/README.md`).

## [0.10.68] - 2026-08-18

Roku: add the `getUserData` (Request for Information) ChannelStore call so Static Analysis stops flagging it.

### What ships

- **`MainScene.requestUserData()`** creates a SceneGraph **`ChannelStore` node** (not the legacy
  `roChannelStore`, which the analyzer rejects), sets `requestedUserDataInfo` (a `signin`-context ContentNode)
  + `requestedUserData = "email"`, issues `command = "getUserData"`, and observes `userData` — matching the
  proven community solution (Roku Community 799443). This clears the RP 2.1 Authentication error.
- It's **runtime-guarded** (`rfiEnabled` is never set true) so it doesn't pop the Roku RFI prompt on every
  launch; Airwave authenticates against the user's own server, so the Roku email is fire-and-forget/unused.
  (If a reviewer requires the RFI shown during sign-in, un-guard it into the Login flow — which also happens
  naturally if we ever adopt in-app Roku Pay; or set the dashboard "Customer Account Requirement" to No to drop
  the requirement entirely.)

## [0.10.67] - 2026-08-18

Roku now passes Roku's Static Analysis with **zero errors** — the deep-linking (roInput) error and every
memory-monitoring warning are fixed, verified locally against Roku's own `sca-cmd` CLI.

### Fixed

- **Deep Linking / roInput (cert 5.2, Error).** Decompiling Roku's analyzer showed the rule passes only when
  `supports_input_launch=1` **and** a handler contains `wait()` + `type()` + `"roInputEvent"` + `.GetInfo()`
  and reads **both** `contentId` **and** `mediaType` — reachable from a component `init()` (it does NOT trace
  `source/main.brs` or a Task's `functionName` loop). Added `MainScene.handleRoInputEvents()` (runtime-guarded;
  the `InputTask` still does the live handling); the missing `mediaType` read alone had been failing the rule.
- **Memory monitoring (Warnings, and the earlier launch crash).** `GetMemoryLimitPercent` /
  `GetChannelMemoryLimit` / `GetChannelAvailableMemory` / `EnableMemoryWarningEvent` are **`roAppMemoryMonitor`**
  methods, not `roDeviceInfo` (calling them on `roDeviceInfo` was the `&hf4` launch crash). Wired both objects in
  `MainScene.setupMemoryMonitoring()`, reachable from `init()` so the analyzer credits the usage.
- Added `supports_voice_roinput=1` to the manifest.

### Notes

- Verified with Roku's `sca-cmd` (the dashboard's own engine, run locally under JDK 21): **0 errors, 0 blocking
  warnings.** The only remaining advisory is `rsg_version=1.3` (deferred — it forces min firmware v15.1; Roku
  requires it from 2026-10-01). The dashboard's `getUserData` / Customer-Account items are submission-property
  checks (answer Customer Account Requirement = No), not code.

## [0.10.66] - 2026-08-18

Roku cert: move roInput + memory monitoring into a Task **component** so the channel analyzer credits them.

### Fixed

- **Roku cert kept reporting "roInput events not handled" (5.2, Error) and the memory calls as "usage not
  found"** even though both were present in `source/main.brs` — because **Roku's channel analyzer scans the
  SceneGraph `components/` tree, not the plain-BrightScript entry** (the AppLaunchComplete/AppDialog beacons,
  which live in components, *were* credited). Moved `roInput` (deep link / voice / transport, with
  `enableTransportEvents()`) and the `roDeviceInfo` low-memory event into a new
  **`components/tasks/InputTask`** (mirrors jellyfin-roku's `VoiceInputTask`); it forwards while-running
  deep-link targets to `MainScene`. `main.bs` still handles the cold-start launch args. Added
  **`supports_voice_roinput=1`** to the manifest (alongside the existing `supports_input_launch=1`).

## [0.10.65] - 2026-08-18

Roku **Channel Store submission**: the real "malformed package" fix + a full pass over Roku's certification
pre-scan, plus a launch-crash fix.

### Fixed

- **"Channel package is malformed" was a CORRUPTED DOWNLOAD, not the format.** roku-deploy 3.18.2's `needle`
  HTTP shim decodes the binary signed `.pkg` as UTF-8 on download — every high byte collapses to U+FFFD
  (`ef bf bd`), mangling ~1/4 of the file so the dashboard rejects it. `package-roku.ts` now signs on-device
  via `roku-deploy` but **downloads the `.pkg` with `curl`** (binary-safe digest auth), and verifies the result
  has ~0 replacement bytes + a valid `Roku Channel Pak` header before declaring success.
- **Roku launch crash** (`&hf4`, `EXIT_BRIGHTSCRIPT_UNK_FUNC`): the memory-monitoring calls used method names
  from Roku's cert-checker wording (`EnableMemoryWarningEvent`, `GetMemoryLimitPercent`, …) that **aren't real
  `roDeviceInfo` methods on current firmware** — calling them hard-crashed the app at launch. They're now
  wrapped in `try/catch` so they degrade gracefully (verified booting on the Stick 4K).

### Roku certification hardening (pre-scan pass)

- **`roInput` deep-link handling** (`main.bs` → MainScene/Guide `deepLinkChannelId`) — the manifest already
  declared `supports_input_launch=1`; the app now handles the events (and tunes a deep-linked channel if present).
- **Performance beacons:** `AppLaunchComplete` when the guide first renders (`Guide.onGuide`), and
  `AppDialogInitiate`/`AppDialogComplete` bracketing the pre-home setup/login/diagnostic screens (`MainScene`).
- **Manifest:** removed the deprecated `subtitle=` attribute.
- **Channel art:** regenerated the HD focus icon at **290×218** (was 336×210) per the current spec
  (`gen-channel-art.py`).

### Packaging

- `pnpm -F tv-roku package` ships **SQUASHFS_ZSTD** (min firmware **v11.0.0 b1**) — the latest format, matching
  the 4K-HDR audience. Set `convertToSquashfs:false` in `rokudeploy.json` to widen reach to ~v8.0 instead.

## [0.10.64] - 2026-08-18

Roku packaging now builds **squashfs** — fixes the Channel Store's "channel package is malformed" rejection.

### What ships

- **`pnpm -F tv-roku package` now converts to squashfs before signing** (`convertToSquashfs: true` in
  `scripts/package-roku.ts`). The Roku Channel Store rejects the older zip-based package as *"channel package
  is malformed"* (sideloading accepts it; the store requires squashfs). The signed
  `out/airwave-<version>.pkg` is now store-acceptable.
- **Docs** (`.docs/publishing.md`, local): note the squashfs requirement and the package-format → minimum-
  firmware mapping (ZIP v5.2 / CRAMFS v7.7 / **SQUASHFS v8.0.0 b1** / SQUASHFS_ZSTD v11) — set the listing's
  Minimum Firmware Version to **v8.0.0 b1** for our squashfs package.

## [0.10.63] - 2026-08-18

Roku **packaging + signing scripts** — a one-command path from source to a Channel-Store-ready `.pkg`.

### What ships

- **`pnpm -F tv-roku genkey`** (`apps/tv-roku/scripts/roku-genkey.ts`) — generates this device's one-time
  Roku **signing key**: talks to the dev-key console (telnet port 8080), runs `genkey`, and saves the printed
  signing **password** + **DevID** into `rokudeploy.json` (gitignored). It **refuses to overwrite an existing
  key** — a published channel is permanently bound to it — unless `--force` (never-published devices only), and
  prints a loud back-it-up warning.
- **`pnpm -F tv-roku package`** (`apps/tv-roku/scripts/package-roku.ts`) — runs `bsc`, then
  `roku-deploy deployAndSignPackage`: zips staging, sideloads to the Roku in `rokudeploy.json`, signs the
  installed channel with the saved `signingPassword`, and downloads the signed package to
  **`out/airwave-<version>.pkg`** (version from the manifest). Proven end-to-end against the Stick 4K.
- `rokudeploy.example.json` documents the new `signingPassword` / `devId` fields.
- **Docs** (`.docs/publishing.md`, local): the Roku section is rewritten around the two scripts, with a CI note —
  Roku signing is **device-bound** (a GitHub-hosted cloud runner can't reach a home-LAN Roku, and
  `create-package` only zips; producing a signed `.pkg` needs a real device), so CI requires a self-hosted /
  tailnet runner, and publishing is manual regardless.

## [0.10.62] - 2026-08-18

### Changed

- **Roku channel icon + store posters now show a stacked lockup** — the logo mark with a centered white
  "Airwave" wordmark below it — instead of the mark alone, so the home-screen tile reads as branded.
  `gen-channel-art.py` gained a `_stacked()`/`make_stacked()` layout.

## [0.10.61] - 2026-08-18

### Changed

- **Roku boot splash is now a flat `#060a14` fill** (matching the app background) instead of a static logo.
  Roku requires a splash image, but ours now hands off **seamlessly** to the in-app animated LogoLockup (which
  fades the wordmark up from black) rather than flashing a big static logo first. `splash_color` aligned to
  `#060a14`; `gen-channel-art.py` generates the flat splashes.

## [0.10.60] - 2026-08-18

### Added

- **Roku branded channel art + generator.** `apps/tv-roku/scripts/gen-channel-art.py` renders the Airwave logo
  mark (home-screen icons + Channel Store posters) and the mark+wordmark lockup (boot splashes) on the app's
  dark radial gradient, at Roku's sizes — mirroring `tv-native`'s `gen-app-icons.py`. Replaces the placeholder
  navy `icon_focus_hd/fhd` + `splash_hd/fhd` in the manifest, and adds `store-poster-hd/fhd` for the Channel
  Store listing. (Roku's required art sizes drift — the size tables at the bottom of the script are the one
  place to adjust before submitting.)

## [0.10.59] - 2026-08-18

### Fixed

- **Roku: DVR seek into a previous direct-play program no longer intermittently restarts from the beginning.**
  Roku's `ContentNode.PlayStart` is honored inconsistently for direct-play raw files — sometimes the file
  opens at 0 instead of the requested offset, so scrubbing back through a bumper into an earlier program would
  occasionally start it over. The player now arms a one-shot **safety re-seek**: on a fresh direct-play load
  with a real offset, if the Video node reaches `playing` at a position near 0 (`< offset − 3s`), it forces
  `seek = offset`. It no-ops when `PlayStart` worked (position already ≈ offset), so it can't fight a correct
  start, and only arms for direct-play. (tv-web/tv-native are unaffected — `<video>.currentTime` / mpv `start=`
  apply the offset reliably.)

## [0.10.58] - 2026-08-18

Roku **player-chrome button states** + Roku is documented on the site.

### Fixed

- **Roku full-chrome control states now match tv-web/tv-native.** The **Restart** button dims (opacity 0.4)
  during a bumper — there's nothing to restart (`canRestart` = the current slot is a PROGRAM) — and the
  **Live** button relabels on the live edge: "Continue Watching" (Clapperboard) when at live, "Jump to Live"
  (Radio) when behind. The Live label was previously inverted.

### Docs

- **getairwave.tv Platforms page** now documents **Roku as a built native channel** (`tv-roku`, BrighterScript +
  SceneGraph, native `Video` node, `roDeviceInfo.CanDecodeVideo`, MPEG-TS HLS for transcodes) with its own
  section; the availability matrix marks Roku **Supported**; and the platform lists on the home +
  getting-started pages include Roku.

## [0.10.57] - 2026-08-18

Roku **Settings** — the full settings section, ported to strict parity with tv-web/tv-native.

### Added

- **Settings shell** (`apps/tv-roku/components/settings/`) — a master-detail port of the tv-web/tv-native
  settings: a sliver category rail (the guide's glass-circle treatment) that expands to an overlay + the
  selected subpage rendered on the right, D-pad zoned (rail ▲▼/OK/►, content ▲▼/OK/◄/Back, land-in-content,
  scroll-to-top on the first row). Reachable from the guide sidebar's **Settings** / **Account** circles.
- **Six pages:** **General** (landing + back to guide); **User** (avatar/initials + name/email/role from a new
  `Api.session()`, two-tap Sign out); **Server** (connection info card, re-probe local→remote→relay,
  force-connection cycle, change-server → onboarding); **Device** (model/OS/resolution/HDR, Run capability
  diagnostic, the per-codec capability **toggle grid** — video/audio/containers, 2-column, Override/Forced
  pills, Reset-to-diagnostic, and a **focusable** Recent-playback-issues list); **Audio** (informational — Roku
  has no per-app audio control, so it shows the detected output + points to the Roku's own Settings → Audio for
  surround/passthrough); **About** (logo mark + wordmark + version + description).
- Shared SceneGraph primitives (header/row/section-label/pill/toggle/info-card) mirroring `settings-ui`.

### Fixed

- (Roku) A codec's `quirk` field is a *string* (the known-issue reason), not a boolean; a `quirk = true`
  comparison type-mismatched and silently killed the Device grid render at the first quirked codec (vp9).
  Both quirk checks now test for presence, so the full grid (+ audio + containers) renders.

## [0.10.56] - 2026-08-18

Roku **mini-player re-expand** fix; the bumper-music video/audio hybrid was attempted and reverted.

### Fixed

- **Roku: reselecting the channel that's already playing now just re-expands the mini player** instead of
  re-tuning from scratch. With the mini feed docked, opening the guide and picking the same channel restores
  full-screen instantly (no "Tuning…"), matching tv-web/tv-native. A different channel still does a real tune.

### Reverted

- **Bumper music on Roku (the one-Video-node video/audio hybrid) is deferred.** The happy path worked (the bed
  played, looped, DVR-synced, paused), but playing the audio-only music bed on the shared Video node **corrupts
  the audio pipeline**: a following 5.1 program downmixed to stereo, a later channel change dropped audio
  entirely, and the state persisted across an app restart (device-level HDMI audio config). Content-swapping
  audio↔video on one Roku Video node doesn't cleanly re-negotiate the channel layout, and stop-based re-inits
  were flaky. Reverted to the proven pause-and-hold (the BumperCard shows over the held program frame) —
  reliable audio wins. May revisit with a more robust approach (recreating the Video node) later.

## [0.10.55] - 2026-08-18

Roku **HLS transcode audio + stability** — the Roku's forced-transcode path (subtitle burn-in,
quality caps, audio picks) now plays audio and holds steady, and the Roku reaches playback-logging
parity with the other clients.

### What ships

- **MPEG-TS HLS for native-HLS clients (server).** A new `hlsContainer` option on
  `GET /channels/:id/media` — threaded through `broker.resolveMedia` → `getPlaybackInfo` →
  `clientProfileExtra` — packages the HLS transcode as **MPEG-TS** (audio muxed into the segments)
  instead of fMP4/CMAF when the client sends `hlsContainer=mpegts`. Roku's native HLS player can't
  extract the audio muxed into Plex's fMP4/CMAF segments (`availableAudioTracks=0` → video plays with
  no audio); MPEG-TS demuxes reliably. **The default is unchanged (fMP4)**, so webOS (hls.js/MSE) and
  tv-native (mpv) are byte-for-byte untouched — only a client that opts in gets TS.
- **tv-roku requests MPEG-TS** for its transcode path and force-selects the audio track when the
  Video node exposes one (a no-op for muxed TS, correct for anything that does list a rendition).
- **tv-roku playback logging** (`logPlayback`) at parity with tv-web/tv-native: one `PlaybackLog` row
  per fresh load carrying the Plex decision (mode / codecs / connection) + the on-device outcome
  (`playing` / `error` / a `not_decoding` backstop for a load that never settles) + a Roku
  audio-track diagnostic (`caps.audio`: exposed-rendition count, selected track, forced?). Heartbeat,
  session-end, stop, and device-report were already wired.
- **Re-resolve loop fix (tv-roku).** `currentEffective()` now clamps to live. An HLS transcode's
  reported `position` can momentarily jump past the baseline (the `EXT-X-START` offset settles after
  the `"playing"` anchor), sending effective-time seconds past the program end → the 500 ms tick's
  rollover re-resolved at live *every tick*, tearing down and restarting the Plex transcode each
  second (the buffer stutter). Clamping to live is physically correct, a no-op in healthy playback,
  and breaks the loop; direct-play was already immune (its baseline is anchored inline).

### Fixed (build tooling)

- `pnpm dev` and `pnpm build` now clean `dist/` before `workflow build`. The workflow
  directive-discovery globs build output (unlike tsconfig, which excludes `dist`), so a leftover
  `dist/standalone/server.mjs` from `build:standalone` — a full CJS bundle of the server with its
  top-level `await`s and an `undici` import — made `workflow build` fail (`Top-level await is not
  supported with the cjs output format`, `Could not resolve "undici"`). `build:standalone` already
  cleaned `dist/` for this reason; `dev` and `build` now do too.

## [0.10.54] - 2026-08-17

### Fixed

- **Roku player: audio/subtitle/quality picker selections now apply.** Picking an option opened the dialog
  and updated the choice but did nothing to playback — `reResolve()` → `seekTo(currentEffective())` hit the
  no-op guard (same program, same position) and bailed before re-requesting `/media`. The guard now also
  requires the `paramsKey` (quality|audio|subtitle) to match, so a picker change forces the re-resolve
  (subtitles burn into a transcode, audio/quality swap) — matching tv-web/tv-native.

## [0.10.53] - 2026-08-17

Roku **ChannelSurf carousel + mini idle→full (Increment D + B2)**.

### Added

- **`ChannelSurf`** — with the player chrome closed, ◄/► (or the Channel Surf button) slides up a
  horizontal channel carousel (gradient bg + slide/fade), centered on the channel you're watching (a
  "Watching" badge). Each tile: cover art, on-now progress, channel icon/number/name, program title/sub;
  the focused tile is centered + scaled, neighbors dimmed. ◄/► move (**wrapping**), OK re-tunes the
  player to that channel, Back closes, ~12s of no input auto-hides. **Virtualized** — a pool of 7 tiles
  re-bound to the window around the focused index (channel count doesn't matter).
- **Re-tune while full** — surf/OK swaps the player's channel identity + re-runs the effectiveTime clock,
  and the chrome resets (new chip + "Tuning…") via a `retune` bump (decoupled from show/hide so it doesn't
  re-play the slide when the panel's already up).
- **Mini idle→full** — while a mini feed is docked, 60s of no input auto-expands to full-screen (beats the
  TV screensaver). Any key resets it, via a global `inputPing` the guide bumps (we're on focus routing,
  not a central dispatcher).

### Fixed

- The surf "Watching" badge uses a proper small fully-rounded pill 9-patch (`pill-sm.9`) with an accent
  dot, instead of the height-54 pill stretched down (squished caps).

## [0.10.52] - 2026-08-17

Roku **bumper card — progress bar + compact mini variant (Increment B2/E polish)**.

### Changed

- **The bumper countdown is now a smooth top progress bar** instead of the donut (YouTube-ad style): a
  tinted accent bar across the top of the card that fills left→right as the bumper elapses, 20fps, with
  the seconds centered below the title. This removes the donut's per-frame Poster-reload flash and the
  ~400KB of donut frames. It's driven by the same local clock, so a DVR scrub re-syncs it and pausing
  freezes it.
- **The mini feed now shows a compact BumperCard while docked** — during a bumper the dock shows a small
  overlay (countdown number + "UP NEXT" + the upcoming title + its own top progress bar) instead of the
  frozen frame, matching tv-web/native's compact card. It switches variant live if you go full↔mini
  mid-bumper.

## [0.10.51] - 2026-08-17

Roku **mini player — persist the channel while browsing the guide (Increment B1)**.

### Added

- **The player now has three surface layouts (off / mini / full).** Back from full drops the channel to a
  **mini feed that keeps playing, docked into the guide's featured-panel slot** — the panel reserves a
  16:9 slot on its right (`rightReserve`, computed from `featuredHeight()`) so its text column shrinks to
  fit, and focus returns to the guide so you can browse the grid while it plays. Re-tuning goes full again.
- **Mini-feed focus (zoned nav)** — **✱** focuses the docked mini feed, revealing a **Full screen / Close**
  overlay (◄► select, OK activates); **▼ Down** (or Back) drops focus back down to the guide. A footer
  hint (**✱ to focus**) shows on the mini feed while it's unfocused.
- **Back on the guide with a mini feed** now peels the mini (stops it) instead of exiting the app.

### Notes

- MainScene owns the surface state machine (dock/goFull/close/blur); PlayerHost fires `playerCmd` back to
  it. Compact BumperCard in the dock + idle→full-after-60s are the remaining mini polish (B2).

## [0.10.50] - 2026-08-17

Roku **BumperCard — the "Coming up next" interstitial (Increment E1)**.

### Added

- **`BumperCard`** — shown over the held frame during a bumper: ambient program art (dimmed) + dark scrim,
  "COMING UP NEXT", the upcoming program title/episode, and a **draining countdown donut** (pre-rendered
  accent-ring frames, one per percent — Roku has no SVG) with the seconds centered. Runs on a local smooth
  clock seeded by the player's `remaining`/`total`, freezes when paused, and re-syncs on a DVR scrub.
  Generator: `scripts/gen-donut.py`.

### Notes

- **Bumper music is deferred.** Roku has a single media pipeline (the same constraint the tvOS mpv-hybrid
  was built for — two engines can't both hold the audio), so a separate Audio node can't play alongside the
  loaded Video. The correct approach is the tv-native pattern: the ONE Video node plays the audio-only bed
  and swaps back to the program. Revisit later. The bumper keeps the program paused-and-held meanwhile.
- The donut currently swaps Poster frames (a slight flash on each frame load) — a `roImageCanvas`-drawn arc
  or preloaded frames would remove it; left as-is for now.

## [0.10.49] - 2026-08-17

Roku **player chrome — Info view + track/quality pickers (Increment C2)**.

### Added

- **Audio / Subtitles / Quality pickers** — tv-native-style **centered glass modal dialogs** (rounded
  `card.9` over a dim scrim): a scrollable list with the focused row accent-filled, the current choice
  check-marked, up/down to move, OK to select, Back to cancel. Selecting re-resolves the current program
  at the same spot with the new track/quality (subtitles are server-burn-in → a transcode bakes them in).
- **Info view** (parity with tv-web/native) — Info now grows the panel **upward** (raised title + taller
  scrim) and shows a **badge meta row** (year · content-rating chip · ★ critic · duration), the summary,
  **Genres/Cast/Director/Studio columns**, and a **PLAYBACK delivery** readout as chips (mode in the accent
  color, then container / video+audio codec / connection). It honors the 8s auto-hide like the scrubber
  panel. New `chip.9`/`card.9` 9-patch assets (via `gen-player-assets.py`).

### Fixed

- The chrome no longer gets stuck after the Info view auto-hides — closing the panel clears the Info/picker
  state so OK/▲ reopens the normal scrubber chrome.

## [0.10.48] - 2026-08-17

Roku **player chrome — visual parity + playback fixes (Increment C1-visual)**.

### Added

- **Player-chrome assets + glass styling** — the chrome now matches tv-web/tv-native: real rounded
  **glass pills** (9-patch `pill-fill`/`pill-ring`/`pill-focus`, tinted via `blendColor`), the bottom
  **gradient scrim** (`scrim-player.png`, tv-web's `to top` stops), a **circular thumb** that grows +
  gets an accent **focus halo** on the scrubber row, the LIVE dot, and the chip's **Tv-icon circle**.
  Two committed generators produce them: `gen-circles.py` (adds 16/24/34 thumb discs) and the new
  `gen-player-assets.py` (pill 9-patches + scrim).
- **Slide/fade animations** — the chip drops in from the top and the panel rises from the bottom on
  open, and both reverse on close (SceneGraph `Animation` + interpolators), matching tv-web's framer /
  tv-native's reanimated transitions.
- **Panel opens on tune** and stays open until playback starts, then begins the 8s auto-hide (parity).
- **Pills + chip size to their measured text** (`boundingRect`) instead of a char-count estimate — no
  more dead space past the label.

### Fixed

- **Scrubber ran ahead of live after a resume** — the effectiveTime baseline was anchored to a
  premature Video `position` (0, before the direct-play seek settled), so the clock drifted ~offset
  ahead of live (invisible at a live join, obvious on a large resume). Direct-play now anchors the
  baseline to the known offset immediately.
- **Subtitles auto-enabled on seek** — the Video re-selected an embedded sub track per the system
  caption setting; now forced off via `globalCaptionMode = "Off"` (+ `subtitleTrack = ""`) on load and
  every `playing`, since our subs are server-burn-in.
- **Stale-channel `/media` load could settle into the new channel** — each load now carries its own
  generation as the promise ctx (not a shared field), so a superseded load aborts; and the chrome
  resets on every tune (no leftover scrubber from the previous channel).
- The leftover PlayerHost debug line is hidden; the chip number/name are vertically centered.

## [0.10.47] - 2026-08-17

Roku **Phase 7/8 — the player chrome (Increment C1)**.

### Added

- **`PlayerChrome`** — the full-screen player chrome over the DVR clock, a SceneGraph re-expression of
  tv-web/tv-native `FullChrome` + `FeaturePanel`. On OK it slides up: a **channel chip** (number + name +
  vivid accent), the program **title/episode**, the **multi-segment DVR scrubber** (a bar per
  program/bumper slot, an accent fill to the thumb, a red LIVE marker, position + LIVE/-behind labels),
  and a **control row** (Pause · Restart · Channel Surf · Info · Jump-to-Live + Audio/Subs/Quality). D-pad
  nav: row 0 scrubber (◄► seek ±10s, OK pause, ▼ controls), row 1 controls (◄► move, OK activate, ▲
  scrubber); Back closes the panel then returns to the guide; auto-hides after 8s.
- **The clock publishes a status object** each tick (state / guide / paused / canRestart / scrubber /
  delivery) that the chrome renders from, plus `buildScrubber` — the expanded-focus multi-segment view
  (the focus program is the wide middle; ±6min compresses into fixed left/right peeks) ported exactly
  from tv-web. Per-channel quality/audio/subtitle opts thread through `/media` (the pickers drive them in
  C2). Channel identity (number / name / vivid accent) is wired guide → player.

### Fixed

- Roku `onKeyEvent` instant-replay key name (`instantreplay` → `replay`).

### Notes

- **Functional parity is done** (verified on the Ultra: scrubber, chip, controls all work). **Visual
  parity** — the glass/blur treatment, rounded pills + scrubber bars, the gradient scrim, the circular
  thumb + focus ring, and the chip's icon circle — is the next pass, along with the Info view + pickers
  (C2), ChannelSurf (D), the mini-player (B), and the BumperCard + music (E).

## [0.10.46] - 2026-08-17

Roku **Phase 7/8 — the effectiveTime DVR clock (Increment A)**.

### Added

- **`PlayerHost` now runs the full effectiveTime state machine**, ported from tv-web/tv-native
  `use-tv-player`: one clock over the whole channel timeline (`/timeline`, refetched 120s) with a
  server-synced offset; `seekTo(instant)` → the containing slot → `(ratingKey, offset)` → `/media` →
  the Video node; a 500ms tick that derives the effective time and **rolls over at boundaries
  (program → bumper → next program)**; a **no-future-seek** clamp `[firstSlotStart, now]`; DVR rewind
  back out of a program, through the bumper, into the previous one; resume (`cg-tv-resume`, seconds
  shape to dodge the 32-bit epoch-ms trap); a 10s session heartbeat + end-session/stop on teardown;
  a native→HLS safety-catch on a decode error; and an EOF rollover backstop. The tune contract is now
  just `channelId` (the clock joins live / resumes; a selected future program can't seed playback).
- **Media remote keys drive the DVR** ahead of the chrome (Increment C): Play/Pause, Rewind (−60s),
  Fast-Forward (+60s, clamped at live), Instant Replay (restart the program), Back (→ guide). Roku's
  built-in trick-play bar is suppressed (`enableTrickPlay = false`; focus stays on the group) so our
  own chrome owns the transport keys.

### Notes

- Verified on the Ultra: bumper rollover works. A bottom debug line shows the clock state (title /
  elapsed·total / LIVE-or-behind, or `BUMPER Xs`) until the FeaturePanel chrome (Increment C) lands.
- Reserved-word/`collision` traps hit + fixed: `goTo`→`seekTo` (folds to `goto`), `rem`→`remS` (the
  REM comment keyword), `nowMs`→`wallMs` (collided with a `GuideLayout` param).

## [0.10.45] - 2026-08-17

### Fixed

- **Roku guide polling no longer resets the scroll position** — when the 60s auto-refresh replaced the guide
  content, `VirtualRowList` was zeroing its scroll offset, snapping the user back to the first channel (the
  refresh preserves the focused channel, so nothing re-scrolled it into view). The refresh now preserves the
  scroll offset and just clamps it to the new content bounds; a lens change still resets to the top (it resets
  the focused channel, which re-scrolls). Matches tv-web/tv-native, where a background refetch never moves the
  viewport.

## [0.10.44] - 2026-08-17

Roku **Phase 7 kickoff — the player (first slice)**.

### Added

- **`PlayerHost`** (`components/watch/PlayerHost.{xml,bs}`) — a single, never-unmounted full-screen `Video`
  node. OK on a guide channel tunes it: Guide hands the on-now `(ratingKey, offset)`, MainScene shows the
  persistent PlayerHost and it resolves `/media` → sets the Video `content` (url + `streamFormat` from
  mode/container: transcode→hls, direct/http→the raw container) → plays; Back returns to the guide.
  **Verified on the Ultra: a raw MKV DIRECT-PLAYS (mode=direct, streamFormat=mkv) — no transcode.** The
  effectiveTime DVR clock, rollover, and player chrome are the next Phase 7/8/9 work.

## [0.10.43] - 2026-08-17

### Changed

- **Roku guide loading + error states use the ghost** — while the first guide fetch is in flight (and on a
  load error), the guide now shows the faint skeleton + a "Loading your guide…" / error message instead of a
  bare "Loading…" over an empty, broken-looking featured panel.

## [0.10.42] - 2026-08-17

### Added

- **Roku guide empty-state (GuideGhost)** — an empty lens (no favorites / an empty package filter) now shows
  the guide's own structure as a faint skeleton (featured panel + channel rows) behind a centered message +
  sub, matching tv-web/native, instead of a plain line of text.

## [0.10.41] - 2026-08-17

### Changed

- **Roku circle borders are 1px** (the tinted icon circles + glass buttons), matching tv-web/native's
  `borderWidth:1`; the glass focus ring stays 2px so it reads as a distinct outer ring.

## [0.10.40] - 2026-08-17

### Changed

- **Crisp Roku circles** — the tinted channel-icon circles (rail + featured), the sidebar glass buttons, and
  the focus rings now use **purpose-sized, anti-aliased PNG masters** rendered 1:1 (36 / 54 / 62 / 96px)
  instead of downscaling one oversized master (which aliased the edges + thin rings). A committed generator
  (`apps/tv-roku/scripts/gen-circles.py`, documented with the size→consumer map) produces them; add a size
  there and re-run when a new circle is needed. Removed the old 192px `circle.png` / `circle-ring.png`.

## [0.10.39] - 2026-08-17

Roku sidebar animations + guide-rail polish.

### Added

- **Sidebar expand/collapse animation** — the surface width, right border, divider, and a dim scrim
  (`rgba(6,10,20,0.55)`) animate together on open/close, and the filter circles **stagger** in (fade +
  rise), matching tv-web/native.

### Fixed

- **Sidebar focus rings no longer clip** in the scrollable lens list (left edge, and top/bottom for the
  first/last circle) — the clip is extended by a ring-room margin.
- **Guide rail**: 4-digit channel numbers (e.g. 1001) show fully instead of ellipsizing to "1…"; the
  channel name is bottom-anchored and wraps to a real 2nd line (grows upward) instead of clipping to one
  line.
- **Featured panel**: the gap between the channel number and name now follows the number's actual width, so
  a single-digit channel no longer leaves a huge static gap.

## [0.10.38] - 2026-08-17

### Added

- **Roku guide auto-refresh** — the guide now re-fetches every 60s (matching tv-web/native's
  `refetchInterval`), so the now-caret, "Xm left", on-now progress, and program list advance as time
  moves forward. The refresh preserves the user's focused channel/program (fc/fp) rather than resetting to
  the top, and is skipped while the sidebar is open.

## [0.10.37] - 2026-08-17

Roku guide **6c — the sidebar** (lens filtering) + the completed grid↔rail↔sidebar zone machine.

### Added

- **The guide sidebar** (`GuideSidebar` + `GlassCircleButton`), a port of tv-web/tv-native `guide-sidebar`:
  a collapsed 92px sliver of glass-circle buttons (Guide / Settings / Account + a Filters circle) that
  expands to a 300px **overlay** (the grid never reflows) revealing the lens list — Show All / Favorites /
  Recents / each package (with its tint + icon + channel count). D-pad `left` from the rail enters it;
  up/down move the selection (snap-scrolling the list when off-screen), OK applies the lens (toggling an
  active filter back to All), right/back returns to the grid. **Lens filtering** re-filters the channel
  list (all / favorites / package). Packages load from `GET /packages`.

### Fixed

- **Moving onto the rail clears the focused program's ring** — the program focus ring now shows only in the
  grid zone (matching tv-web/native), instead of leaving the last-selected program highlighted.

### Notes

- Settings/Account sidebar actions are stubbed until those screens exist. The empty-lens state shows a
  message for now; a parity `GuideGhost` is a follow-up. Guide auto-refresh (polling) is also pending.

## [0.10.36] - 2026-08-17

Roku icons — real lucide + phosphor icons via bundled icon FONTS (not rasters).

### Added

- **Icon fonts** for the Roku guide. `scripts/gen-icons.mjs` copies `lucide.ttf` + the Phosphor **Fill**
  TTF from `lucide-static` / `@phosphor-icons/web` and emits id→codepoint maps
  (`images/icons-{lucide,phosphor}.json`, keyed by the same `lucide:Name` / `phosphor:Name` ids the admin
  stores — 2041 lucide + 1512 phosphor glyphs). `source/lib/icon.bs` renders an icon as a `Label` (text =
  the glyph, tinted via `color`, sized via the font size — crisp at any size, via the font mutation path).
- The guide's **channel/package glyphs** (rail + featured panel) now show their **real** lucide/phosphor
  icon instead of a single fallback, and the rail **favorite heart** uses the icon font (phosphor fill when
  favorited, lucide outline otherwise) — matching tv-web/tv-native.

### Removed

- The placeholder raster glyph + heart PNGs (`ic-channel.png`, `heart-*.png`) — replaced by the icon fonts.

## [0.10.35] - 2026-08-17

### Changed

- **Roku: removed ~60 redundant `m.top.findNode(...)` calls** across the guide, screens, and UI components
  now that `bsc-plugin-auto-findnode` auto-wires `m.<id>` from the XML — a clean build with no
  "Unnecessary call" warnings.

## [0.10.34] - 2026-08-17

Roku guide **6c — the zone machine**: custom virtualization, grid ↔ rail navigation, focus ring, rail
favoriting, and nav sounds. The port of tv-web/tv-native aurora-grid's focus model.

### Added

- **`VirtualRowList` component** — a purpose-built virtualized vertical list replacing `MarkupList` for the
  guide grid, so the guide owns its own scroll + 2-D focus (which `MarkupList` can't express). A small pool
  of recycled `ChannelRow` nodes (modulo-slot mapping → one re-bind per scroll step) with the exact
  tv-web/native **float-then-snap** scroll: it only scrolls when the focused row would fall off the top/bottom
  edge, otherwise you travel through the visible rows.
- **The zone machine** (`Guide.onKeyEvent`) — the Guide scene holds focus and drives all navigation: grid
  (left/right through programs, up/down changes channel and lands on the on-now program, OK tunes), rail
  (favorite the channel, up/down still change channel), with the sidebar transition stubbed for the next
  task. `fc`/`fp`/`zone` are pushed into `VirtualRowList`, which forwards them to the focused row.
- **`ChannelRow` focus state** — a blue **focus ring** on the selected program cell (no layout shift), the
  rail circle becoming the **favorite heart** (filled rose if favorited, else outline) with a blue ring when
  rail-focused, and a small heart badge when a channel is favorited. Favorites load from `GET /favorites`
  and toggle via `POST /favorites` (optimistic).
- **Navigation sounds** — the system click the native lists play, brought back for our custom focus.
  `roAudioResource` is main-thread-only, so `main.bs` owns the resources and the zone machine triggers them
  through a global field.

### Fixed

- **Crisp guide icons** — the tinted circle, ring, glyph, and heart posters now set `loadWidth`/`loadHeight`
  to their render size, so Roku decodes them at that size (high-quality) instead of GPU-downscaling a large
  source at render time (which pixelated them).

### Notes

- Programs are culled to the visible window once in `Guide` (inline math), so `fp` indexes exactly the cells
  the row renders. Adopted `bsc-plugin-auto-findnode` (auto-wires `m.<id>` from XML). Next: the sidebar.

## [0.10.33] - 2026-08-17

Roku featured-panel parity polish — badge alignment, the progress bar, the row gaps, and the 2-line summary.

### Fixed

- **The HD/4K/HDR/audio badges are vertically centered with the program title** and right-aligned flush to
  the text column. They're laid out in a plain `Group` (not a `LayoutGroup`, which re-centered them within
  bounds it computed itself) and centered on the title's line box — matching tv-web/native's
  `alignItems:center` title row. The pills also got a little more vertical padding.
- **The progress bar has proper rounded (pill) ends** via a new `fill-2` 9-patch (2px radius = half the
  ~4px bar height); `fill-8`'s 8px radius collapsed on such a thin bar. It also sits flush with the panel's
  bottom edge now (removed a phantom bottom pad), so the grid flows directly below — matching the
  reference's zero-bottom-padding panel.
- **The vertical gaps between the title / year / summary rows match tv-web/native.** The stack advances by
  each line's rendered line height (~1.2×, via `GuideLayout.lh()`) instead of the raw font size, so the rows
  are no longer a touch tight.
- **A full 2-line summary no longer clips to one line + "…".** The line spacing is tuned to a 1.4× line
  pitch (parity) and the Label box has slack so both lines render.

## [0.10.32] - 2026-08-17

### Fixed

- **Roku guide: the grid now flows right below the featured panel** instead of a fixed `y=546` that left a
  big gap. `GuideLayout.featuredHeight()`/`gridTop()`/`headerTop()` derive the featured panel's content
  bottom, and Guide positions the time header + grid + now-caret from it (≈1 more visible row).

## [0.10.31] - 2026-08-17

Roku guide 6b — the featured now/next panel + the tinted icon ring.

### Added

- **`apps/tv-roku` featured now/next panel** (`components/guide/FeaturedPanel.{xml,bs}`), a port of
  tv-native aurora-grid's FeaturedPanel (left text column). Shows the focused channel + its on-now
  program: channel line (ring-bordered tinted icon + number + name), genre · tagline, divider, title +
  SxxEyy · episode, HD/4K + HDR/DV + audio + Atmos badges, year · rating · ★, a 2-line summary, the
  time range + status ("Xm left"/"Starts"/"Ended"), and a progress bar. Wired to the guide's focused row
  (`itemFocused`). The text column's width derives from a `rightReserve` field so it shrinks when the
  Phase-7 mini-player docks (tv-native flex:1). Verified on the Ultra.
- **Tinted icon ring** on the rail + featured circles (accent@0.35 border, `images/circle-ring.png`) —
  matching tv-web/tv-native.

## [0.10.30] - 2026-08-17

### Fixed

- **Roku guide: only the focused channel's RAIL gets the tint highlight** (accent@0.12), not the whole
  row — matching tv-web/tv-native (the row itself stays untinted).

## [0.10.29] - 2026-08-17

Roku guide — the real root-cause fixes for program positioning and channel tints.

### Fixed

- **Program positioning (the overlap) — a 32-bit-float precision bug in `parseIso`.** `AsSeconds() *
  1000.0` computed epoch-ms (~1.79e12) in single-precision float (7 sig digits), quantizing every
  timestamp to ~131-second buckets — which shifted program starts and made them appear to overlap. Now
  forced to 64-bit **double** math. With timestamps exact, the guide tiles perfectly using the
  **identical `durationSeconds` positioning math as tv-web/tv-native** (the earlier client-side "tile to
  next start" workaround is removed).
- **Channel tints were index-based, not the channel's real tint.** Ported `lib/tint.ts` +
  `accent-palette.ts` to `source/lib/tint.bs`: a channel's accent is its own `tint` key → its package's
  → an index-derived fallback (`Tint.forChannel`), mapping the stored key (`green`/`blue`/…) to its muted
  hex. Channels now show their actual colors.

## [0.10.28] - 2026-08-17

Roku guide 6a render-parity fixes (all on the Ultra).

### Fixed

- **Now-marker** — the red vertical line is hidden; only a **pulsing red caret** marks the current time
  (matches tv-web/tv-native). New `images/caret-down.png`.
- **Program cells now have real rounded corners** (a matching `border-8` 9-patch), and the **2-tone
  on-now cell rounds its corners too** — rebuilt as a rounded `fill-8` base (`accent@0.1`) with the
  elapsed portion (`accent@0.32`) overlaid + clipped to the left, so the outer corners round and the
  elapsed/remaining split stays a hard edge.
- **Program positioning** — removed the per-cell `Int()` rounding that drifted gaps ±1px vs tv-native;
  cells now use exact float left/width, so spacing is pixel-identical.

### Notes

- Scroll is on the working list mode for now; the proper float-then-snap scroll + the full zone machine
  (land-on-on-now, D-pad left/right through programs, D-pad to the rail to favorite, sidebar, no-layout
  focus ring) + the bundled lucide/phosphor icons are the 6c pass. A minor time-tick snap (~1 min) is
  still pending.

## [0.10.27] - 2026-08-17

Roku **Phase 6a — the Aurora guide grid foundation**, rendering real guide data on a real Ultra.

### Added

- **`apps/tv-roku` guide grid.** The signed-in home is now the Aurora guide.
  `source/lib/guideLayout.bs` ports the layout math from tv-web/tv-native `layout.ts` (`vw()` 2560→FHD
  scaling, rail/row/ppm geometry, the genre accent palette, `argb()` hex+alpha→ARGB, `subLine`/
  `audioBadge`, ISO parsing, local-time `fmtTime`/`fmtDay`). `components/guide/ChannelRow.{xml,bs}` is a
  row — the channel rail (tinted icon circle + number + name, focus highlight + 4px accent bar) and the
  program lane, with the **2-tone on-now cell** rendered exactly as tv-web does it (elapsed `accent@0.32`
  / remaining `accent@0.1` split + the 3px accent bar). `components/screens/Guide.{xml,bs}` fetches
  `Api.guide`, snaps `T0`, and renders the time header (day + 30-min ticks) + a virtualized `MarkupList`
  of rows + the red now-line. Wired into the entry gate (signed in + caps done → Guide). Verified on the
  Ultra with 41 live channels.

### Notes

- 6a is the grid foundation. Next: the featured now/next panel (6b), the sidebar + lens + zone machine
  (6c), the mini-player dock + tune (6d), and polish. Genre icons use a fallback glyph for now — the
  full bundled lucide + phosphor raster set is the next pass. A minor tick-time snap (:01/:31) is
  pending.

## [0.10.26] - 2026-08-16

Roku **Phase 5 — the off-network Plex probe + the promise data layer wired up.**

### Added

- **`apps/tv-roku` off-network connection probe.** `source/lib/plexConnection.bs` (network helpers,
  stored in the registry as `cg-tv-network` / `cg-tv-network-override` — the **same keys** as
  tv-web/tv-native) + `components/tasks/ConnectionProbeTask` (fetches `GET /api/v1/connections` and
  reachability-probes local → remote → relay via each base's `/identity`, remembering the first that
  answers; relay → remote → local fallback). Runs once after login. `Api.media()` now auto-stamps the
  probed `?network=` (a manual override wins — ready for the Phase 10 Settings → Server page). A port of
  tv-web/tv-native `lib/plex-connection.ts`; since the Roku streams **directly** from Plex, this is what
  makes off-network playback resolve the remote/relay URL instead of the LAN one.
- **Data layer confirmed on device.** The promise `Api.*` methods already ARE the data layer
  (channels/guide/packages/favorites/recents/qualities/bumper-music/now/timeline/media); a dev-only
  smoke test logs live counts over the bearer API. Verified on the Ultra: probe picked `local` on-LAN,
  and the API returned 41 channels / 12 packages / a 41-channel guide.
- **Dev: `*` (options) re-runs the capability diagnostic** (clears the per-server caps-done) — useful
  now that the registry persists across sideloads, since the diagnostic otherwise never re-runs once
  done. Gated on `roAppInfo.IsDev()`.

### Fixed

- **Diagnostic crash on the first query-bearing request (`roUrlTransfer` on the render thread).**
  `Api.url` percent-encoded query params via `CreateObject("roUrlTransfer").escape()`, but
  `roUrlTransfer` is a **MAIN/TASK-thread-only component** (like `roFontRegistry`) and returns
  `invalid` on the render thread → a `Dot`-on-`invalid` crash the first time a query was built
  (`guide?forwardMinutes=…`, and it would have hit `media`/`imageUrl` too). Rewrote `escape()` to
  percent-encode the UTF-8 bytes via `roByteArray` (thread-safe).
- **Diagnostic chips weren't centered** (left-aligned under the centered title). Replaced the
  LayoutGroup + `boundingRect` measurement with deterministic manual positioning (we set each pill's
  width, so the exact centered row is computed directly). Verified centered on-device.

## [0.10.25] - 2026-08-16

Roku **Phase 4 — the capability diagnostic**, a parity port of tv-web/tv-native's onboarding that runs
on Roku's authoritative decode API. Verified end-to-end on a real Ultra.

### Added

- **`apps/tv-roku` capability diagnostic.** After login (server + token, caps not yet run for this
  server → Diagnostic; re-runs on a server switch) the Roku client runs the SAME ~49-test matrix as the
  other clients: a centered 16:9 Video box plays each clip while the **authoritative Roku decode API**
  decides the recorded verdict — `roDeviceInfo.CanDecodeVideo` / `CanDecodeAudio` for video + audio
  codecs, `GetDisplayProperties` for HDR (a real answer the web/native clients can't give — they leave
  `hdrOk` null), and `CanDecodeVideo` Level queries for the perf/bitrate ladder. Containers use actual
  Video-node playback (does it demux) combined with the API so a supported container (e.g. MKV) is never
  wrongly excluded on a playback hiccup. Every result → `POST /api/v1/caps/result` and the device facts
  → `POST /api/v1/devices/report`, the **same shapes the server already stores**, so the per-device Plex
  profile derives with zero server changes. (Ultra measured 47 native / 2 transcode — H.264 Hi10P +
  MPEG-4, both honest.)
- **Parity UI + animations.** "Setting up your TV" title, the per-test slide-in block (diagnostic +
  centered chips), the progress bar with "N native · M transcode", and the done state — the accent
  check disc springs in (`outBack`) and the Continue button rises in after a 0.2s delay. New
  `source/lib/device.bs` (caps engine + the matrix→CanDecodeVideo codec/profile/level mapping, cribbed
  from jellyfin-roku's `deviceCapabilities.bs`), `components/screens/Diagnostic.{xml,bs}`, and a
  generated `images/circle.png`.

### Notes

- The clips PLAY for parity + honest confirmation, but the verdict is the authoritative decode API
  (jellyfin-roku's approach) — so the clip-playing could be dropped entirely later; kept for now for
  exact parity with tv-web/tv-native.

## [0.10.24] - 2026-08-16

Roku login now works end-to-end on a new promise-based API client, plus a reliable LAN scan and a
dev-only registry seed. All verified on a real Roku Ultra.

### Fixed

- **Plex login never completed (the real root cause).** Every poll POSTed `{"pinid":…}` —
  BrightScript associative arrays fold keys to lowercase, so `FormatJson({ pinId })` serialised as
  `pinid` and the server rejected all polls with `400 "pinId is required"`, stranding you on the QR
  page. Request bodies (and query strings) are now built **case-sensitively** via `Api.jsonBody` /
  `Api.url`, so camelCase fields (`pinId`, `channelId`, `ratingKey`, …) survive. Login signs in
  end-to-end now.
- **LAN scan was flaky (found a server once, then not).** The batched `/24` sweep shared one message
  port across batches, so abandoned probes from an earlier batch leaked late events into a later
  batch's event count — a batch could exit before the live server answered. Each batch now uses a
  **fresh `roMessagePort`** (plus explicit straggler-cancel), making discovery deterministic.

### Added

- **Promise-based `api.bs` — the typed API client, a port of tv-web's `api.ts`.** Built on
  `@rokucommunity/promises`; every endpoint returns a Promise (`onThen` / `onCatch`), so screens read
  like the web client instead of hand-rolling `HttpTask` + `observeField`. Covers both login flows
  (Plex PIN + better-auth device code), the `/api/v1` guide/playback surface, favorites/recents, media
  resolution, sessions/heartbeat, the capability-diagnostic + device-caps endpoints, and connections.
  **Login and ServerSetup are converted onto it**, verified on-device (bare + real-HTTP promise
  resolution and callback `m`-scoping all confirmed). The LAN scan intentionally stays a dedicated
  `ScanTask` — a bulk subnet sweep, not a single request (mirrors tv-native's batched-probe model).
- **Dev-only registry seed.** On a **sideloaded** build only (`roAppInfo.IsDev()` — never a Channel
  Store install), the server URL is pre-seeded when none is stored, so re-sideloading (which wipes the
  dev-channel registry) no longer forces re-onboarding on every build.

## [0.10.23] - 2026-08-16

Roku login layout matched to tv-native, and a first pass at the device-code polling.

### Changed

- **Login layout to tv-native parity.** The login-header lockup is sized to tv-native's values (mark
  width 100, static — no animation), the QR card is centered within its column, and the pairing code
  renders large in JetBrains Mono — so the chooser and the pending/QR views are correctly sized.
- **Device-code polling** sends a `"{}"` JSON start body (the endpoint expects JSON) and creates a
  fresh `HttpTask` per poll tick (reusing one Task doesn't reliably re-run on repeated
  `control="RUN"`). (The poll still didn't complete — the real cause, a JSON key-casing bug, is fixed
  in 0.10.24.)

## [0.10.22] - 2026-08-16

Roku polish + the animated brand lockup, all verified on the Ultra via on-device screenshots.

### Added

- **Animated boot-splash logo.** A shared `LogoLockup` component (mark + "Airwave" wordmark) ports tv-web's
  `<Logo animate>` / tv-native's boot-splash: the mark fades + scales in, then each letter slides up
  (translateY 16→0) AND fades in, staggered; `BootSplash` then holds and fades the lockup out into the app.
  Built on SceneGraph `Animation` + interpolators; letters positioned from their measured `boundingRect`
  (render-thread-safe). The **login header** uses the same lockup but **static** (`animate=false`), matching
  tv-native. Bundled `images/logo.png` (the mark).

### Fixed

- **LAN scan wasn't finding servers.** The concurrent sweep leaked cancelled-transfer events between batches
  (identity mismatches, starving live hosts). Rewrote it: each probe self-times-out (`SetMinimumTransferRate`)
  and a batch is collected within a time budget — no cancel, clean identity mapping. Verified it finds a server.
- **Outlined buttons ("Log in with a code", "Scan for servers") had no focus ring** — the ring was excluded for
  `outlined` buttons. All buttons now get the accent focus ring.
- **Focus ring polish** — 9px offset gap + always accent (was tinted with the button's focus fill, invisible on
  the card input).
- **Keyboard flow** — the on-screen keyboard now only CAPTURES the address into the field (keeps text even on
  Back) instead of auto-submitting; the big Connect button is the real submit (OK tees it up).

### Notes

- Gotcha recorded: `roFontRegistry` is MAIN/TASK-thread only — creating it on the render thread crashes; measure
  text via `boundingRect` there instead.

## [0.10.21] - 2026-08-16

Roku **on-device parity** — custom fonts now render on a real Roku Ultra, and ServerSetup gets the full
LAN-scan section. Verified via on-device screenshots.

### Fixed

- **Bundled fonts weren't reaching the device (all custom-font text rendered blank).** `roku-deploy`'s default
  `files` list excludes `fonts/`, so the Inter / JetBrains-Mono TTFs were dropped from the `.pkg` — `roFileSystem`
  confirmed `pkg:/fonts/…` didn't exist on the box (system fonts worked, which masked it as an attach-method
  problem). Added an explicit `files` list (incl. `fonts/**`) to the deploy config. Fonts are applied via the
  mutation path (`label.font.uri` / `.font.size`, `Theme.setFont`).

### Added

- **ServerSetup LAN scan — full parity with tv-web.** The **OR** divider, the **"Scan for servers on my network"**
  button, a **progress bar**, the **found-server list**, and **"Scan again"** — backed by a real `ScanTask` that
  reads the LAN IP from `roDeviceInfo.GetIPAddrs()` and sweeps the `/24` for `/api/health {ok:true}` in concurrent
  batches (no WebRTC hack needed). Dynamic D-pad nav over `[address, Connect, found…, Scan]`.
- Login labels converted to the same font-mutation path (Inter + JetBrains Mono).

### Changed

- **Focus ring polish.** The `RoundedButton` focus ring is now offset with a real 9px gap (was 3px — it looked
  like the button just grew) and is always the accent color (was tinted with the button's focus fill, so it was
  invisible on the card-colored input). Matches tv-web's `outline` + `outline-offset`.

## [0.10.20] - 2026-08-16

Roku **parity styling pass** — real border-radius, exact colors, Inter typography, and focus rings, so
ServerSetup + Login match tv-web pixel-for-pixel instead of being roughly-styled skeletons.

### Added

- **Shared styling foundation.** `source/theme.bs` (exact ARGB colors + font URIs ported from tv-web's
  `theme.ts` + the setup/login source), the bundled **Inter** family + **JetBrains Mono** (for pairing codes),
  tintable rounded-rect **9-patch** PNGs (anti-aliased, generated with Pillow — `images/np/`), and a reusable
  **`RoundedButton`** component (9-patch background + `blendColor` tint + Inter label + accent focus ring, plus
  an `outlined` variant).

### Changed

- **ServerSetup + Login retrofit to pixel parity** with tv-web: 16px-rounded input/buttons (9-patch — no more
  sharp rectangles), exact colors (`#060a14`/`#0b1120`/`#4a9fe0`/amber-500/zinc tokens), Inter at tv-web's real
  px sizes, outline focus rings (not background swaps), and a monospace pairing code. Login's pending view is the
  two-column translucent panel + white QR card, matching tv-web's layout.
- `bsconfig.json` `files` now includes `fonts/**` so the bundled TTFs ship in the package.

## [0.10.19] - 2026-08-16

Adds Roku **Phase 3** — the login screen with both device-code flows, a direct port of tv-web `login.tsx`.

### Added

- **`apps/tv-roku` Phase 3 — login.** A `Login` screen with the two device-code flows: **Plex PIN**
  (`POST /api/tv/auth/plex/start` → poll `/api/tv/auth/plex/poll` @2s, statuses ok/expired/unregistered)
  and **Airwave / better-auth device code** (`POST /api/auth/device/code` → poll `/api/auth/device/token`
  @interval, `access_token` | pending | expired/denied). Each shows a **QR code** + the verification URL +
  the pairing code (tv-web's two-column layout) and polls (a `Timer` firing an `HttpTask`) until it gets a
  bearer token, which is stored (registry) before routing on to the guide. Wired into `MainScene`'s entry
  gate (has server + no token → Login).
- **On-device QR generation** — vendored `@moralcode/qrcode-brightscript` (a `QRCode` node extending
  `Poster`; set its `text` to render the QR). jellyfin-roku has no QR component (its quick-connect is
  text-only), so this is an independent choice for parity with tv-web/tv-native, which both show a QR.
- Keyboard entry (ServerSetup) aligned to jellyfin's `SetServerScreen` idiom (`RSGPalette` + `close = true`).

### Notes

- Transpiles clean; pending on-device verification.

## [0.10.18] - 2026-08-16

Builds Roku **Phases 1 + 2** — the foundation layer and the onboarding / server-setup screen — a direct port
of tv-web/tv-native. Transpiles clean; pending on-device verification (the Ultra was asleep at commit time).

### Added

- **`apps/tv-roku` Phase 1 — foundations.** BrighterScript source ported from tv-web: `registry.bs`
  (`roRegistrySection` + parity storage keys), `serverUrl.bs` (`normalize` with the https-for-domains /
  http-for-LAN rule — the webOS 404 trap), `auth.bs` (bearer token), `api.bs` (URL/header builders),
  `input/keys.bs` (semantic keys), `log.bs`, and a generic async `HttpTask` node.
- **`apps/tv-roku` Phase 2 — onboarding.** `ServerSetup` (on-screen keyboard → validate `GET /api/health` →
  store → route) + `MainScene` as the entry gate (no server → setup; no token → login; else → guide), so
  onboarding is verifiable end-to-end.
- **Networking libraries vendored manually** (ropm is incompatible with our pnpm `catalog:` workspace —
  `EUNSUPPORTEDPROTOCOL`). `roku-requests` (`source/vendor/Requests.brs`) now backs `HttpTask` (HTTPS,
  timeout, JSON, retries handled); `@rokucommunity/promises` (`source/vendor/promises.*` +
  `components/vendor/Promise.xml`) is vendored ready for the async/await api client in Phase 5. A
  `diagnosticFilters` rule exempts `**/vendor/**` from our bslint.

### Notes

- tv-roku still ships in nothing (Docker/Vercel/desktop/EAS all skip it) — dev-only progress.

## [0.10.17] - 2026-08-15

Scaffolds the Airwave Roku client (`apps/tv-roku`) — the third 10-foot client — and proves it boots on real
hardware. Stage 1 of the Roku port (`.plans/roku.md`).

### Added

- **`apps/tv-roku` — Roku client scaffold (Stage 1), booting on a real Roku Ultra.** A new BrighterScript +
  SceneGraph app that renders the Airwave brand via the proven `bsc` → `roku-deploy` sideload loop. It's a
  separately-maintained **direct port** of tv-web/tv-native (Roku shares no code with them), held to strict
  visual + functional parity through the client-agnostic `/api/v1`. Framework-less stack mirroring the
  jellyfin-roku reference: `brighterscript`, `roku-deploy`, `brighterscript-formatter`, `@rokucommunity/bslint`,
  `@rokucommunity/bslib` (Maestro was the intended framework but is officially deprecated, so we build on modern
  BrighterScript + plain SceneGraph instead). Dev loop: `pnpm -F tv-roku run sideload` (the script is `sideload`,
  not `deploy`, to dodge pnpm's built-in `deploy` command).

### Isolation

- tv-roku is fully isolated from the other apps and ships in nothing: Docker builds only `server` (filtered),
  Vercel installs with `--filter site...`, and the desktop/EAS builds never reference it — so it's never built
  into or packed into any release artifact. `pnpm install --frozen-lockfile` stays green.

## [0.10.16] - 2026-08-15

Fixes two webOS-only bugs found by debugging the installed TV app with the remote inspector (both invisible when
running tv-web in a browser).

### Fixed

- **TV login failed with 404 when the server address was entered without a scheme.** A bare domain (e.g.
  `tv.turboforge.io`) defaulted the stored server URL to `http://`. If the server is HTTPS it 301-redirects
  http→https, and a browser following that redirect turns the login **POST into a GET** — so the POST-only auth
  endpoints (`/api/tv/auth/plex/start`, `/api/auth/device/code`) 404. The health check is a GET, so it survives
  the redirect and onboarding wrongly "connected." `normalizeServerUrl` now defaults a bare **domain** to
  `https://`, keeping `http://` only for LAN hosts (localhost, IP addresses, `*.local`).
- **The logo didn't render in the packaged webOS app.** It used a hardcoded `src="/logo.png"`, which on webOS
  resolves to `file:///logo.png` (filesystem root) and is blocked. Moved `logo.png` into `src/assets` and
  imported it as a module so Vite emits a base-relative URL that travels correctly inside the `.ipk`.

## [0.10.15] - 2026-08-14

### Changed

- **Windows installer has a descriptive, versioned filename.** The release asset is now
  `Airwave-<version>-windows-x64-Setup.exe` (e.g. `Airwave-0.10.15-windows-x64-Setup.exe`) instead of the generic
  `Airwave-Setup.exe`, matching the macOS `Airwave-<version>-macos-arm64.dmg` naming so it clearly reads as the
  Windows installer. The Windows release now ships **only** that installer (electrobun's self-extractor stub,
  archive, and update.json are dropped from the artifacts).

## [0.10.14] - 2026-08-14

Makes the packaged desktop TV player auto-point at its own server, instead of showing the "enter a server"
onboarding screen.

### Fixed

- **Packaged desktop TV player had no server URL.** tv-web has two personas: the *browser web player* (Docker
  bakes `VITE_SERVER_URL` so it auto-points at one fixed server) and a *real TV app* (onboards to a user-typed
  server). In the desktop app tv-web is the browser-player persona, but the supervisor served it **without** the
  runtime server-URL injection the admin gets, and the CI build bakes no URL — so it had no server to talk to.
  Now the supervisor injects `window.__AIRWAVE_ENV__` into tv-web too (mirroring the admin), and tv-web reads
  that as its auto-point server (injected → baked → onboard). **Docker + webOS are unchanged** — only the desktop
  supervisor ever injects that global, so both keep using their baked/onboarded URL exactly as before.

## [0.10.13] - 2026-08-14

Fixes two crashes that white-screened the packaged desktop app's admin and TV player after onboarding.

### Fixed

- **Admin white-screened in the packaged app ("Invalid environment variables").** The admin's env schema
  required `VITE_SERVER_URL` (`z.url()`), but the packaged desktop admin is built with **no** baked URL — the
  supervisor resolves a free port each launch and injects the real URL at serve time (`window.__AIRWAVE_ENV__`).
  So `createEnv` threw at import, *before* the runtime injection could be read. Made `VITE_SERVER_URL` optional
  (Vercel/dev still set it explicitly); `serverUrl()` falls back to same-origin if it's ever absent. This only
  surfaced when testing the real CI/Inno installer — the dev "build-on-demand" path bakes the URL, which masked it.
- **TV player white-screened in the packaged app ("PalmSystem is not defined").** `webOSTV.js` (bundled + loaded
  via `<script>`) *defines* `webOS.keyboard.isShowing` even in a plain browser, and its body references the bare
  `PalmSystem` global — undefined off-webOS, so calling it threw a `ReferenceError` that optional chaining can't
  guard (the function exists; it throws *inside*). Wrapped the call in try/catch — no system keyboard anywhere
  but a real webOS TV.

## [0.10.12] - 2026-08-14

Completes desktop code-signing — the Windows installer is now Authenticode-signed, alongside the already-signed
+ notarized macOS build.

### Added

- **Windows installer is Authenticode-signed via Azure Artifact Signing.** The release workflow now signs
  `Airwave-Setup.exe` with **Azure Artifact Signing** (formerly Trusted Signing) using a service principal, so
  Windows no longer shows the SmartScreen "unknown publisher" warning. Uses `azure/artifact-signing-action@v2`
  right after the Inno Setup build, signing the installer in place with an RFC-3161 timestamp (so it stays valid
  after the daily-rotated cert expires). Gated on the Azure secrets existing, so builds without them stay green.
  With this, both desktop platforms are signed: macOS (Developer ID + notarized) and Windows (Authenticode).

## [0.10.11] - 2026-08-14

### Changed

- **Desktop Windows-installer build warns on a stale bundle.** `pnpm -F desktop build:win-installer` only
  *repackages* the last `electrobun build` output — it doesn't rebuild the app. If the freshly-built admin /
  tv-web / setup SPAs or the server bundle are newer than that bundle, it now prints a loud warning to rebuild
  first (`pnpm -F desktop prebuild && pnpm -F desktop build:stable`), so a locally-built installer can't silently
  ship a stale admin UI (which briefly happened — an old bundle still showed the pre-Plex-only login buttons).
  CI is unaffected: it always runs prebuild → electrobun build → installer in order, so the bundle is never stale.

## [0.10.10] - 2026-08-14

Corrects the v0.10.9 tvOS Hermes fix — it was placed in a build script the from-source build never runs.

### Fixed

- **tvOS `hermesvm.framework` `MinimumOSVersion` (ITMS-90360) — now stamped in the script the from-source build
  actually runs.** v0.10.9 added the stamp to `build-apple-framework.sh`, but that only builds the *prebuilt*
  Hermes release tarball. Our build uses `buildReactNativeFromSource`, where the `hermes-engine` podspec runs
  `sdks/hermes-engine/utils/build-hermes-xcode.sh` as a pod **script phase** instead — so the v0.10.9 stamp never
  executed and the Apple TV upload still failed ITMS-90360. Moved it to `build-hermes-xcode.sh`, right after it
  copies the built `hermesvm.framework` into `destroot/Library/Frameworks/tvos/` (the framework the app embeds),
  keyed off `TVOS_DEPLOYMENT_TARGET`, and removed the dead `build-apple-framework.sh` stamp. (iPad/iOS was never
  affected — it's on TestFlight.)

## [0.10.9] - 2026-08-14

Fixes the Apple TV (tvOS) App Store upload, which failed validation on a known from-source-Hermes bug.

### Fixed

- **tvOS App Store upload rejected — `hermesvm.framework` missing `MinimumOSVersion` (ITMS-90360).** A known
  react-native-tvos bug ([react-native-tvos#563](https://github.com/react-native-tvos/react-native-tvos/issues/563)
  / [facebook/react-native#45855](https://github.com/facebook/react-native/issues/45855)): the from-source
  Hermes build stamps `MinimumOSVersion` into the `ios-arm64` slice of the framework's `Info.plist` but **not**
  the `tvos-arm64` slice, so submitting the Apple TV build to App Store Connect fails validation. Added a hunk
  to the `react-native-tvos@0.83.6-0` patch (`sdks/hermes-engine/utils/build-apple-framework.sh`) that stamps
  `MinimumOSVersion` from the deployment target into the framework's `Info.plist` for every platform, right
  after it's built and before the universal xcframework is assembled — so the `tvos-arm64` slice inherits it.
  Building Hermes from source is otherwise unchanged. (iPad/iOS builds were never affected.)

## [0.10.8] - 2026-08-14

Wires up **macOS code-signing + notarization** for the desktop app, and stops the EAS build from uploading a
huge stale cache.

### Added

- **Signed + notarized macOS desktop builds (Developer ID).** The release workflow now signs the macOS app with
  an Apple **Developer ID Application** certificate, notarizes it with Apple, and staples the ticket — so
  Gatekeeper opens it without an "unidentified developer" warning. This is done *outside* electrobun (the same
  way the Windows Inno installer is), because electrobun's built-in signer only reaches `Contents/MacOS` and
  never signs the embedded-Postgres binaries nested in the app, then notarizes anyway and Apple rejects them.
  `apps/desktop/scripts/build-mac-signed.ts` signs every Mach-O leaf-first with the hardened runtime +
  entitlements, builds and signs the DMG, notarizes via an App Store Connect API key, and staples. Fully gated
  on the Apple secrets existing, so builds without them are unchanged. (Windows Authenticode signing is still to
  come.)

### Fixed

- **EAS build uploads no longer drag along the ~2 GB Next.js cache.** `apps/site/.next` is git-ignored only by a
  *nested* `.gitignore`, which the EAS build archive doesn't honor (it reads just the root one) — so a
  `production-tvos` build archive had ballooned to ~1.2 GB. Added `.next`/`.expo` to the root `.gitignore`. Also
  pruned 40 stale webOS `.ipk` build artifacts, keeping only the latest.

## [0.10.7] - 2026-08-14

### Fixed

- **macOS desktop CI ran out of disk** during `electrobun build`'s DMG creation (`hdiutil: No space left on
  device`). GitHub's macOS runners ship ~40 GB of Xcode versions + iOS simulators we don't use (codesign is
  skipped without a cert; no icon compilation). Added a `Free disk space (macOS)` step (removes `Xcode_*.app` +
  CoreSimulator) before the build, mirroring the Docker workflow's cleanup. Windows (Inno installer), Linux, and
  the Docker image were unaffected — this just gets the macOS installer building too.

## [0.10.6] - 2026-08-14

### Added

- **A real Windows installer via Inno Setup** (replaces electrobun's bare self-extracting stub). electrobun
  1.18.1 only produces a console-based self-extractor with no wizard/uninstaller; this wraps its *already-built
  app bundle* (extracted from the electrobun tarball with a real `tar`) into a branded **Inno Setup** installer:
  a proper wizard, a per-user install (`%LOCALAPPDATA%\Programs\Airwave`, no UAC), Start-menu + optional desktop
  shortcuts, an **Apps & Features entry with a clean uninstaller**, and an optional "also remove my data" prompt
  on uninstall. The app content is byte-identical to what the self-extractor would drop — same launcher, embedded
  Postgres, and `%APPDATA%\Airwave` data dir. `apps/desktop/installer/airwave.iss` +
  `scripts/build-win-installer.ts` (`pnpm -F desktop build:win-installer`); the release workflow builds it on the
  Windows runner (`choco install innosetup`) and ships it as the Windows artifact. **Verified locally**: silent
  install lays down all files + registers in Apps & Features; silent uninstall removes cleanly and keeps user
  data by default. (Bonus: Inno + a real `tar` sidestep electrobun's Zig-extractor path-length limit on
  Windows — Linux/macOS still use electrobun's packaging, so the shallow-path workarounds stay.)

### Note

- macOS/Linux installers are unchanged (still electrobun's format). Windows code-signing + macOS
  notarization remain the distribution-polish follow-ups.

## [0.10.5] - 2026-08-14

### Documentation (getairwave.tv site)

- **New "Desktop app" self-hosting guide** (`/docs/self-hosting/desktop`), placed alongside the Docker guide —
  download/install, the onboarding flow, the tray, LAN/tunnel reachability, where data lives, and a
  Docker-vs-desktop comparison. The self-hosting overview now frames the two install paths (desktop vs Docker).
- **Mermaid diagram support on the docs site** via **beautiful-mermaid** (the fumadocs recipe) — a server
  component that renders diagrams to themed SVG at build time (no client JS), with ```mermaid code fences
  auto-converted (`remarkMdxMermaid`). The `/docs/self-hosting` deploy diagram is now a proper Mermaid chart
  (replacing hand-aligned ASCII), corrected to show that **TV apps get guide data from the Airwave server but
  stream media directly from Plex**.

## [0.10.4] - 2026-08-14

### Changed

- **Admin login page: hid the "Email me a magic link instead" option.** Magic-link sign-in stays in the code
  (behind a `MAGIC_LINK_ENABLED` flag) but is no longer shown — the login page now offers Plex + email/password.

## [0.10.3] - 2026-08-14

### Changed

- **Admin login page: Plex-only sign-in.** Removed the "Continue with Google" and "Continue with GitHub"
  buttons (email/password + magic link remain). The "Continue with Plex" button now uses the real Plex tile
  logo (dark tile + Plex-gold chevron) instead of a generic TV icon, and its height matches the email/password
  inputs.

## [0.10.2] - 2026-08-14

Makes the first-run capability-media fetch (0.10.1) actually work, and surfaces it in onboarding.

### Fixed

- **The download hung** — `Bun.write(path, Response)` stalled on the ~430 MB body (no bytes written). Now the
  response is streamed explicitly (`res.body.getReader()` → a `Bun.file().writer()` sink) with byte counting.
- **Extraction failed on Windows** with `tar: Cannot connect to C: resolve failed` — git's GNU `tar` (often
  first on the PATH) treats the `C:` in a `C:\…` path as a *remote host*. Now the tarball is downloaded into the
  target dir and extracted with a **relative** filename (`cwd` = the dir, no `-C`), so no argument carries a
  drive-colon. Works with both GNU tar and bsdtar. Verified: 39 clips land in `%APPDATA%/Airwave/capability-media`
  and `/caps/media/*` serves.

### Added

- **The capability-media download is now a visible step in onboarding.** The supervisor reports progress via
  `/status` (`media: { state, downloaded, total }`), and the provisioning screen shows a "TV capability media"
  row with a live MB/%, then "Ready — codec-probe clips installed" — so you can see it actually downloaded.
  Onboarding waits for both the stack *and* the media step to reach a terminal state before the "ready" screen
  (a failed/optional download doesn't block).

## [0.10.1] - 2026-08-14

Shrinks the desktop installer from ~400 MB to ~68 MB and tightens the first-run tray UX.

### What ships

- **First-run capability-media fetch (installer ~400 MB → ~68 MB).** The ~430 MB TV codec-probe clips are no
  longer baked into the installer — the packaged app now downloads them on first run from the **public
  `airwave-assets` release** (`github.com/Quixomatic/airwave-assets`, `media-v1` → `capability-media.tar.gz`,
  unauthenticated) into user-data, extracting via the system `tar`. It's non-blocking (the server boots
  immediately; the codec-probe clips 404 until the download finishes, then serve), idempotent (a
  `.airwave-complete` marker), and non-fatal. Overridable via `CAP_MEDIA_URL`. The CI `Fetch capability media`
  step is removed (faster builds); set `AIRWAVE_BUNDLE_MEDIA=1` to bake the clips in for an offline build.
- **Tray menu reflects the onboarding state.** Until first-run setup is complete (and not attached to a dev
  stack), the tray shows **"Set up Airwave"** instead of "Settings" and **disables "Open Admin" / "Open TV
  player"** (there's no running stack yet). Clicking it reopens the onboarding window — so accidentally closing
  onboarding is recoverable. Once configured it flips to the normal enabled menu. (The served setup UI already
  picks onboarding-vs-settings by `/config`.)

## [0.10.0] - 2026-08-14

**Milestone: Airwave Desktop is real.** Stepping the version line off `0.9.x` (where we'd sat while eyeing v1)
to mark a genuine leap — the desktop app went from "a packaged bundle that does nothing" to **self-contained,
one-click installers that actually boot the whole Airwave server next to Plex**, on every desktop OS.

### Highlights (the work landed across v0.9.109–0.9.112)

- **One-click installers for Windows, macOS (Intel + Apple Silicon), and Linux (x64 + ARM64)** — each bundles
  the engine-less server, embedded Postgres, the admin + tv-web SPAs, the onboarding UI, and (for now) the TV
  capability-probe media. Proven end-to-end in a real install: it installs, boots embedded Postgres → applies
  migrations → bootstraps the workflow schema → starts the server → serves the real onboarding UI, with the
  durable workflow engine (Channel Import + AI lineups) working.
- **A green 5-platform GitHub Actions matrix** (`desktop-release.yml`) builds all five installers from a clean
  checkout. A `v*` tag now produces both the Docker image and the desktop installers, auto-attached to the
  GitHub Release.

### Notes

- This is a version-line milestone; the substantive changes are itemized under 0.9.109–0.9.112 below.
- Installers are currently ~400 MB (the capability-probe media is baked in) and macOS builds are unsigned. The
  next steps — a public `airwave-assets` host for first-run media fetch (→ ~70 MB) and macOS
  signing/notarization — are tracked in `.plans/desktop-server.md` §12.

## [0.9.112] - 2026-08-14

Makes the **durable workflow engine work in the packaged desktop app** — Channel Import and AI lineups (which
query `workflow.workflow_steps`) were disabled there because the packaged app can't run `workflow:bootstrap`
(no `node_modules`/CLI). Now it ships a standalone bootstrap, proven end-to-end in a real install.

### What ships

- **Standalone workflow-schema bootstrap** (`apps/server/scripts/workflow-bootstrap.ts` → `wf/bootstrap.mjs`).
  Replicates `@workflow/world-postgres`'s `setupDatabase()` — runs its drizzle migrations (`workflow.*` tables)
  + graphile-worker's schema — against the embedded DB, bundled like `server.mjs`/`migrate.mjs`. graphile-worker
  embeds its SQL in JS, so only world-postgres's 10 drizzle `.sql` files ship (copied to `wf/m/`). `drizzle-orm`
  + `graphile-worker` added as direct server devDeps so the bundle resolves them. The supervisor runs it on boot
  in packaged mode and now honors the workflows toggle there (was forced off). **Verified in a real install**:
  bootstrap creates the schema, `[workflow] engine ready`, zero `workflow.workflow_steps does not exist` errors.
- **Fixed a second `TarUnsupportedFileType` installer crash.** The workflow drizzle migrations, shipped under
  `server/wf/src/drizzle/migrations/`, pushed the longer filenames (e.g.
  `0010_add_events_entity_creation_unique_index.sql`) past 100 chars → PAX/long-name tar records electrobun's
  self-extractor can't read, aborting the install mid-extract. They now ship at a shallow `wf/m/` (~75 chars),
  well under the limit. (electrobun's extractor not supporting modern long-path tar entries is the root
  limitation — worth an upstream fix.)

## [0.9.111] - 2026-08-14

Bakes the TV capability-probe media into the packaged desktop app, so the codec diagnostic works offline —
matching the Docker image.

### What ships

- **Capability-probe clips baked into the installer** (`server/capability-media`). The desktop CI
  (`desktop-release.yml`) now pulls `capability-media.tar.gz` from the private `media-v1` GitHub release — the
  same asset `docker-publish.yml` uses, authenticated via `GITHUB_TOKEN` (which the Action has and an end-user
  install would not) — and `electrobun.config` bundles it into the app. The bundle copy is guarded, so a build
  without the media still succeeds (clips absent, server boots). Locally, dev's `apps/server/capability-media`
  is bundled. The packaged supervisor's `capMediaDir()` reads it from `server/capability-media`.

### Note

- This makes the installer ~400 MB (the clips are already-compressed video). A **first-run fetch** (67 MB
  installer, clips downloaded into user-data on first launch) is the planned optimization — it needs a *public*
  URL for the asset (a private repo's releases can't be fetched by an end-user install), so it's deferred until
  the asset is publicly hosted (a separate public assets repo/bucket, or the repo going public at v1.0). The
  supervisor already has the `CAP_MEDIA_USER` path + `capMediaDir()` fallback for that swap.

## [0.9.110] - 2026-08-13

Makes the desktop installer actually install. The v0.9.109 bundle built fine but `Airwave-Setup.exe` aborted
mid-extract, so the app never landed on disk — plus a port-collision bug that surfaced once it did boot.

### Fixed

- **The Windows installer crashed mid-extraction with `TarUnsupportedFileType`.** The embedded-Postgres binaries
  nested under `pg/node_modules/@embedded-postgres/windows-x64/native/…` — paths over 100 chars, which made the
  tar writer emit PAX / GNU long-name records that electrobun's own Zig self-extractor can't read, so it bailed
  after ~115 of 1,873 files (dropping `Resources/main.js`, so the launcher had nothing to run). Now the native
  binaries ship **shallow** at `pg/native/`, with a generated per-platform **stub** package
  (`scripts/build-pg.ts`) bridging embedded-postgres's `import('@embedded-postgres/<platform>')` to them — every
  bundle path stays short, so classic ustar is used and the extractor completes. **Verified**: a clean install
  now extracts all files, promotes to `…\com.airwave.desktop\stable\app`, and boots the packaged supervisor
  (embedded PG + real onboarding UI).
- **Dynamic ports could collide.** When the preferred ports (36020/36021/36022) were already taken, `freePort()`
  handed every service the *same* next-free port, because it probes the OS but nothing is bound between calls.
  It now tracks the ports already assigned this pass and skips them.

## [0.9.109] - 2026-08-13

Stage 5 — the packaged desktop app is now self-contained: `electrobun build` produces a booting installer with
the server, embedded Postgres, migrations, and SPAs all bundled. Nothing on the user's machine needs
pnpm/turbo/vite/node_modules. (Supersedes the v0.9.108 WIP packaged-mode supervisor.)

### What ships

- **Embedded Postgres in the bundle.** The `embedded-postgres` wrapper is pre-bundled into `pg/pg-launcher.mjs`
  (wrapper + `pg` + `async-exit-hook`; the 8 per-platform binary packages left external), and the current
  platform's binary package is copied to `pg/node_modules/@embedded-postgres/<platform>`. The packaged
  supervisor imports the launcher by absolute path; it resolves `initdb`/`postgres`/`pg_ctl` from the adjacent
  `node_modules` — verified from the extracted bundle. (A literal `import "embedded-postgres"` can't work —
  electrobun's bundler resolves only `bun` builtins + `electrobun/bun` — so the wrapper is pre-bundled, the same
  pattern as the standalone `server.mjs`.)
- **`electrobun.config` copies the whole runtime into the bundle:** the engine-less `server.mjs` + `migrate.mjs`
  + the Prisma migration SQL → `server/`; the pg launcher + platform binaries → `pg/`; the admin/tv-web/setup
  SPAs → `views/`. The platform-package copy source is realpath'd (dodges pnpm's symlink) and made relative
  (electrobun concatenates copy keys onto the app dir, so an absolute path is mangled).
- **`desktop prebuild` now builds the standalone server + the pg launcher** (`build:standalone` +
  `build:pg-launcher`) alongside the SPAs, so CI emits a self-contained bundle. Each matrix runner bundles its
  own OS/arch (pnpm installs only the matching `@embedded-postgres` optional dep).
- **Packaged admin server URL via runtime injection** (the "build once, deploy anywhere" recipe). The prebuilt
  admin can't be rebuilt per-install the way `dev:desktop`/Docker re-bake it with vite, yet the supervisor
  re-resolves a free server port every launch. So it injects the resolved, proxy-aware server URL into the
  served `index.html` as `window.__AIRWAVE_ENV__`; a new `apps/web/src/lib/runtime-env.ts` reads it first,
  falling back to the baked `import.meta.env`. One static admin build then works at whatever port the supervisor
  picked. Vercel / `pnpm dev` / tv-web are unchanged (tv-web already resolves its server at runtime).

### Still open (non-blocking for a booting install)

- First-run fetch of the ~430 MB `media-v1` capability clips (not bundled — the codec-probe clips are simply
  absent until then; the server still boots).
- Workflows / AI-imports stay off in the packaged app until a standalone workflow-bootstrap runner ships.
- The Windows app icon isn't embedded (electrobun can't find `rcedit` locally); macOS signing/notarization +
  auto-update are wired but off.

## [0.9.107] - 2026-08-13

### Added (Stage 5 — self-contained desktop server, part 1)

- **`apps/server` `build:standalone` — a fully self-contained server bundle for the packaged desktop app.**
  The app already uses Prisma's **pg driver adapter** (`@prisma/adapter-pg`), so Prisma runs **engine-less**
  (pure JS, no Rust query engine). `bun build` bundles the built server + all ~1,639 JS modules into a single
  **43 MB `server.mjs`** that runs with **zero `node_modules`** — verified end-to-end from an isolated dir (it
  boots, seeds the admin via a real Prisma write, and serves `/api/health`). The only native binary the whole
  app needs is embedded-Postgres.
- **Engine-less migration runner** (`apps/server/scripts/migrate-standalone.ts` → `migrate.mjs`).
  `prisma migrate deploy` needs the Prisma CLI + Rust schema-engine, which the packaged app doesn't ship. This
  applies the committed migration SQL directly via `pg`, tracked in `_prisma_migrations` the same way
  `migrate deploy` does — verified: applies all 8 migrations and builds the full schema on a fresh DB. Added
  `pg` as a direct server dependency.

This is the server half of Stage-5 packaging. Remaining: bundle the embedded-Postgres binary + wire
packaged-mode into the supervisor + the electrobun bundle (`build.copy` / `asarUnpack`). See
`.plans/desktop-server.md`.

## [0.9.106] - 2026-08-13

### Added

- **`.github/workflows/desktop-release.yml` — the desktop build CI (matrix, all three OSes).** A separate
  workflow from `docker-publish.yml`, triggered on the same `v*` tags (a tag fires both) plus manual dispatch.
  Builds the Electrobun app natively on **macOS arm64** (`macos-14`) + **x64** (`macos-13`), **Windows x64**
  (`windows-2025`), and **Linux x64** (`ubuntu-24.04`) + **arm64** (`ubuntu-24.04-arm`) — 5 artifacts — via
  `pnpm -F desktop prebuild` (server + admin + tv-web + setup UI) then `electrobun build --env=stable|canary`,
  attaching the artifacts to the GitHub Release. Added `build:stable` / `build:canary` scripts to
  `apps/desktop`.

### Note

- **The produced bundle is not yet a runnable install** — the supervisor still assumes the monorepo at runtime
  (rebuilds the server + SPAs with `pnpm`/`turbo`). Making the packaged app self-contained (ship the server +
  runtime deps + embedded-Postgres binary + migrations, skip the dev-only build-on-demand, first-run media
  fetch) is the remaining **Stage-5** work. macOS signing/notarization + auto-update (`release.baseUrl`) are
  also deferred (the workflow documents both). See `.plans/desktop-server.md`.

## [0.9.105] - 2026-08-13

### Fixed

- **Workflows / channel-Import observability still failed with `relation "workflow.workflow_steps" does not
  exist`** even after v0.9.104 ran the bootstrap. The durable workflow engine — and its `workflow:bootstrap` —
  connect via their own **`WORKFLOW_POSTGRES_URL`** (which docker-compose sets), NOT `DATABASE_URL`. The
  supervisor never set it, so the bootstrap created (or targeted) the wrong/no database and the `workflow.*`
  schema was absent from the embedded DB that Prisma reads. The supervisor now sets `WORKFLOW_POSTGRES_URL` (=
  the embedded `DATABASE_URL`) plus `WORKFLOW_TARGET_WORLD` / `WORKFLOW_LOCAL_BASE_URL` for both the bootstrap
  and the server, matching compose. **Verified end-to-end**: the bootstrap now creates `workflow.workflow_steps`
  in the embedded DB. Just relaunch — no DB wipe needed.

## [0.9.104] - 2026-08-13

### Fixed

- **Workflows / channel Import errored with `relation "workflow.workflow_steps" does not exist`.** The desktop
  supervisor never bootstrapped the durable workflow engine's schema (the `workflow.*` tables graphile-worker +
  step tracking use) — Docker does this via `workflow:bootstrap`. The supervisor now runs
  `pnpm --filter server workflow:bootstrap` after migrate (idempotent, non-fatal). It runs regardless of the
  workflows toggle because channel Import's progress view queries those tables too.
- **Tray icon was blank on Windows.** The Windows system tray is HICON-native and doesn't render a PNG; on
  Windows it now loads the multi-size `.ico` (`views://assets/icon.ico`); mac/linux keep the 32×32 PNG.
- **Setup-window content wasn't centered.** The webview mis-measures viewport height on first paint — re-added
  the one-pixel `setSize` nudge (WebView2 needs it too, same as CEF) so it re-measures and centers.

### Note

- The window **title-bar icon** only appears in a packaged build (`build.win.icon`); `electrobun dev` uses the
  dev runtime's icon and there's no per-window icon API — it's correct once we do Stage-5 packaging.

## [0.9.103] - 2026-08-13

### Fixed

- **Embedded Postgres was initialized as WIN1252, not UTF8 — metadata sync (and any non-Latin-1 title like
  `Ō`) failed** with "character … has no equivalent in encoding WIN1252". On Windows `initdb` defaults to the
  system locale (WIN1252). The supervisor now passes `initdbFlags: ["--encoding=UTF8", "--locale=C"]`.
  **Existing desktop installs must delete `%APPDATA%\Airwave\pgdata`** (a cluster's encoding can't be changed
  in place) so it re-initializes as UTF8.
- **The Settings window now reopens from the tray without crashing.** Switched the setup/settings window from
  bundled **CEF to the system webview** (`bundleCEF: false`, `defaultRenderer: "native"` → WebView2 on Windows).
  CEF on Windows segfaulted on window *reuse* (BasicTimeTracker never hit this — it uses one CEF window it never
  reopens); the native webview + the documented `show()`/`hide()` reuse pattern is stable, and lighter (~14MB
  vs ~100MB). Tray "Settings" reopens the native window (reloads `/setup`, re-reads config); `/save` restarts
  the stack for changed settings.
- **Tray icon now renders** — loaded via the `views://assets/airwave-tray.png` scheme (an absolute filesystem
  path didn't render on the Windows tray), 32×32.
- **Tray menu label** dropped the Unicode ellipsis (`"Settings…"` → `"Settings"`) that showed as garbage
  characters in the native menu.

## [0.9.102] - 2026-08-13

### Fixed

- **Reopening Settings from the tray still crashed (CEF segfault in `USER32.dll`).** Electrobun/CEF on Windows
  segfaults on *any* second operation on a `BrowserWindow` — recreating one, or even `show()`/`activate()` on a
  hidden one. So the native window is now used **once**, for first-run onboarding only (that works great), and
  tray **"Settings…" opens the same served UI in the browser** — the identical page, just a tab, with no second
  window op. `/save` still (re)starts the stack for changed settings.
- **Tray icon didn't render.** The Electrobun `Tray` defaults to 16×16 and needs an explicit size; the icon was
  a 180×180 PNG with no dimensions. Now uses the 32×32 Airwave favicon with `width: 32, height: 32`
  (`template: false`, full-color) — matching the documented tray example.

### Added

- **Windows app icon** (`build.win.icon = assets/icon.ico`) for the packaged app's taskbar / shortcut / window
  (the title-bar icon in `electrobun dev` still comes from the dev runtime; it applies to the built app). mac/
  linux app icons are a Stage-5 packaging follow-up.

## [0.9.101] - 2026-08-13

### Added

- **Airwave Desktop: Docker-style remote-access config (Server / Admin address + Additional allowed origins).**
  The setup UI gains a "Remote access & tunnels" section mirroring the self-host `SERVER_PUBLIC_URL` /
  `WEB_PUBLIC_URL` / `EXTRA_CORS_ORIGINS` env vars, so you can reach Airwave over a domain / HTTPS tunnel (e.g.
  Cloudflare) exactly like the compose deployment. Blank = local: the admin faces **`localhost`** (not
  `127.0.0.1`) and tv-web bakes your **real LAN IP**; set an HTTPS server/admin address and the admin, TVs, and
  the tunnel all work — with the local + LAN admin origins always allow-listed so you can still browse there.
  The supervisor derives `VITE_SERVER_URL` (admin vs tv-web separately), `BETTER_AUTH_URL`, `CORS_ORIGIN`,
  `TV_APP_ORIGIN`, and `EXTRA_CORS_ORIGINS` from these three fields.

### Fixed

- **Reopening the setup/settings window from the tray crashed (CEF segfault).** Electrobun/CEF segfaults when a
  second `BrowserWindow` is created after one was destroyed. The supervisor now creates the setup window once
  and keeps it alive — reopening **shows + reloads** it, and finishing/handing off to the admin **hides** it
  (never `close()`). Changing settings there still (re)starts the stack via `/save`. If the window is
  force-closed with the native X, reopening falls back to the browser rather than risking the crash.

## [0.9.100] - 2026-08-13

### Fixed

- **Airwave Desktop picked a virtual/VPN adapter as the "IP TVs can connect to."** `lanIp()` returned the first
  non-internal IPv4, which on a machine with NordVPN/Docker/WSL was a `10.x`/`172.x` address (e.g. `10.5.0.2`
  from `NordLynx`) that no TV can reach. It now skips known virtual/VPN adapters (Docker, WSL, Hyper-V,
  Tailscale, Nord/WireGuard, VMware, …) and prefers a real home-LAN `192.168.x` (then `172.16–31.x`, then
  `10.x`). Verified it now selects the real `192.168.x` LAN address for tv-web + the tray/setup "point your TVs
  here" display.

## [0.9.99] - 2026-08-13

### Fixed

- **Airwave Desktop: admin login didn't persist (`get-session` returned null) when "expose on my network" was
  on.** With expose on, `lanIp()` baked the server's LAN address (e.g. `http://10.5.0.2:36020`) into the admin,
  but the admin is served at `http://127.0.0.1:36021` — so every auth request was **cross-site** (`127.0.0.1` →
  `10.5.0.2`), and better-auth's `SameSite=Lax` session cookie is never sent cross-site, so the server saw no
  cookie. The supervisor now bakes **`127.0.0.1` into the admin** (same host as where it's opened → same-site →
  the cookie flows) and sets `BETTER_AUTH_URL` to the loopback host, while **tv-web** still bakes the LAN URL
  when exposed (TVs authenticate with a bearer token, not a cross-site cookie). Relaunch rebuilds the admin
  automatically (the build marker no longer matches) — you'll just log in once more.

## [0.9.98] - 2026-08-13

### Fixed

- **Airwave Desktop ran a STALE server bundle, so first-boot admin seeding failed** ("Email and password sign
  up is not enabled"). Build-on-demand only rebuilt when the artifact was *missing*, so after a source fix (the
  v0.9.95 `seedAdmin` change) the desktop kept serving the old server bundle that still called the disabled
  `signUpEmail`. The supervisor now rebuilds server / admin / tv-web / setup-UI whenever **source is newer than
  the built artifact** (mtime over the app's `src` + all `packages/*/src`, since the server bundle inlines
  `@airwave/*`) — not just when missing. The packaged binary has no monorepo dirs, so this stays a no-op there.
- **`electrobun dev --watch` fought the supervisor.** The supervisor writes fresh SPA builds into
  `apps/web/dist`; `--watch` saw those changes and tried to rebuild the Electrobun app, which `rmSync`s its own
  `build/dev-win-x64` — locked by the running app → endless `EACCES`. Dropped `--watch` from `pnpm dev:desktop`
  (a long-running supervisor and watch-rebuild are incompatible — edit the supervisor, then restart it).

### Changed

- **A proper onboarding finish screen.** Setup no longer auto-closes the window and auto-opens the browser the
  instant the stack is ready. The wizard ends on a calm "Airwave is ready" screen with an animated check, an
  **Open Airwave** button (→ the supervisor's new `POST /open-admin`), and a "you can close this window —
  Airwave keeps running in your tray" note.

## [0.9.97] - 2026-08-13

### Fixed

- **`pnpm dev` no longer spins up a stray Vite dev server for `apps/desktop-setup`.** The onboarding/settings
  UI is only ever built and served by the desktop supervisor (never run standalone), so it's now excluded from
  the root `turbo run dev` alongside `desktop` (`--filter=!@airwave/desktop-setup`).

## [0.9.96] - 2026-08-13

### Added

- **Airwave Desktop: a native first-run onboarding + settings experience, built with the real design system.**
  New **`apps/desktop-setup`** — a small Vite + React app using **`@airwave/ui`** (shadcn components, the oklch
  theme, the Airwave logo, lucide icons) — renders in a native Electrobun webview window (CEF) as a stepped
  wizard: welcome → create your admin account → options → **live provisioning progress** (Building the server /
  Starting the database / Preparing the database / Starting Airwave, with a progress bar + per-step checklist)
  → done. The running app stays tray-first with the browser as the admin/tv-web UI; the window is only for
  setup/settings.
  - The supervisor drives it via three endpoints: **`GET /config`** (first-run vs settings + current toggles),
    **`POST /save`** (admin creds + knobs → persist → (re)start the stack), **`GET /status`** (granular
    provisioning `phase` + readiness). It serves the built setup UI at the setup port and builds it on demand.
  - **Admin account provisioning (the missing piece for a usable desktop install):** the supervisor never set
    `ADMIN_EMAIL`/`ADMIN_PASSWORD`, so the fresh embedded DB had no owner and no way to make one (public sign-up
    is disabled). The onboarding form now collects them, the supervisor persists them, and passes them to the
    server so `seedAdmin` creates the owner on boot.
  - **Secrets are auto-generated:** `BETTER_AUTH_SECRET` is generated + persisted on first run — a desktop user
    never sets an env var.

### Changed

- **File logging.** The supervisor tees its own output + every child process (builds, migrate, server,
  Postgres) to `<user-data>/desktop.log` — a tray app has no attached console, and `electrobun dev` scrollback
  is painful to copy.
- Electrobun now bundles CEF (`defaultRenderer: "cef"`) for the native setup/settings window;
  `exitOnLastWindowClosed` stays false so closing the window keeps the tray (and the running stack) alive.

## [0.9.95] - 2026-08-13

### Fixed

- **First-boot admin seed was broken — it used the disabled email/password sign-up.** `seedAdmin` (the
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` startup bootstrap) called `auth.api.signUpEmail`, but public email/password
  sign-up is disabled (`emailAndPassword.disableSignUp: true` — accounts are admin-created only), so the initial
  admin was silently never created on a fresh deployment (e.g. the desktop app's fresh embedded DB, or a new
  Docker/self-host install). Switched it to the admin-plugin **`auth.api.createUser`** — the same path the admin
  UI's users module uses — which hashes the password and writes the `credential` account, with `role: "admin"`
  applied at creation. It's called with no session/headers, which the admin plugin treats as a trusted
  server-side call and skips the admin-permission check (the chicken-and-egg first-admin bootstrap: there's no
  admin yet to authorize creating one). Verified end-to-end against a fresh migrated DB — the admin is created
  (idempotent on re-run), gets the `admin` role + a credential account, and can actually log in.

## [0.9.94] - 2026-08-13

### Fixed

- **Airwave Desktop: `pnpm dev:desktop` failed on a real launch — three bundled-context bugs the source-only
  harness couldn't surface.** All isolated to `apps/desktop`; nothing in the server, Docker, or tag builds
  changed.
  - **Repo-root resolution.** Under `electrobun dev` the supervisor runs from the *bundle*
    (`apps/desktop/build/…/Resources/app/bun`), so the fixed `../../../..` pointed into the build dir — the
    server-dist check always missed (endless rebuild) and admin/tv-web couldn't be served. `findRepoRoot()` now
    walks up for `pnpm-workspace.yaml` (works from source *and* the dev bundle; falls back for the future
    installed binary, which has no monorepo).
  - **Stale persisted ports.** An old `airwave-desktop.json` in user-data pinned previous defaults
    (admin 3001 / setup 3009) over the new 36020 range. `loadConfig()` now ignores any persisted `ports`
    (resolvePorts picks free ones regardless) until `/setup` can actually edit them.
  - **Non-idempotent server build.** `workflow build && tsdown` chokes on a stale `dist/` left by a prior build
    — which build-on-demand hits because it runs the production build locally where `dist/` persists (unlike
    Docker's fresh checkout). The supervisor now cleans `apps/server/dist` + `.well-known` before building the
    server. **The server build script is unchanged** — Docker and `v*` tag builds are byte-for-byte identical
    and never hit this (fresh checkout = no stale dist).

## [0.9.93] - 2026-08-13

### Added

- **Airwave Desktop: dynamic port allocation.** Electrobun is a native host process, not a container — it
  shares the machine's single port space — so the supervisor no longer assumes its ports are free. On startup
  `resolvePorts()` probes each preferred port (`net.createServer` bind test) and falls back to the next free one
  (then an OS-assigned ephemeral). Postgres and the `/setup` page are loopback-internal; the server/admin/tv-web
  ports feed the browser URLs, and everything downstream (CORS, `BETTER_AUTH_URL`, the tray label, and the SPAs'
  baked `VITE_SERVER_URL`) is derived from the *resolved* ports — with the marker-based rebuild re-baking the
  SPAs if the server port shifted. A running Plex/dev-stack/anything on `36020`/`54329`/etc. no longer collides.

### Fixed

- **`pnpm --filter server build` was broken locally, blocking the desktop's build-on-demand.** A drifted install
  had floated `tsdown` up to 0.22.4, whose `.ts`-config loader is an *optional peer* (`unrun`) that pnpm doesn't
  auto-install — so `tsdown` died with "Failed to import module 'unrun'" while loading `tsdown.config.ts`. Added
  `unrun` to the server's devDependencies so the config loads and the server bundle builds again.

### Verified

- The full **standalone desktop pipeline** runs green end-to-end on Windows: free-port resolution →
  build-on-demand (server bundle + admin SPA baked to the chosen server URL) → **embedded Postgres** (initdb +
  start) → `prisma migrate deploy` (all 8 migrations, against the *embedded* DB — confirmed via the datasource
  line, never a real one) → the server boots (`GET /api/health` → `200 {"ok":true}`) → the admin SPA is served
  (`200`) → clean shutdown. Embedded PG init/start/createDatabase/stop all confirmed on Windows.

## [0.9.92] - 2026-08-13

### Fixed

- **`apps/desktop` now runs as a genuinely self-contained stack under `pnpm dev:desktop`.** The supervisor used
  to decide whether to boot its own stack from the Electrobun *release channel* (`Updater…channel()`), which is
  always `"dev"` under `electrobun dev` — so it never supervised and just assumed a `pnpm dev` stack was already
  running (why booting it standalone reached a dead `:3001`). Replaced that with a **runtime port probe**
  (`detectAttach()` HEAD-probes `localhost:3001`/`:3000`): if a `pnpm dev` stack is already up it attaches to it;
  otherwise it **self-hosts the entire stack** — embedded Postgres → `prisma migrate deploy` → the server →
  admin + tv-web — on its own `3602x` ports. Same code path the eventual installed binary runs.
- **`apps/site` Vercel deploys failing with "The Next.js output directory `.next` was not found".** The root
  `turbo.json` `build` task never listed `.next/**` in its `outputs` (it was written for the Bun/server apps'
  `dist/**`), so it worked only while every site deploy was a fresh build. Once a commit that didn't touch
  `apps/site` triggered a redeploy, site's build task hit turbo's remote cache — and a cache *replay* restores
  only recorded outputs, which excluded `.next`, so Vercel found nothing. Added `.next/**` (minus
  `.next/cache/**`) to the build outputs so the Next output is captured and restored correctly.

### Added / Changed

- **Build-on-demand.** In self-hosted mode the supervisor builds whatever's missing before serving: the server
  bundle if absent, and the admin/tv-web SPAs **built with the correct `VITE_SERVER_URL`** for its own ports
  (the SPAs bake that at build time — mirroring the Docker `web`/`tvweb` roles, so a paired browser actually
  reaches the server). A build marker records the URL each SPA was built for and rebuilds only on change, so
  later launches are fast; the installed binary pre-bakes these, making it a no-op.
- **Tray shows the Airwave mark** (`apps/desktop/assets/airwave-tray.png`, admin-icon fallback), wired into the
  electrobun `build.copy` as `views/assets` for the bundle.
- Windows-safe `pnpm` spawning (a `cmd /c` shim) for the build/migrate steps.

### Housekeeping

- Approved the `embedded-postgres` platform build scripts via `onlyBuiltDependencies` so the PG binary is
  correct after a fresh install on any OS (on Windows the binary ships already extracted — the postinstall only
  hydrates symlinks on mac/linux). Added a `three` module shim so `tsc --noEmit` stays clean against
  electrobun 1.18's untyped transitive import, and typed the tray click handler against electrobun's event.

## [0.9.91] - 2026-08-13

### Added

- **`apps/desktop` — Airwave Desktop (Electrobun tray supervisor).** A one-click, **tray-only** desktop app
  that runs the Airwave stack — **embedded Postgres + server + admin + tv-web** — on local ports next to Plex,
  no Docker/NAS, for the run-Plex-on-your-main-machine crowd. The **browser is the UI** (tray → Open Admin);
  real TVs on the LAN connect to the machine's LAN IP. It mirrors `docker/entrypoint.sh` natively: start
  **embedded Postgres** (a real PG binary via `embedded-postgres` → zero app-code change, full workflow
  parity; PGlite/SQLite deliberately rejected) → `prisma migrate deploy` → spawn the built server → serve the
  admin + tv-web SPAs (replicating `serve-web.ts`), all driven by a config file with a friendly **"expose on
  my network"** toggle (the docker-compose CORS/exposure knobs). Points the server at `CAP_MEDIA_DIR` for the
  capability-diagnostic clips.
- **Real** in this pass: the tray (Electrobun `Tray` API), config load/save, browser-open, LAN detection, the
  `/setup` server, and the full supervisor wiring. **Stage-5 TODOs**: distribution bundling — shipping the
  server + fetching the ~430MB `media-v1` capability media on first run. Not yet verified on a real Electrobun
  run (`pnpm -F desktop dev` + build-script approval needed). Full plan: `.plans/desktop-server.md`.

## [0.9.90] - 2026-08-12

### Changed

- **`apps/site` landing polish — motion, a shader CTA, carousels, brand logos, and spacing.** A large
  iterative pass on the marketing pages:
  - Extracted the shader components into a shared `components/shaders.tsx` and added a compact **`ShaderCta`**
    — its own component, a short band with the moving grain wash + a right-anchored dithered logo scaled for
    it — used on the home / Features / Channel-guide bottom CTAs.
  - A **`ClipCarousel`** with three variants: `bar` (Features hero, story-style segmented progress
    indicator), `split` (Channel guide — ~60% player + a synced title/subtitle panel), and `bare` (the home
    hero's corner loop — screenshot poster fallback, no controls). All lock a 16:9 box so swapping clips never
    shifts layout.
  - **In-view demo clips** (`InViewVideo`, framer-motion `useInView`): inline clips play once when scrolled
    in, pause when they leave, replay on hover/focus, and rest on a representative middle frame.
  - **Channel guide rebuilt** as editorial side-by-side blocks (heading + paragraphs beside a bulleted
    checklist card) covering the full guide feature set, instead of a grid of tiny cards.
  - The home **platforms card** gains brand logos (Apple / LG / Android / Amazon / a globe) via `react-icons`,
    a divider, and **Roku / Samsung (Tizen)** "Soon" badges; the **10-foot switcher** became a ghost card with
    a segmented control straddling a small framed screenshot; and the self-host + 10-foot rows read as one
    2×2 grid (matched gaps).
  - The self-host `docker-compose.yml` shown on the site drops its comment header, shows `name: airwave`, and
    scrolls at a `max-h`.
  - Added `framer-motion` and `react-icons`.

### Note

- The site's displayed compose is a cleaned copy — the repo's real `docker-compose.yml` still uses
  `name: channelguide` on purpose (changing the compose project name re-prefixes an existing deployment's
  volumes, which is a migration rather than a rename).

## [0.9.89] - 2026-08-12

### Changed

- **Features and Channel-guide pages rebuilt in the landing design system, with real demo videos.** Extracted
  the home page's fumadocs-style helpers (`heading`/`button`/`card`/`Wide` + a new `Pill` and an autoplaying
  muted-loop `DemoVideo`) into a shared `apps/site/components/landing.tsx`, and refactored the home page to
  use it — one source of truth for the marketing design language.
  - **Features** — hero + a showcase clip, then four alternating media/text sections (Watching, Building,
    Playback, Access & privacy) and a "See it in motion" gallery, wiring in eight screen-recorded clips of
    the real 10-foot app (`public/demos/*.mp4`).
  - **Channel guide** — hero clip + alternating points (grid, DVR scrubber, filter lenses, channel surfing)
    each paired with a clip, plus the admin guide-preview showcase.
  - Demo clips are silent, autoplaying MP4 loops (h264) cut from a screen recording of tv-web. Still a work
    in progress.

## [0.9.88] - 2026-08-12

### Changed

- **`apps/site` landing page rebuilt in fumadocs.dev's own landing style.** Replaced the marketing home page
  with a spacious, rounded-panel layout modeled on fumadocs' MIT-licensed landing: a big hero panel with an
  animated WebGL **shader glow** (`@paper-design/shaders-react` — GrainGradient + a dithered mark), the
  oversized brand-highlighted intro statement, a `ServerCodeBlock` "self-host in minutes" `compose.yaml`
  showcase, a sliding **preview switcher** (Guide / Playing / Bumper), cva-style feature cards, a platforms
  panel, a three-step strip, an admin showcase, and a CTA. Reskinned entirely to the Airwave navy/sky-blue
  brand.
  - The hero's dithered shape is the **Airwave logo itself** — `ImageDithering` fed a pre-baked, spherically
    shaded copy of the mark (`public/logo-lit.png`), so the logo retains its detail while dithering with the
    same light-to-shadow, masked-into-the-corner look the abstract sphere had.
  - New landing brand tokens in `global.css` (`bg-brand`, `text-brand`, `text-landing-foreground`, …) wired
    through `--brand*` vars so light/dark still switch; the shaders and text were tuned dark-first for
    readability (darker gradient, brighter headline/subtext, a frosted pill).
  - The "self-host in minutes" showcase renders the **real** repo-root `docker-compose.yml` verbatim (via a
    generated `compose.ts`), in a scrollable block.
  - A fumadocs "For Engineers"-style grid: a **"Works on most platforms"** card with a subtle dithered-warp
    background (`AgnosticBackground`) and the platform badges, beside a **"Three steps to live TV"** card built
    on the fumadocs **`Steps`** component.
  - Added `@paper-design/shaders-react` (^0.0.78) as the one new dependency; the shaders are client-only
    (`ssr:false`) and pause when off-screen.
  - Still a work in progress — more polish to come.

## [0.9.87] - 2026-08-12

### Fixed

- **`apps/site`: the marketing mobile menu was empty.** Every top-nav link (Documentation, Features, Channel
  guide, FAQ, Resources) was set to `on: "nav"` — which, per fumadocs, is "only displayed on navbar, not
  mobile menu" — so the hamburger menu on the home/marketing pages had nothing in it. That flag was there for
  a different reason: to stop the links duplicating into the docs sidebar. `baseOptions()` is shared by both
  layouts, so it's now context-aware: the **home** layout leaves `on` unset (the fumadocs default shows links
  in both the navbar and the mobile menu), while the **docs** layout keeps `on: "nav"` (navbar-only, no
  sidebar duplication — it has its own switcher).

## [0.9.86] - 2026-08-12

### Changed

- **Docs information architecture: Settings absorbs its sub-sections, and the AI assistant becomes its own
  section.** On getairwave.tv/docs:
  - **Sessions** and **Import / Export** now nest under **Settings** (alongside General and AI connections)
    instead of sitting at the top level. Their standalone sidebar icons were dropped to match the other
    Settings subpages, "Sessions (Now Playing)" is now just **Sessions**, and the **"Settings:"** title
    prefix was removed from General and AI connections.
  - **AI assistant** moved below the Settings grouping and expanded from a single page into its own
    **folder-with-overview** — a clickable landing plus five focused subpages: *Connections & keys*,
    *Exploring your library* (the read tools), *Building channels & packages* (the write tools), *Using the
    chat*, and *Assistant vs the lineup builder*. Each tool is broken down with what it does **for you**,
    grounded in the real `agent-tools.ts` inventory.
  - **Tinted sidebar icons for the "Using Airwave" sections**, matching the admin app's palette (Channels
    indigo, Sources sky, Packages violet, Bumpers amber, Users emerald, Settings rose, plus AI assistant
    purple); the Getting Started and How it works groups stay untinted.
  - **Sidebar folders now load collapsed** by default (dropped `defaultOpen` across every folder `meta.json`).
  - All internal links were updated for the moved pages (`/docs/sessions` → `/docs/settings/sessions`,
    `/docs/import-export` → `/docs/settings/import-export`).

## [0.9.85] - 2026-08-12

### Added

- **Platform-support matrix on `/docs/platforms`.** Swapped the plain markdown availability table for a
  checkmark-style `<PlatformMatrix>` component (registered globally in `apps/site/components/mdx.tsx`
  alongside `<Video>`, so it needs no per-page import), in the vein of native-sdk.dev's platform-support
  table. Three tiers with tinted status pills: **Full support** (green ✓) for Apple TV, iPad, LG webOS, and
  the browser player; **Supported** (amber ✓) for Android TV and Fire TV — they run, just a secondary
  priority; **Planned** (gray clock) for Samsung/Tizen and Roku. Each row also names the app type and
  playback engine (mpv vs. native `<video>` + hls.js). Kept the prose table's card/border styling but forced
  its margins off (`!my-0`) so the rows sit flush inside the bordered box.

## [0.9.84] - 2026-08-12

### Changed

- **Privacy Policy and Terms brought up to snuff** (modeled on the plezy / nostalgex / Bunny Ears policies,
  adapted to Airwave's fully self-hosted, zero-project-hosted-services reality). Privacy now has proper
  sections — the website, the self-hosted software (you are the data controller), what it connects to,
  on-device app data, no analytics/tracking, children (COPPA), retention, your rights (incl. VCDPA),
  security, and contact — with the accurate token wording (encrypted at rest, used server-side to broker
  playback) and a "GitHub is public" caution. Terms gains a **Governing law** section (Commonwealth of
  Virginia); both note Airwave is operated from Virginia, USA. (Still honest drafts — worth a lawyer's pass.)

## [0.9.83] - 2026-08-12

### Changed

- **Docs Introduction rewritten** with the flavor from the About page — the channel-surfing hook,
  server-first ("channels belong to your server, not a device"), and live-with-a-DVR — plus an accurate
  "how these docs are organized" map (the earlier scaffold placeholder said guides were "coming" that now
  exist). Links out to `/about` for the full story.
- **README now points to [getairwave.tv](https://www.getairwave.tv)** — a link block (Website · Docs ·
  Features · FAQ) under the title.

## [0.9.82] - 2026-08-12

### Changed

- **`apps/site` defaults to the dark theme.** The navy 10-foot brand is the intended first impression, so
  the site now leads with dark (`RootProvider theme={{ defaultTheme: "dark", enableSystem: false }}`). The
  theme toggle still works and persists per-visitor; we just no longer follow the OS preference by default.

## [0.9.81] - 2026-08-12

### Changed

- **`apps/site` gets the Airwave brand theme.** Kept fumadocs' `neutral` + `preset` as the base (verified
  identical to fumadocs.dev's own tokens), then layered the **10-foot product palette** on top — ported from
  `tv-web`/`tv-native` `src/lib/theme.ts`, not the admin app. Dark is the brand-defining look: deep-navy
  surfaces (`#060a14` bg, `#0b1120` cards/sidebar), near-white text, `#94a3b8` muted, and the signature
  sky-blue accent (`#4a9fe0`, ring `#3b82f6`); light keeps clean fumadocs surfaces with a deeper blue accent
  for contrast. Sidebar tuned via `#nd-sidebar`. All in one tunable `--color-fd-*` override block in
  `global.css` — the base stays untouched.

## [0.9.80] - 2026-08-12

### Added

- **`apps/site` blog** — a fumadocs-style blog: a `content/blog` collection (title/description + `author`/
  `date` frontmatter), a `/blog` index of post cards, and post pages with a gradient header, an
  `InlineTOC`, and fumadocs `prose`. Seeded with a first post, "Introducing Airwave."
- **About page rewritten** as a personal origin story (why Airwave exists — the channel-surfing itch, the
  server-first idea, live-with-a-DVR, the AI-assisted transparency).
- **FAQ page** is now accordion-based (fumadocs `Accordions`), grouped, and expanded with the questions
  people actually ask — Plex Pass, Jellyfin/Emby, "will Plex block it," "do I pick exactly what plays,"
  trial/sideload, privacy, and pricing.

### Changed

- **Site nav** leads with **Documentation**, keeps Features · Channel guide · FAQ top-level, and tucks the
  rest behind a native **Resources** dropdown (Blog · About · Contact · Platforms). Nav items are scoped
  `on: "nav"` so they no longer duplicate into the docs sidebar.
- **Docs sidebar switcher** — a fumadocs **Sidebar Tabs** dropdown (Documentation · Blog · FAQ · Home) with
  tinted colored icons + subtitles, for jumping between the main site areas from inside the docs.

## [0.9.79] - 2026-08-12

### Changed

- **`apps/site`: restored FAQ to the top nav** (Features · Channel guide · Docs · FAQ). About remains in the
  footer's Project column.

## [0.9.78] - 2026-08-12

### Added

- **`apps/site` marketing pages + a real landing.** Rebuilt the home page in the fumadocs-landing style
  (gradient hero + hero shot, a feature grid, a platforms strip, a three-step "how it works", an admin
  showcase, and a final CTA), and added a **sticky sitemap footer** across all `(home)` pages. New pages:
  **Features** (grouped feature showcase), **Channel guide** (the guide experience), **Contact** (GitHub +
  email), and **Privacy Policy** + **Terms of Service** (honest drafts — accurate to Airwave's self-hosted,
  no-telemetry reality; review before relying on them). Top nav is now Features · Channel guide · Docs. A
  small `components/marketing.tsx` kit (Container / ButtonLink / SectionHeading / LegalPage) keeps them
  consistent. All Tailwind v4 + fumadocs `fd-*` tokens — no new deps. `next build` green (68 static routes).

## [0.9.77] - 2026-08-12

### Fixed

- **`apps/site` Vercel deploy: scope the install to the site's own dependency subgraph.** Vercel installs
  the whole pnpm workspace, which fired `packages/db`'s `postinstall` (`prisma generate`) and failed on the
  missing `DATABASE_URL` — an env the static docs/marketing site has no business needing. Added
  `apps/site/vercel.json` pinning `installCommand: "pnpm install --filter site..."`, so only `site` + its
  deps (fumadocs, Next, React, `@airwave/config`) install and `packages/db`/`api`/`server` postinstalls never
  run. No runtime change; docs deploy only.

## [0.9.76] - 2026-08-12

### Added

- **Comprehensive documentation build-out — the docs site grows from 22 to 63 pages.** Each major subject
  now gets the folder-with-subpages treatment (an overview "meta" page plus focused deep-dives), authored by
  a fan-out of research agents that read the actual source (routers, services, admin routes, DB schema) plus
  the master plan, changelog, and session summaries — not guessed:
  - **Sources** → connecting · libraries · metadata-sync · connections · token-security · managing
  - **Packages** → creating · assigning-channels · styling · provenance · access · guide-lenses
  - **Users & access** → importing · access-model · enforcement · admin-lockout · granting
  - **Bumpers** *(new topic)* → interstitials · ambient-music · configuration · scheduling
  - **Background jobs** → catalog (all 15 scheduled jobs) · lifecycle · controls
  - **Workflows** → lineup-builder · importer · observability
  - **Capability diagnostic** → how-it-works · formats-tested (the full CAP_MATRIX) · device-overrides
  - **Settings** *(new)* → an admin-area map + general/AI-connections subpages, cross-linking (not
    duplicating) the sections that already have dedicated docs
  - **Self-hosting** *(new)* → docker · configuration (the full `.env` reference) · roles (`CG_ROLE`) ·
    updating — built from the real `docker-compose.yml`/`.env.example`/publish workflow
  - New top-level **Platforms** (the support matrix) and **Architecture** (the parts + data flow) pages.
- Sidebar polish: non-clickable separator headings (Getting Started / Using Airwave / How it works),
  Lucide icons on every high-level section, folders `defaultOpen`, and the old flat guide pages retired in
  favor of the folders. `next build` is green (63 static routes).

## [0.9.75] - 2026-08-12

### Added

- **`apps/site` docs: the `docs/` guides are now a live fumadocs documentation site at `/docs`.** All
  twelve guides were migrated into `content/docs` as MDX (frontmatter titles/descriptions, internal
  `.md` links rewritten to `/docs/*` routes, root-README links pointed at GitHub). The information
  architecture uses **non-clickable separator headings** (Getting Started · Using Airwave · How it
  works) with top-level pages, and **Channels is its own expanded folder-section** — the big channels
  guide is split into an overview index page plus `filters`, `ordering`, `strategies`, and `schedule`
  sub-pages (the folder-index pattern, `defaultOpen`). High-level pages get **Lucide sidebar icons**
  (via a `loader` icon resolver — Quick Start → Rocket, Channels → Tv, etc.); sub-pages stay icon-less.
  The nav wordmark is the **Airwave `Logo`** rebuilt from the admin app. **Media support** is wired for
  the screenshots/videos to come: markdown images render through fumadocs' `ImageZoom` (zoomable,
  auto-sized `next/image` via fumadocs-mdx), plus a styled `<Video>` MDX component; the existing
  screenshot set is copied into `public/screenshots/`. `next build` is green (22 static routes) and the
  docs sidebar, search, and a sample screenshot all render.

## [0.9.74] - 2026-08-12

### Changed

- **tv-native: the iOS (iPad) app is now iPad-only for App Store submission** (`ios.isTabletOnly: true` →
  `TARGETED_DEVICE_FAMILY = "2"`), so review doesn't flag a missing iPhone UI — the 10-foot / large-tablet
  layout is deliberately not a phone experience. This is safe for the Apple TV build: on a tvOS target
  (`EXPO_TV=1`) both Expo's own device-family setter (it forces family `"3"` whenever `TVOS_DEPLOYMENT_TARGET`
  is present) and `@react-native-tvos/config-tv` (which explicitly overwrites `TARGETED_DEVICE_FAMILY = "3"`)
  override it — so `isTabletOnly` only ever yields family `"2"` on the non-TV iPad build. First of the
  App-Store-submission prerequisites (Apple iPad + Apple TV first, then webOS — see `.docs/publishing.md`).

## [0.9.73] - 2026-08-11

### Changed

- **tv-native: the bumper music bed now plays on the ONE video engine (a single hybrid mpv core) instead of a
  second libmpv instance — the structural fix for the bumper→program 5.1 contention.** iOS/tvOS gives an app
  exactly one shared `AVAudioSession`/output, and the ambient-music core was a *second* libmpv engine
  fighting the video over it — dropping the program's 5.1 (dialogue) and stalling playback coming out of a
  bumper. Every session/config fix (v0.9.69, v0.9.72) failed because mpv's own audio output disturbs the
  shared session per-instance, below our code. The only real fix is one engine: during a bumper the (idle)
  video player now plays the music itself, sequentially — program (video+5.1) → bumper (audio-only music) →
  program — so there is only ever one audio output, nothing to contend. One libmpv build already plays both;
  the merge folds the audio-only capabilities (`fadeVolume`/`setLoop`/`setRate`/`append`, gapless options)
  into the view engine and adds a per-load **`mode`** ("video" | "audio"): an audio load suppresses
  cover-art-as-video and starts silent (JS fades it in); a video load resets the shared engine's persistent
  props (`loop-file`/`speed`/`volume`) so nothing an audio track set bleeds into the program. Wired all the
  way through `use-tv-player` (it now owns the bumper-music source + DVR-derived fade, absorbing the old
  `use-bumper-music` hook, which is removed). Also gated tvOS HDR display-criteria off audio loads so a bumper
  never bounces an HDR program HDR→SDR→HDR. **Bumper music OFF is byte-for-byte the proven prior path**
  (pause-and-hold, no second engine, no contention). Radio channels (future) reuse this same one engine.
  (iOS/tvOS + Android, in lockstep; Android had no `AVAudioSession` contention, so there it's pure
  feature-folding.) The `MpvAudioCore` second engine + its module `audio*` functions are now unused for
  bumpers (kept in-tree, minus the Settings→Audio route probe, until the hybrid is proven on device).

## [0.9.72] - 2026-08-11

### Fixed

- **tv-native: bumper music no longer breaks the video's 5.1 audio (or stalls it) at a bumper→program
  transition — the two mpv cores now claim audio the same way (plezy's model).** The app has ONE shared iOS
  `AVAudioSession` and one output, and the bumper-music core (a second libmpv instance) fought the video over
  it two ways: (1) it configured + **re-pinned** the session on its own setup AND teardown — poking it right
  as the video resumed after a bumper; and (2) it lacked the video's `audio-channels=auto`, so it claimed the
  shared output as **stereo** and the video couldn't reclaim 5.1. Fix, following plezy: configure the session
  **once at app launch** (module `OnCreate`, `.moviePlayback/.longFormAudio`); make the bumper-music core
  fully **session-passive** (it never touches `AVAudioSession`, so its start/teardown can't flip it out from
  under the video); and give it **`audio-channels=auto`** so both engines negotiate the shared output
  identically. Also fixes a fresh tune landing straight on a bumper (the session is already active from
  launch). The video core's session ownership and the Settings → Audio Stereo/Multichannel toggle are
  unchanged. (iOS/tvOS only.)

## [0.9.71] - 2026-08-11

### Fixed

- **tv-native: no more audio crackle when a bumper you seeked back into ends (Case A).** Now that the
  AVAudioSession conflict between the two mpv cores is fixed (v0.9.69), the compensating "play *before* seek"
  logic from v0.9.68 is no longer needed — and was itself the artifact: playing before the seek briefly
  resumed the program at its OLD (pre-bumper) position (an audible crackle) before the seek pulled it to the
  start. Reverted the same-media resume to the clean path — seek while paused (silent), then a single
  `play()` to resume (the same clean resume the Play button does). Case B (the reload path) is unaffected.

## [0.9.70] - 2026-08-11

### Changed

- **Changing a playback-only bumper setting no longer regenerates every channel's schedule.** The global
  bumper-config `update` bumped the reconcile `rev` on *every* save, so toggling ambient bumper music (or its
  volume/fades, the "Up Next" card style, etc.) fired `schedule-bumper-sync` to rebuild every channel's
  schedule from scratch — expensive, and it wiped whatever you were about to watch. Now the `rev` advances
  (and the sync job runs) **only when a structural setting changes** — the fields that actually shape the
  materialized timeline: bumper enable + the break durations
  (`interstitialSeconds`/`afterMovieSeconds`/`afterEpisodeSeconds`/`quickSeconds`/`shortEpisodeMinutes`). The
  music controls, card style, and legacy music key are playback-only (read by the client at play time) and
  now save without touching any schedule. (The music *library* router already didn't trigger rebuilds.)

### Fixed

- Pre-existing `tsc` error in `services/plex/token.ts` (`looksEncrypted` — a `string | undefined` from the
  `iv:tag` split) that had left the server `check-types` gate red; added the narrowing guard the regex
  already guarantees. No runtime change; the gate is green again.

## [0.9.69] - 2026-08-11

### Fixed

- **tv-native: the program no longer pauses ~250ms after a bumper (the confirmed root cause of the whole
  rollover saga).** With bumper music on, the ambient-music core is a SECOND libmpv instance, and iOS/tvOS
  gives an app exactly ONE shared `AVAudioSession`. The music core configured it as `.playback/.default`
  while the video core uses `.playback/.moviePlayback/.longFormAudio` — so when a program resumed after a
  bumper, the video core re-asserted its category at the first frame (~250ms), the audio route renegotiated,
  and mpv paused. Proven by disabling bumper music (no second core → no conflict → clean playback). Fix: both
  cores now agree on the **identical** session config, each **re-asserts it idempotently** (a configure call
  no-ops when the session is already correct), and each re-pins after its own audio unit spins up (mpv
  re-touches the shared session on AO init). So the session never flips between the two players and nothing
  renegotiates mid-playback. Completes the rollover fix with v0.9.66–68 (which made `play()` actually fire —
  that then revealed this second, deeper re-pause). The 5.1/7.1 multichannel path (v0.9.64) is unchanged —
  same config + re-assert, just gated to skip when already right. The two players stay fully separate; they
  just stop disagreeing about the one shared session. (iOS/tvOS only; Android uses `ao=audiotrack`, no
  `AVAudioSession`.)

## [0.9.68] - 2026-08-11

### Fixed

- **tv-native: the bumper→program rollover after seeking back now actually resumes (the real root cause).**
  Entering a bumper hard-pauses mpv, and on the same-media rollback into a program we were issuing `seek`
  to the *still-paused* mpv and *then* `play()` — and a seek on a paused mpv followed by `pause=no` does
  **not** resume (it leaves it paused on the seeked frame). That's why "same-media" Case A (seek back into
  the bumper, program stays loaded) showed the frame you left, and why it needed no manual pause to
  trigger — the bumper is what paused mpv. A normal in-program DVR seek works only because mpv is already
  *playing* when it seeks. Fix: on the same-media resume, **un-pause first, then seek** (putting mpv in the
  same known-good playing state a DVR seek is in), and `play()` again after the seek as belt-and-suspenders.
  Together with v0.9.67 (reload-path proactive un-pause) this covers both the same-media and reload
  rollbacks.

## [0.9.67] - 2026-08-11

### Fixed

- **tv-native: a program after a bumper no longer stays black/paused after you seek *backward* across the
  bumper.** Follow-up to v0.9.66 (which fixed the same-media case but not this one). Root cause was a
  structural asymmetry in the loader: the same-media resume path plays explicitly, but the **reload path
  had no direct `play()`** — it relied entirely on the `onLoad` event to un-pause. mpv's `pause` is
  persistent across `loadfile`, and a seek-back sequence (program → bumper → previous program → bumper →
  program) performs several consecutive loadfile-while-paused loads; if that final `onLoad`'s `play()`
  didn't stick, the freshly-loaded program sat paused on a black frame (the previous program had already
  been unloaded — hence black, not a stale frame). Natural forward flow only ever does a single
  bumper→program load, so it never hit the fragile timing. The reload path now clears mpv's pause
  **proactively** (a durable property, so ordering vs the loadfile doesn't matter), guarded by the
  user-pause flag, with `onLoad` + `onFirstFrame` as backstops. Also disarms the resume-stall watchdog on
  bumper entry so an intentionally-paused bumper can't be mistaken for a dead stream and poison the next
  program's pause state. Added an `[mpv] onLoad play? paused=…` log to pinpoint it if any case remains.

## [0.9.66] - 2026-08-11

### Fixed

- **tv-native: the bumper→program rollover no longer stalls or shows a stale frame after you seek back into
  a bumper.** The v0.9.61 fix aimed at the wrong layer: it cleared the last-loaded URL on bumper entry to
  force a reload, but rolling back into the program you paused for the bumper resolves to the **same URL**,
  and `setSource` with an unchanged URL is a no-op in **both** React state and the native view (its
  `pendingSource != lastLoadedSource` guard) — so no reload fired, mpv's persistent pause never lifted, and
  the program sat paused on the frame you left. Clearing the URL also disabled the direct-play fast path
  that previously worked, regressing direct playback. Now the player **keeps** the loaded URL so it detects
  "same media" and **resumes in place**: a direct file seeks to the new offset and plays; a transcode stream
  (already positioned by its offset-encoded URL) just plays, anchoring its clock off the next progress tick.
  A second, independent un-pause hook was added on `onFirstFrame` (first painted frame) as a backstop for
  the fresh-load path. Fixes both the "won't start playing" stall and the "stuck on the frame I seeked away
  from" stale frame.

## [0.9.65] - 2026-08-11

### Added

- **Settings → Audio: show what the audio output actually supports.** The Audio page now reads the current
  output route **live** (mpv-player's new `getAudioOutputInfo` — iOS `AVAudioSession.maximumOutputNumberOfChannels`
  + route name; Android `AudioManager` output devices) and shows the detected sink and its max channel count
  (e.g. "5.1 (6 ch)"). Read live, not cached like the codec diagnostic, because it changes when a
  soundbar/receiver is plugged in or switched — so you can confirm whether real surround is actually reaching
  the receiver in Multichannel mode (≥ 6 ch) or the route is only stereo. Software can't verify a sound
  physically leaves a speaker, but the route's reported capability is the honest, useful signal.

## [0.9.64] - 2026-08-10

### Fixed

- **tv-native: 5.1 audio plays correctly on Apple TV / Android TV — dialogue is no longer lost.** A 5.1
  (E-AC3, etc.) track direct-playing through mpv came out with the center channel — which carries the
  dialogue — missing, as if routed to speakers that aren't there, while the Plex app played the same file
  fine as LPCM 5.1. Cause: the video player never configured the shared AVAudioSession, so tvOS/iOS never
  negotiated a multichannel output route and mpv's 5.1 got mangled down. The player now puts the session
  into long-form video playback (`.playback` / `.moviePlayback` / `.longFormAudio`) and re-asserts it when
  mpv's audio unit spins up (mpv stomps the shared session on init), and mpv's `audio-channels` defaults to
  the full negotiated layout (`auto`) instead of the stereo-capped `auto-safe`. Real 5.1/7.1 LPCM now
  reaches a capable receiver/soundbar; a stereo route still folds down cleanly; stereo and transcoded
  tracks are unaffected.

### Added

- **Settings → Audio (tv-native): choose the audio output layout.** A new per-device setting —
  **Multichannel** (default: real 5.1/7.1 to a capable receiver/soundbar) or **Stereo** (always fold down,
  for plain TV speakers or a receiver that mishandles multichannel). Client-side only via mpv
  `audio-channels`, so it never forces a transcode; switching reloads the current program at the same spot.

## [0.9.63] - 2026-08-10

### Added

- **Create a viewer account from the admin.** A "New user" button (in the top-header portal, matching
  channels/packages) opens a new `/users/new` page to create a Viewer with an email, name, and
  password, via better-auth's admin-plugin `createUser` (`users.create`) — which hashes the password
  and creates the credential account properly (a raw insert can't do either). New users default to
  all-access; restrict them afterward on their access page. Previously accounts could only come from
  the env-seeded admin or Import Plex Users.
- **Delete a user.** The user detail page gains a danger-zone "Delete user" (with a confirm) →
  `users.delete` → better-auth's `removeUser` (cleans up their sessions + credential account; access
  grants cascade via Prisma). Refuses to delete an admin, so the sole owner can't remove themselves.

### Fixed

- **Viewers can now reach `/device` to approve a TV code.** The admin-only lockout was bouncing every
  non-admin — including a viewer following their TV's device-login link — to `/not-authorized`.
  `/device` is now reachable by any authenticated user; everything else stays admin-only. Added a
  general `?redirect=` return-path (local paths only, `lib/safe-redirect`) threaded through
  `/login` → `/post-login`, so a viewer who has to sign in mid-flow lands back on `/device` instead of
  the admins-only notice.

### Security

- **Public email/password sign-up is now disabled** (`emailAndPassword.disableSignUp: true`).
  Previously `POST /api/auth/sign-up/email` was reachable — and not subject to CORS, since it isn't a
  browser request — so anyone could self-provision a Viewer account (which defaults to all-access).
  Accounts are now admin-created only. The admin-create path is unaffected (a separate admin-only pathway).

### Internal

- The tRPC context now also exposes the request `headers`, so a procedure can call better-auth server
  APIs that authenticate the caller via the session cookie (used by `users.create` / `users.delete`).

## [0.9.62] - 2026-08-10

### Added

- **`EXTRA_CORS_ORIGINS` — allow the admin panel at more than one origin.** A comma-separated list of
  extra admin origins, added to both the cookie-CORS allowlist and better-auth `trustedOrigins`
  alongside `CORS_ORIGIN`. Use it when the admin is reachable at more than one address — e.g.
  `WEB_PUBLIC_URL`/`CORS_ORIGIN` is a public HTTPS domain but you also open the admin over the LAN by
  IP: `EXTRA_CORS_ORIGINS=http://192.168.1.10:36021`. Without it, loading the admin from a
  non-`CORS_ORIGIN` address failed its cross-origin `/api/auth` calls (`No 'Access-Control-Allow-Origin'
  header is present`). The auth cookie is already `SameSite=None; Secure` on an HTTPS server, so a
  LAN-IP origin works once allow-listed — note that's a genuine cross-site request, so it relies on
  third-party cookies (the clean long-term path is to reach the admin at its own domain).

### Deploy

- New optional env var, wired through `docker-compose.yml` (`EXTRA_CORS_ORIGINS: ${EXTRA_CORS_ORIGINS:-}`)
  and documented in `.env.example`. Empty by default = no change.

## [0.9.61] - 2026-08-10

### Fixed

- **tv-native: a channel no longer stalls at the end of a bumper after you seek back into it.** Rolling
  into the next program after a bumper you'd seeked or tracked back into would load the program's first
  frame but leave it paused. Entering a bumper hard-pauses the mpv video (and mpv's `pause` persists
  across `loadfile`); the un-pause at the bumper→program rollover only fired on a real source change
  (`onLoad` → `play()`). But seeking back into a bumper left `currentUrlRef` pointing at the program
  that *follows* it, so the rollover resolved to the same URL, `setSource` no-op'd, `onLoad` never
  fired, and the persisted pause stuck (non-direct / transcoded channels). `goTo` now clears
  `currentUrlRef` on bumper entry, so every bumper→program rollover takes the fresh-load path and plays.
  The within-program DVR-seek fast path is unaffected. Natural forward playback was never affected.

## [0.9.60] - 2026-08-10

### Fixed

- **tv-web login now uses the same two-column QR layout as the native app.** The device-code / Plex
  login "pending" view stacked the heading, instruction, QR, and code in a tall single column; it now
  matches tv-native — heading + instruction + Back on the left, a vertical divider, and the
  white-framed QR + code on the right — which fits the 10-foot 16:9 aspect (wide, height-constrained)
  far better.

## [0.9.59] - 2026-08-09

### Added

- **Brand wordmark assets + a generator** (`apps/tv-native/scripts/gen-wordmark.py`, Pillow +
  ffmpeg). Renders the logo mark + "Airwave" in white to match tv-web's `Logo` component (Inter Bold,
  fontSize = 0.66 × mark width, gap = 0.16 × mark width, letter-spacing −0.01em) on the same dark
  radial gradient as the app icons: an **inline** (row) wordmark, a **stacked** (column) wordmark, and
  an animated **splash** (GIF + animated WebP) reproducing the login flourish — the mark fades/scales
  in, then the letters cascade — using the component's exact `cubic-bezier(0.22, 1, 0.36, 1)` easing.
  Inter Bold (OFL) is vendored at `assets/fonts/Inter-Bold.ttf`. Assets land in `assets/brand/`.

### Changed

- **Apple TV top-shelf images now use the inline wordmark** (mark + "Airwave") instead of the mark
  alone, since tvOS shows no app name on the top shelf. Regenerated
  `tv-topshelf{,-2x,-wide,-wide-2x}.png` (takes effect on the next EAS build).
- **README** now leads with the animated Airwave splash above the title.

## [0.9.58] - 2026-08-09

### Release

- Cuts a deployable release of the Plex owner-token encryption-at-rest work (v0.9.56 encrypt-at-rest
  + v0.9.57 shared-crypto consolidation). No functional change since v0.9.57 — this is the tag that
  builds the image and ships that work to self-hosted instances.

## [0.9.57] - 2026-08-09

### Changed

- **Consolidated secret encryption into one shared module.** The AI provider-key encryption now uses
  the same `services/crypto.ts` that the Plex owner-token encryption uses (introduced in v0.9.56),
  and the duplicate `services/agent/crypto.ts` is removed. Pure refactor — identical AES-256-GCM
  scheme keyed off `BETTER_AUTH_SECRET`, so existing encrypted AI keys and Plex tokens keep
  decrypting unchanged. No behavior change.

## [0.9.56] - 2026-08-09

### Security — encrypt the Plex owner token at rest

The Plex owner token (`MediaSource.token`) — used server-side to talk to Plex and to sign the
image/playback URLs handed to clients — is now stored **encrypted** (AES-256-GCM keyed off
`BETTER_AUTH_SECRET`, the same scheme the AI provider keys already use) instead of plaintext.
Defense-in-depth: a dumped or leaked database no longer exposes the token.

### What ships

- **Encrypt on write** — `plex.saveConnection` encrypts the token before persisting it.
- **Decrypt only at server-side use** — the token is decrypted where a loaded source makes a Plex
  call: the playback broker (direct-play/transcode + the `/img` proxy), schedule resolution (channel
  create/backfill/refresh, the AI-lineup and import workflows, the admin preview), metadata sync,
  user import, field-value discovery, the token-check + connection-refresh jobs, and session
  teardown. Clients never receive the bare token, so nothing client-side changes.
- **Automatic one-time backfill** — on first boot after upgrading, any token still stored as
  plaintext is encrypted in place (idempotent; also runnable via `scripts/encrypt-source-tokens.ts`).
  Decryption tolerates legacy plaintext, so nothing breaks in the window before the backfill runs.
- New `services/crypto.ts` + `services/plex/token.ts` (encrypt / tolerant decrypt / row helper /
  backfill), with unit tests.

### Notes

- **No schema migration** (the existing `token` column holds the longer ciphertext) and **no client
  changes**.
- Depends on a **stable `BETTER_AUTH_SECRET`** (already true — it also keys auth and the AI keys); if
  rotated, re-connect the Plex source.
- One-way after upgrade: once tokens are encrypted, a pre-encryption build can't read them — re-connect
  Plex if you ever roll back.

## [0.9.55] - 2026-08-09

### Fixed

- **Build fix: sync the lockfile to the rebranded react-native-tvos patch.** The v0.9.54 rebrand also renamed the
  comment labels inside `patches/react-native-tvos@0.83.6-0.patch` (`[ChannelGuide patch]` → `[Airwave patch]`),
  which changes the patch content-hash — but that edit happened AFTER the `pnpm install`, so the committed
  lockfile kept the old `patch_hash`, and `pnpm install --frozen-lockfile` failed on both EAS and the Docker
  build (`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`). Regenerated the lockfile so its `patch_hash` for
  `react-native-tvos@0.83.6-0` matches the (kept, rebranded) patch; `--frozen-lockfile` now passes. Patch-hash
  propagation only — no dependency versions changed, no functional change.

## [0.9.54] - 2026-08-09

### Changed — rebrand ChannelGuide → Airwave

- **Package scope** `@ChannelGuide/*` → `@airwave/*` across the monorepo (467 refs / 205 files: imports, every
  workspace `package.json` name, tsconfig path aliases, components.json, CSS source globs, Dockerfile,
  entrypoint) + `pnpm install` relink. Also fixed the server bundler's `tsdown` `noExternal` regex (it was
  `/@ChannelGuide\//` — an escaped-slash the sweep missed — which would have externalized the workspace packages
  and broken the prod `dist/index.mjs`).
- **App identity (tv-native):** `expo.name` → "Airwave", `slug` → `airwave` (new EAS project), `scheme` →
  `airwave` (+ matching `authClient` scheme), iOS `bundleIdentifier` + Android `package` → **`com.airwave.tv`**,
  and the new EAS `projectId`. Removed the now-redundant `with-android-app-name` config plugin and the iOS
  `CFBundleDisplayName` override (both existed only to force "Airwave" over the old name — `expo.name` now does
  it). webOS `appinfo.json` `id` → `com.airwave.tv`, `vendor` → Airwave.
- **GHCR image** `ghcr.io/quixomatic/channelguide` → `ghcr.io/quixomatic/airwave` (workflow, compose defaults,
  `.env.example`).
- **User-facing strings + docs** (login/settings/setup copy, README, compose/Dockerfile headers) → Airwave.
- **Deliberately left unchanged** (identity/data — renaming would break the running deployment): the Postgres
  DB/user/volumes/compose project name (`channelguide*`), the Plex client identifier (`channelguide-server`), the
  better-auth device `client_id` (`channelguide-tv`), and the native module Gradle groups
  (`com.channelguide.{keyinput,mpvplayer}` — internal Maven coords).

### Deploy / build notes

- **Self-host:** the next tag publishes to `ghcr.io/quixomatic/airwave` — the new GHCR package is **private on
  first push; flip it public once** (Packages → airwave → visibility). Update `CG_IMAGE` to the airwave image.
  DB/volume names are unchanged, so existing data is preserved.
- **Apps:** `com.airwave.tv` + the new EAS project is a **new app identity** — the next build re-provisions
  (Apple App ID + profiles, EAS credentials, webOS reinstall); existing dev/TestFlight installs won't update.

## [0.9.53] - 2026-08-08

### Fixed

- **tv-native diagnostic per-test animation now matches tv-web exactly.** v0.9.52 used Reanimated's
  `SlideInRight`/`SlideOutLeft`, which slide the block the *entire screen width* with no fade — way too much
  motion. Replaced with a custom transition mirroring tv-web's framer-motion: a subtle **56px** horizontal
  slide **plus an opacity fade** (enter from x:+56 faded → x:0; exit to x:−56 faded), 260ms ease-out on both
  in and out (matching framer-motion applying the same `transition` to exit). The block is absolutely positioned
  in its row so the outgoing and incoming tests **crossfade** cleanly instead of shoving the layout. (One
  intentional difference: tv-web's `AnimatePresence mode="wait"` sequences out-then-in; this crossfades, since
  Reanimated has no clean wait-mode — the overlap avoids an empty gap and reads the same.)

## [0.9.52] - 2026-08-08

### Changed

- **tv-native diagnostic: presentation brought back in line with tv-web (no functionality change).** The
  capability-check screen had accumulated debug visuals during the iPad/Apple TV bring-up — the clip URL, a
  "last error" line, a grid of every test as green/red chips, and a tap-to-inspect panel. Those are removed, and
  the screen now mirrors tv-web: a single **per-test block that slides in from the right / out to the left**
  (Reanimated `SlideInRight`/`SlideOutLeft`, keyed on the test) showing the human-readable diagnostic sentence
  **plus** its capability chips (now pills), a title that switches **"Setting up your TV" → "Setup complete"**
  with a subtitle, a spring ✓ on the frame when done, and a **Continue** button with the white focus halo
  (mirroring tv-web's outline; the key-layer already routes OK/select to it). The little corner activity spinner
  is kept (tv-native mounts the player fresh per clip, so it needs the working cue that tv-web's continuous
  video provides). The actual capability run — clip playback, decode measurement, audio verdict, per-device
  results — is untouched. tv-native ships in the next device build.

## [0.9.51] - 2026-08-07

### Fixed

- **Bumper: pausing the channel now pauses the ambient music and the countdown donut (tv-web + tv-native).**
  When a bumper was on screen and you paused, the countdown ring kept draining and the music kept playing (the
  channel itself paused fine, and resuming re-synced correctly). The player *does* freeze the bumper clock on
  pause, but two consumers ran their own clocks and weren't told: the donut (`bumper-card`) runs a smooth local
  wall-clock whose reconcile only fires when `remaining` changes — frozen while paused, so it kept ticking — and
  `use-bumper-music` took no paused state, so the `<audio>` / `mpvAudio` bed only stopped on teardown. Both now
  receive `status.paused`: the bed pauses/resumes with the channel (and the fade freezes), and the donut pins its
  local clock while paused. Covers the full-screen and mini/docked bumper on both apps. (tv-native ships in the
  next device build.)

## [0.9.50] - 2026-08-07

### Changed

- **Channel ordering: the "Release date" sort is relabeled "Release / air date."** No behavior change — it maps
  to Plex `originallyAvailableAt`, which for a movie is its release date and for an episode is that episode's
  original air date (TV channels resolve and sort at the episode level). The old label read movie-centric; this
  matches how the filter builder already names the field, so a TV channel "sorted by air date" is clearly this one.

## [0.9.49] - 2026-08-07

### Changed

- **Channel strategies — round-robin now recycles an exhausted group so rotation stays even to the end of a
  pass.** Previously, once a show used up its episodes within a pass it dropped out and the longest-lasting show
  dominated the tail (pronounced with duration blocks, where the show that plays *more per turn* empties first —
  e.g. Bluey at 4/turn runs out before Blue's Clues at 1/turn even with more episodes). Now a group that runs
  out **resets its cursor and loops its own list** to keep its rotation slot; the pass ends cleanly once **every**
  group has aired its full list at least once (tracked per group), so it terminates on the slowest group with no
  risk of an endless build. **Marathons (`run: "all"`) are exempt** — they play once and drop out. Deterministic
  and cursor-resumable (fixed a resume-staleness guard that assumed a pass equals the pool size — a recycled pass
  is longer). 2 new tests (recycling keeps a fast show present to the tail + replays it in order; marathon plays
  once); 18 engine tests total.

## [0.9.48] - 2026-08-07

### Fixed

- **Channel strategies — duration blocks no longer overshoot the window ceiling.** A `run: { minutes: [lo, hi] }`
  block was filling *until it reached* the floor, so a 22-min show in a 24–30 window grabbed a 2nd episode
  (44 min, over the ceiling). Now it adds items only while they still fit under `hi`, stopping once inside the
  window — so a 22-min show is one item, 7-min episodes pack to ~4. The **first** item always airs even if it's
  longer than the window (a 45-min episode in a 15–30 window still plays once). Covered by two new engine tests.

### Changed

- **The channel "Advanced — grouping & rotation" section auto-expands when the channel already has a strategy**
  (instead of always starting collapsed), so an existing strategy isn't hidden. New/basic channels still start
  collapsed.

## [0.9.47] - 2026-08-04

### Added

- **Channel Strategies — Phase 4b: the admin visual editor (feature-complete).** A new **"Advanced — grouping &
  rotation"** collapsible section on the channel **new + edit** pages (`features/channels/strategy-editor.tsx`),
  collapsed by default so a basic channel stays simple. A master on/off switch (off = today's behavior); when
  on: **Rotation** (Marathon each group / Rotate between groups) + **Order** (Varied / Fixed cycle); an
  add/remove **grouping-rule list** — each rule picks a **scope** (Each show / Movies / Filtered set) and a
  **run** (one at a time / block of N–M / ~N–M minutes / whole run), with an optional per-rule **filter** that
  reuses the existing channel `FilterBuilder` (evaluated locally); a **"don't repeat a show"** control (off /
  within N minutes / within N shows); and a plain-English preview per rule. Threaded through `ChannelFormValues`
  and both routes (`channels.create`/`update`). Purely additive — nothing else on the form changes, and a
  channel with the strategy off schedules exactly as before. Strategy changes apply on the next schedule build
  (Generate). **This completes the Channel Strategies core arc** (§7.6 Arc 3); AI/preset wiring stays deferred.

## [0.9.46] - 2026-08-04

### Added

- **Channel Strategies — Phase 4b (API): `strategy` is now settable through the channels router.** `channels.create`
  and `channels.update` accept an optional `strategy` (validated by a Zod mirror of `ChannelStrategy` — rotation,
  rotationOrder, grouping rules with scope/run/filter, and `noRepeatWithin`); `channels.get` returns it. Update
  treats `undefined` as "leave as-is" and `null` as "clear" (`Prisma.DbNull`). This makes strategies fully
  settable/persistable end-to-end (API, and via import/export) ahead of the visual editor. Bolt-on: omitted =
  unchanged, and a channel with no strategy is byte-for-byte today's behavior.

## [0.9.45] - 2026-08-04

### Changed

- **Channel Strategies — Phase 4a: grouping filters now use the real channel filter grammar, evaluated
  locally.** A grouping rule's optional `filter` is now the same recursive `FilterNode` tree (`group` with
  and/or + `{ field, op, value }` conditions) the channel-content builder produces — so the admin can reuse that
  builder per grouping. Unlike the content filter (resolved against Plex to BUILD the pool), a grouping filter
  narrows the ALREADY-resolved pool, so it's evaluated **locally** against cached metadata with no network
  (`services/schedule/local-filter.ts` → `matchesLocalFilter`). Supports the subset of fields our `GuideMeta`
  holds (title/genre/director/actor/studio/contentRating/resolution/year/decade/ratings/duration/hdr/dovi/
  releaseDate); a field we don't cache doesn't claim the item (`LOCAL_FILTER_FIELDS` — the builder will restrict
  to these). Replaces the interim lightweight `StrategyFilter`. +5 tests. Deterministic (time-relative fields
  intentionally unsupported).

## [0.9.44] - 2026-08-04

### Added

- **Channel Strategies — Phase 3: Tier-2 `noRepeatWithin` constraints.** A strategy can now declare
  `constraints: { noRepeatWithin: { minutes?, count? } }` — never air the same show (group) again within that
  window. Implemented as a **starvation scheduler** (`constrainedPassOrder`): each turn picks the group aired
  longest ago among those clear of the window, never the immediately-previous group; if a tiny pool makes the
  window impossible it **relaxes deterministically** rather than stalling or dropping items, so every item is
  still laid exactly once. To hold the constraint across a **windowed build seam / pass boundary**, the
  `ScheduleCursor` gained a `recent` history field (new `Channel.scheduleRecent` JSON column, migration
  `add_schedule_recent`) — the trailing emitted items are carried forward as the next pass's seed and threaded
  through `buildSchedule` + `cursorData`/`cursorOf`. Fully deterministic; the non-constrained path is untouched
  (history is null unless a constraint is set). 3 new tests incl. **resume across a pass boundary === one
  uncapped build** (10 `bun:test` cases total).

## [0.9.43] - 2026-08-04

### Added

- **Channel Strategies — Phase 2: `collection` scope + per-rule `filter`.** A grouping rule can now carry an
  optional `filter` (`titleContains` / `type` / `genre` / `studio` / `yearMin`–`yearMax` / `showTitle` /
  `showRatingKey`) matched against LOCAL item metadata (no Plex query, AND over provided fields), so a rule only
  claims the items it matches — first-matching-rule-wins, so a filtered carve-out listed first takes precedence.
  New **`scope: collection`** groups the whole filter-matched set as ONE group — the "Star Wars films in release
  order as a single marathon" case: `{ scope: "collection", run: "all", filter: { titleContains: "Star Wars" } }`.
  (A collection is defined *by* its filter here, not by Plex collection-membership metadata, which the pool
  doesn't carry.) +1 test covering the carve-out (contiguous, in base order, precedence over a later movie rule).

## [0.9.42] - 2026-08-04

### Added

- **Channel Strategies (§7.6 Arc 3) — Phase 1: the engine core.** An OPTIONAL, bolt-on grouping/rotation layer
  over a channel's base `ordering`. A new nullable `Channel.strategy` JSON column (migration
  `add_channel_strategy`); `null` = today's behavior byte-for-byte. `services/schedule/timeline.ts` gains
  `parseStrategy` (defensive — bad config safely falls back to base ordering) + `strategyPassOrder`, which
  buckets the base-ordered pool into groups and assembles a pass by either **`clustered`** (marathon each group
  in turn) or **`round_robin`** (rotate a run of items per group). The base ordering still governs order *within*
  each group and how groups are sorted — so `in_order` **continues a show across its blocks** instead of
  restarting. Each grouping rule is `{ scope, run, filter? }`: **scope** `show` (by grandparent) or `movie`
  self-scope by metadata (no filter needed); **run** is a fixed count, a seeded count range `[2,3]`, `"all"`, or
  a **length-aware duration range `{ minutes: [25,55] }`** (sums real item durations, so 7-min Bluey → more
  episodes per block than a 45-min drama — no per-show classification). `round_robin` **never repeats a show
  back-to-back** across a lap seam (`rotationOrder: shuffle` swaps deterministically, `cycle` rotates). Wired
  through `buildSchedule` (opts) + `generate`/`extend`/`repair`. Fully deterministic and **resumes on the
  existing `{passSeed, passIndex, pos}` cursor with no new fields** (the seam rule is enforced within a pass).
  6 `bun:test` cases incl. **windowed-build + resume === one uncapped build**. `collection` scope, the optional
  per-rule `filter`, cross-pass Tier-2 constraints, and the admin UI land in later phases.

## [0.9.41] - 2026-08-03

### Added

- **mpv audio: gapless `append` for track-to-track handoff (tv-native).** Added `mpvAudio.append(url, startTime?)`
  — queues a track after the current one via mpv's playlist (`loadfile … append`), which auto-advances with no
  gap. Paired with a new `prefetch-playlist=yes` option (mpv opens the next queued entry *before* the current
  ends, so the handoff is truly gapless even over the network) on top of the existing `gapless-audio=weak`.
  This is the track-to-track primitive for future radio channels — the decision (James) is **gapless append,
  not a true crossfade**: a radio orchestrator will `load` the current track at its DVR offset and `append` the
  next as playback nears the boundary, all on the single audio core (no second instance). Native on both
  platforms + JS API + types. **Needs a native tv-native build** to run.

## [0.9.40] - 2026-08-03

### Added

- **mpv audio: error + buffering events and mute/rate control (tv-native).** The headless audio core now
  surfaces what a "complete" player should — instead of failing silently. Added `mpvAudio.onError` (mpv
  end-file reason = error → `{ message }`), `mpvAudio.onBuffering` (observes `paused-for-cache` → `{ buffering }`,
  true on a network stall / false on resume), plus `mpvAudio.setMuted(bool)` (mpv `mute`) and
  `mpvAudio.setRate(n)` (mpv `speed`). Wired natively on both platforms (iOS `MpvAudioCore`/`MpvPlayerModule`,
  Android `MpvAudioCore`/`MpvPlayerModule`) and through the JS API + types. These are radio-facing (a network
  stream wants a stall spinner + bad-stream errors); the bumper bed needs no change. **Needs a native
  tv-native build** to run — validated with the rest of the audio arc on device.

## [0.9.39] - 2026-08-02

### Added

- **mpv audio: `load(url, startTime)` — open a track AT an offset (tv-native).** The headless audio core's
  `load` now takes an optional `startTime` and issues `loadfile … start=<t>`, so mpv opens the file at that
  position via a fast byte-range seek (not play-from-0-then-seek) — the foundation for DVR tune-in *mid-track*
  on future radio channels. Native on both platforms + threaded through the module + `mpvAudio.load(url, t?)`.
  The bumper bed passes no offset (unchanged). Needs a native tv-native build.

## [0.9.38] - 2026-08-02

### Added

- **Native volume fade in the mpv audio core — buttery ramps + a crossfade primitive (tv-native).** Added
  `mpvAudio.fadeVolume(target, durationMs)` — a **native 60fps ramp** of mpv's `volume` (a cancellable
  `DispatchSource` timer on iOS / coroutine loop on Android), so a fade is smooth with a **single bridge
  call** instead of per-frame chatter. The bumper-music hook now drives this instead of a JS interval: each
  ~500ms player tick hands the native side one `fadeVolume` (only when the target changes), and it interpolates
  at 60fps — steady full-volume middle sends nothing, a fade is ~2 calls/sec, a scrub snaps in 250ms. Same
  primitive will power radio-channel crossfades later. Needs a native tv-native build.

## [0.9.37] - 2026-08-02

### Added

- **Bumper ambient music — Phase 2 (tv-native): wired to `mpvAudio` (tv-native).** The bumper bed now plays on
  the native apps via the headless `mpvAudio` core (§7.14 Phase B) — same DVR-derived model as tv-web
  (deterministic track by hashed bumper key; position + volume from the bumper's `elapsed`, so it seeks + fades
  with scrubbing). The player exposes `bumperElapsed`/`bumperTotal`/`bumperKey` (additive — video path
  untouched), a `use-bumper-music` hook drives `mpvAudio` from the persistent host (plays full-screen AND
  docked), and the countdown donut now drains against the real `bumperTotal` (join/scrub fix, matching tv-web).
  Native-specific: volume is pushed on a ~60ms interval with change-detection (not 60fps) to spare the RN
  bridge. **Needs a native tv-native build** (which compiles the v0.9.36 audio core) to run.

## [0.9.36] - 2026-08-02

### Added

- **mpv headless audio — Phase 1: the native capability (tv-native).** A surface-less, audio-only mpv path
  added to `@ChannelGuide/mpv-player`, for the bumper music bed (§7.14 Phase B) and future audio-only "radio"
  channels — **one media stack** (chosen over expo-audio / track-player / theoplayer after the refs showed
  plezy runs exactly this and streamyfin's track-player is null on TV). It's a **separate, compartmentalized
  piece**, independent of the video `<MpvPlayerView>`: a distinct headless core (`MpvAudioCore.swift` /
  `MpvAudioCore.kt`, ported from plezy — `vid=no` / `audio-display=no` / `force-window=no`, no `wid`/surface)
  driven by module-level, view-less functions. New JS API `mpvAudio` (`load` / `play` / `pause` / `stop` /
  `seek` / `setVolume 0..1` / `setLoop` + `onProgress` / `onEnded`), backed by a second, independent libmpv
  instance created lazily on first `load`. The video path is 100% untouched. **Needs a native tv-native build
  to validate** (load / volume / seek / loop / stop on iPad, Apple TV, Android — Apple TV being the one to
  prove). Phase 2 = port the bumper-music hook onto `mpvAudio`; radio channels reuse it later.

## [0.9.35] - 2026-07-31

### Changed

- **Bumper music fades are now buttery (tv-web).** The fade in/out was driven off the player's 500ms tick, so
  it stepped in ~2–3 jumps. Added a `requestAnimationFrame` loop that interpolates the bumper's elapsed time
  between ticks and drives the volume at 60fps, so fades ramp smoothly. Position stays tick-driven (seeking
  the audio every frame would stutter); only the volume is smoothed.

## [0.9.34] - 2026-07-31

### Fixed

- **Bumper countdown donut now drains against the bumper's TRUE length (tv-web).** It used to infer the total
  from the largest `remaining` it had seen, so joining or scrubbing into the middle of a bumper made the ring
  treat a partial amount as "full" and drain too fast. It now uses the player's real `bumperTotal`, so at 10s
  left in a 30s bumper the ring correctly shows ⅔ drained, however you got there.

### Changed

- **Bumper ambient music also plays in the docked mini feed (tv-web).** The `useBumperMusic` hook moved from
  the full-screen chrome onto the persistent player host, so the bed plays during a bumper whether the channel
  is full-screen or docked as the mini feed in the guide (one instance, no double-play). Same DVR-derived
  behavior (deterministic track, seek + fade with the timeline).

## [0.9.33] - 2026-07-31

### Added

- **Bumper ambient music — Phase B (tv-web): it plays, and it's DVR-correct (web).** During a bumper the web
  player plays a soft music bed from the library — fades in as the "Up Next" card appears, loops if the track
  is shorter than the break, and fades out to land as the next program starts (§7.14). Crucially it's **derived
  from the bumper's position on the DVR timeline, not an independent timer**: the track is chosen
  **deterministically** by hashing a stable bumper key (so the same bumper always gets the same track), and its
  **playback position + volume are a function of the elapsed time within the bumper** — so if you **scrub back
  into/through a bumper, the music seeks and re-fades right along with it**. A new `useBumperMusic` hook (its
  own `<audio>`, independent of the video), scoped to the full-screen player (the docked mini-feed bumper stays
  silent while you browse); the player now exposes `bumperElapsed` / `bumperTotal` / `bumperKey`. Backend:
  `GET /api/v1/bumper-music` returns the music settings (enabled/volume/fades) + the enabled track pool in one
  call, and `/bumper-music/<file>` gets a `Cache-Control` header so each track downloads once per device and
  replays from disk (deterministic *selection* over stable per-track URLs — fully cacheable). **Server restart
  needed.** tv-native playback lands next.

## [0.9.32] - 2026-07-31

### Changed

- **Self-host: fix the bumper-music container path, make only the host side configurable (docker).** Refined
  v0.9.31 — the container mount path `/data/bumper-music` is now **fixed** (`BUMPER_MUSIC_DIR` hardcoded in the
  server env, not a knob), and the only thing you choose is the **host** side of the mount via a new
  **`BUMPER_MUSIC_VOLUME`** var: `- ${BUMPER_MUSIC_VOLUME:-channelguide_bumpermusic}:/data/bumper-music`. Unset
  → the named volume; set it to a bind path (your dataset) to drop files in directly. Documented in
  `.env.example`. Removes the footgun of two coupled path knobs.

## [0.9.31] - 2026-07-31

### Fixed

- **Self-host: persist the bumper-music library across image updates (docker).** The bumper-music feature
  (v0.9.28) writes uploads to a folder in the `server` container that had no volume, so tracks would be lost on
  every recreate/update. Added a persistent **`channelguide_bumpermusic` volume** → `/data/bumper-music` in
  `docker-compose.yml` (with a commented bind-mount option for dropping files in directly), the
  **`BUMPER_MUSIC_DIR`** env, and an entrypoint step that creates the dir + `chown`s it to PUID/PGID so the app
  user can write to it. Documented in `.env.example`. ⚠️ Applying this needs a **`docker compose up -d`** (a
  Watchtower auto-recreate reuses the old spec and won't pick up the new volume/env).

## [0.9.30] - 2026-07-31

### Changed

- **Bumpers page: moved the "Coming later" note below the music library (web).** So the flow reads
  Enable → Break lengths → Ambient music → Music library → Coming later.

## [0.9.29] - 2026-07-31

### Added

- **Rename bumper-music tracks from the admin UI (web).** Each track in the music library now has an inline
  edit (pencil) on its title — click to rename (Enter/blur saves, Esc cancels), so a hashy filename like
  `234345634563456.mp3` can become "Track 1". Wires the existing `bumperMusic.rename` mutation into the list.

## [0.9.28] - 2026-07-31

### Added

- **Bumper ambient music — Phase A: the admin/self-host backend (web/server).** Groundwork for a Pluto-style
  soft music bed under the "Up Next" interstitial (§7.14). A **managed track library**: upload mp3 / m4a / aac
  through the bumpers admin page (or drop files into a mounted volume and run the **Scan bumper music** job),
  toggle each track on/off, delete, with per-track "found/uploaded" + "missing" indicators and inline preview.
  Global controls on the bumpers page — **ambient music on/off, volume, fade in/out** (in `BumperConfig`). The
  files live in **`BUMPER_MUSIC_DIR`** (env, defaults to `./bumper-music`; self-host mounts a volume there) and
  are **streamed** to clients over `GET /bumper-music/<file>` (public, range-served) with the enabled-track
  list behind viewer auth at `GET /api/v1/bumper-music` — nothing lives on the TV apps. Backend: `BumperMusic`
  model (migration `add_bumper_music`); `services/bumper-music/` (store + library); multipart upload endpoint
  `POST /api/admin/bumper-music` (admin-only); `bumperMusic` tRPC (list/setEnabled/rename/remove/scan). The
  deprecated single-track `interstitialMusicKey` is superseded by the library. **Phase B (playing it in the TV
  bumpers — fade in, loop, fade out) lands later, as its own arc.** Server restart needed.

## [0.9.27] - 2026-07-31

### Fixed

- **Not-authorized page: the Airwave logo is now centered (web).** At `markWidth=150` the mark + "Airwave"
  wordmark lockup (~570px) overflowed the `max-w-md` (448px) container, so it looked off-center. Sized the
  logo to `80` (fits comfortably) and switched the container to a `flex flex-col items-center` column (matching
  the login page) so everything centers cleanly.

## [0.9.26] - 2026-07-31

### Added

- **Admin panel is now admins-only — non-admins can't sign into the admin UI (web).** Following better-auth's
  documented pattern (the admin plugin has no built-in sign-in block; the recommendation is a server-side
  session role check + server-side authorization): the `_auth` guard now reads the **server-issued** `user.role`
  (DB-backed, from a `getSession` round-trip — not client-forgeable) and bounces any non-admin to a new
  **`/not-authorized`** page (branded, with a Sign out button). Login + post-login redirect admins to the guide
  and everyone else to that notice. Regular users can still sign into the **TV apps** normally — this only gates
  the admin panel. Defense-in-depth: every admin data call was already an `adminProcedure` (server-enforced 403),
  so non-admins never had access to anything here; this just makes the door explicit instead of a broken shell.

## [0.9.25] - 2026-07-31

### Changed

- **User overview page redesign (web).** The `users/:id` overview now leads with a proper profile hero — a big
  avatar (their image, or emerald-tinted initials) next to their name + email, with role and access-status
  chips — over a tidy details grid (Role / Joined / User ID) and a restyled Access card (icon tile + summary +
  Manage button). Same Frame, much nicer.

## [0.9.24] - 2026-07-31

### Added

- **User access control — Phase 3: polish (web).** The Users list now shows each restricted user's scope at a
  glance — **"N of M channels"** (M = total enabled channels), or "All access" — and the access editor's header
  reads **"N of M channels selected"** while you're picking. `users.list` resolves the accessible enabled count
  per restricted user (admins + all-access users skip the query). Rounds out the access-control arc
  (config → enforcement → polish).

## [0.9.23] - 2026-07-31

### Added

- **User access control — Phase 2: enforcement (server).** The access config from Phase 1 now actually gates
  what viewers see and play on the TV apps (tv-web / tv-native). Approach (§7.13): the viewer REST API
  (`apps/server/src/rest.ts`) resolves each request's access set **once** in a middleware (`accessibleChannels`
  → `"all"` for admins + all-access users, else the exact channel ids, stashed on the context); a **path-scoped
  middleware** on `/channels/:id/*` 403s any per-channel route (timeline / now / **media** / stop) for a channel
  the viewer can't access — so a deep-link or raw bearer call can't stream it; the collection reads
  (`/channels`, `/packages`, `/guide`, `/favorites`, `/recents`) **filter at the data layer** (the access set is
  threaded into `listGuideChannels` / `listActivePackages` / `getGuideGrid`, and favorites/recents are
  intersected — hidden, not deleted); and the routes that carry a channel id in the request **body**
  (`/sessions/heartbeat`, `POST /favorites`, `/playback/log`) guard inline. Admin tRPC is unchanged (admins
  bypass). A restricted package the viewer can't see drops out of the sidebar entirely.
  - **Server restart** needed to pick up the new middleware.

## [0.9.22] - 2026-07-31

### Fixed

- **User overview "Manage access" button rendered the icon above the text (web).** It used `<Button asChild>`
  wrapping a `<Link>`, but the Base UI `Button` primitive doesn't support Slot/`asChild`, so the button's
  `inline-flex` layout never reached the link. Switched to a native `Button` with `useNavigate`.

## [0.9.21] - 2026-07-31

### Added

- **User access control — Phase 1: configuration (admin UI). No enforcement yet.** Groundwork for Plex-style
  per-user sharing (§7.13). You can now open a user and configure what packages/channels they're allowed —
  three levels: **all access** (default for new users; everything incl. future content), **full package
  access** (all current + future channels in a package), and **partial** (specific channels). The admin
  **Users** page is now a list → **`users/:id`** (overview with an access summary) → **`users/:id/access`**
  (a grid editor reusing the import-preview tiles: a master "all access" switch, package + per-channel
  toggles, sticky Save + "Reset to all access"). Mode is derived on save — a package with all its channels
  selected becomes FULL (includes future channels), some → PARTIAL, none → no grant; ungrouped channels are
  per-channel grants. Backend: `User.allAccess` + `UserPackageAccess` (FULL/PARTIAL) + `UserChannelAccess`
  (migration `add_user_access`); `services/access/` (`getUserAccess` / `setUserAccess` / `accessibleChannels`);
  `users.get` / `users.getAccess` / `users.setAccess`.
  - **Not enforced yet:** this only stores the config — viewers still see everything until Phase 2 wires the
    `accessibleChannels` resolver into the viewer REST surface (guide reads + the `/media` playback gate).
  - **Requires a server restart** to pick up the regenerated Prisma client (`allAccess` and the new tables).

## [0.9.20] - 2026-07-31

### Fixed

- **Workflows failed to start in production with `start-invalid-workflow-function` (server).** Prod runs the
  compiled `dist/index.mjs` (via `bun run dist/index.mjs`), not `src` through Bun's bunfig preload — so the
  Workflow SDK's **client transform** (which attaches each workflow's `workflowId`) never ran, and every
  `start(workflow)` threw in prod. It worked in dev only because dev loads the source through the preload
  (`workflow-plugin.ts`). Fixed by applying the same `@workflow/swc-plugin` client transform at **bundle
  time** via a `tsdown.config.ts` plugin, so the compiled bundle carries the `workflowId` (verified: both
  `aiLineupWorkflow` and `importLineupWorkflow` now get their ids baked in). This affected **both** the new
  lineup import and the AI-lineup workflow in production — the import was just the first workflow actually
  invoked on a self-hosted box.

## [0.9.19] - 2026-07-30

### Added

- **Lineup import execution — the durable import workflow + observability (web/server).** The staging
  **Import** button now actually runs: a WDK workflow (`importLineupWorkflow`) recreates the selected
  packages + channels on this instance — plan (dedupe + number preserve/probe + library remap) → create
  packages (reuse by key) → build each channel (create + PREDICATE defs + a windowed initial schedule so
  it's watchable immediately) → report. Mirrors the AI-lineup workflow machinery minus the AI.
  - **🔑 Dry-run mode** — a toggle beside the Import button. Runs end-to-end for real (validates, resolves
    every channel's filter against Plex for true pool sizes, computes reassigned numbers, writes trace
    rows for live progress) but **writes nothing** — no packages, channels, or schedules. The way to
    validate a deployed build (e.g. on TrueNAS) and preview the real outcome before committing.
  - **Observability** — a new **Workflows → Lineup Import** run page (`/settings/workflows/import/:runId`):
    a multi-tier progress view (overall progress bar + packages tier over a per-channel tier) that
    live-polls while the run is in flight, showing each channel's outcome (created / disabled / skipped /
    failed), resolved pool size, schedule slots, and renumbering, plus a step timeline. Backed by a new
    `ImportTrace` model (migration `add_import_trace`).
  - **Idempotent + retry-safe** — re-importing the same lineup is a no-op (duplicates skipped by content
    signature), and a retried channel build recognizes an already-created channel instead of colliding.
  - **Requires a server restart** to load the new workflow engine registration + regenerated Prisma client
    + rebuilt workflow bundle (`bun --hot` doesn't reload workflow bundles) — on dev and after each deploy.

## [0.9.18] - 2026-07-30

### Added

- **Import dedupe — re-importing an identical lineup is now a no-op (web).** The import brains and the
  staging screen now recognize channels that already exist here by a **content signature** — name + package
  + ordering/sort + the canonicalized filter, deliberately NOT the channel number (identical content is the
  same channel even if the number differs). In the staging screen a duplicate channel is badged **"already
  imported"**, its toggle is **disabled** (can't be selected — it'd be skipped anyway), it's excluded from
  the default selection and from a package's select-all, and the header counts how many are already imported.
  An edited channel (same name, tweaked filter) is NOT a duplicate — it imports as new.
- **Import brains (the reusable, workflow-agnostic core) — `services/transfer/import.ts`.** `planImport`
  builds the deterministic import plan (package reuse-by-key, channel dedupe, number preserve-or-probe-upward
  reserving in-memory across the run, and library remap by title); `executePackagePlan` /
  `executeChannelPlan` do the actual create — both **dry-run aware**: in dry-run they resolve each channel's
  filter against Plex for a true pool size and write nothing (no package/channel/schedule created). A real
  run creates the channel + its PREDICATE definitions and lays a windowed initial schedule so it's watchable
  immediately. This is the shared logic the durable import workflow (next) orchestrates.

## [0.9.17] - 2026-07-30

### Added

- **Import lineup — upload + staging pick-and-choose (web), the second stage of lineup transfer.** Settings →
  Import / Export takes an uploaded lineup file → **`/settings/transfer/import-preview`**, a read-only staging
  screen (writes nothing): each package is a tile in a grid with a **package-level toggle + per-channel
  toggles**, so you choose exactly what to import. A ⚠ **hover-card** (coss `PreviewCard`) flags per-channel
  caveats — collection/playlist/manual filters dropped, would-import-disabled, number-in-use → reassigned,
  unmatched library → searches all. A **sticky** main-Frame header carries the summary + the "Import N
  channels" action. Gated on a connected + synced source. Backend: `transfer.importPreview` (read-only) +
  `services/transfer/import.ts`. The actual import execution (durable workflow) is the next stage — the button
  is present but not yet wired. **Server restart needed** for the new query.

## [0.9.16] - 2026-07-30

### Added

- **Export lineup — first half of lineup transfer between instances (web).** A new **Settings → Import /
  Export** tab with a working **Export**: downloads every package + channel (with their filters) as a single
  portable JSON (`airwave-lineup-<date>.json`), omitting everything instance-specific (media-source binding,
  schedules, cached metadata — all rebuilt on import). Channel→package links travel by the package `key`; a
  definition's Plex library travels by its title. Backend: `transfer.export` query + `services/transfer/export.ts`.
  Import (upload → staging pick-and-choose → durable WDK workflow) lands next. **Server restart needed** to
  expose the new query.

## [0.9.15] - 2026-07-30

### Added

- **Airwave browser-tab favicons for the admin (web) and the web player (tv-web).** Generated `favicon.ico`
  (16/32/48), `favicon-32x32.png`, and `apple-touch-icon.png` (180×180) — the Airwave mark on the same dark
  radial gradient as the native app icons — via a new reproducible `scripts/gen-favicons.py` (mirrors
  `apps/tv-native/scripts/gen-app-icons.py`). Wired into both apps' `index.html`. The admin browser tab title
  is now **"Airwave"** (was "ChannelGuide").

## [0.9.14] - 2026-07-30

### Added

- **Airwave logo in the admin — About page + animated on login (web).** Ported tv-web's `<Logo>` (the
  cloud+wave mark + optional "Airwave" wordmark) into `apps/web`, made theme-aware (the wordmark uses
  `currentColor` instead of the TV app's hardcoded white). It shows as a static lockup in the About page's
  Frame header (left-aligned with the title/description) and as an **animated** entrance above the login card
  (the mark fades + scales in, then the wordmark letters cascade). Added `framer-motion` to the admin and the
  `logo.png` asset to `apps/web/public`.

## [0.9.13] - 2026-07-30

### Changed

- **Sessions: use the shared `EmptyState` component for both empty views (web).** The Active-sessions and
  Recent-play-logs empty states now render the reusable `EmptyState` (tinted icon disc + title + description),
  matching Channels / Packages / Sources / Users, instead of one-off centered text. Frontend-only.

## [0.9.12] - 2026-07-30

### Changed

- **Sessions: pixel-perfect tile alignment (CSS subgrid) + scrollable play logs (web).** Active-session tiles
  now use CSS **subgrid** — the tile grid defines shared rows and each tile spans them with
  `grid-template-rows: subgrid`, so every tile's sections (media / progress / device / streams / viewer) snap
  to the same row lines and line up across neighboring tiles regardless of content length (the tile
  overrides the inherited subgrid row-gap to 0 so the muted stream-detail sections stay flush). The **Recent
  sessions & play logs** list is capped (`max-h-[32rem]`) and scrolls instead of growing unbounded.
  Frontend-only.

## [0.9.11] - 2026-07-30

### Fixed

- **Sessions tiles were different heights — missing values now render "Unknown" consistently (web).** Empty
  chip values (Connection / Video / Audio) rendered as a short `—` text span while populated tiles showed
  full-height badges, so tiles varied in height. Missing chip values now render a muted **"Unknown" badge**
  (same height as a real one) and the Device text falls back to "Unknown", so every row keeps a consistent
  height across tiles. Frontend-only.

## [0.9.10] - 2026-07-30

### Changed

- **Sessions tiles: subtle background on the stream-detail sections (web).** The device/connection and
  video/audio/subtitles sections now sit on a faint muted background, grouping them apart from the media
  header and the viewer footer. Frontend-only.

## [0.9.9] - 2026-07-30

### Changed

- **Sessions page tile polish (web).** Tiles now show the **portrait poster** of the show (for episodes, via
  the grandparent `showRatingKey`) or the movie — the same art the channel-edit preview uses — instead of the
  landscape episode still (both the active tiles and the recent-log thumbnails; the poster key is resolved
  server-side). The **program progress bar spans the full tile width** as its own band between the media
  header and the device info, and the **channel line sits below** the media header rather than beside the art.
  (API server restart needed — `packages/api` services changed.)

## [0.9.8] - 2026-07-30

### Added

- **New Settings → Sessions page — a Plex-style "Now Playing" for ChannelGuide (web).** A new `/settings/sessions`
  tab with two sections, built on the Frame component pattern:
  - **Active sessions** — a fixed-width tile per live viewer (wraps Plex-style, not full-width), sectioned:
    cover art + title + SxEy/episode + **program progress bar** + Live/−behind + channel; the **device** +
    **connection** (local/remote/relay); per-stream **Video** and **Audio** delivery (Direct Play vs Transcode
    + codec); Subtitles; and who's watching. Auto-refreshes every 5s (same cadence as the guide's session chip).
  - **Recent sessions & play logs** — the last 40 tunes across all devices with the delivery decision,
    connection, decoded resolution, an **outcome** badge (Playing / No-frames / Error) + error text, viewer,
    device, and relative time.
  - Backend: enriched `playback.sessions` (joins the current schedule slot for progress + episode metadata,
    the latest matching play-log for the delivery/transcode detail, and the device) and a new
    `playback.recentLogs` query. Artwork shows at its **natural aspect ratio** via the `/img` proxy (a new
    raw/no-resize mode on `channelImg` so posters aren't square-cropped). **No schema change.**

### Fixed

- **tv-native now reports how far behind live it is (`delaySeconds` + `positionAt`) in its heartbeat.** The
  native heartbeat only sent channel / state / ratingKey / title, so the server defaulted `delaySeconds` to 0
  — every iPad / Apple TV / Android session read as **"Live" at 0:00** in the Sessions view (and cross-device
  resume had no position to seed). It now computes both from the effectiveTime clock, matching tv-web's
  `use-channel-player`. So the Sessions tiles show real Live/−behind + program progress for native clients.
  Pure JS — hot-reloads.

### Note

- The API server must restart to expose the new `playback.recentLogs` query (a `packages/api` change).

## [0.9.7] - 2026-07-30

### Changed

- **Admin home is now the Guide — `/` redirects to `/guide` (web).** The placeholder Dashboard at `/` is
  retired (unused for now); visiting the root — and the post-login landing — now go straight to the Guide.
  `_auth/index` is a `beforeLoad` redirect to `/guide`, and both the post-login redirector and the
  already-signed-in `/login` guard point at `/guide` directly (no double hop). The sidebar already had no
  Dashboard link, so nothing else in the nav changes.

## [0.9.6] - 2026-07-28

### Fixed

- **Settings → User now shows the signed-in account on tv-native (name / email / role / avatar).** The page
  read `authClient().useSession()`, but tv-native's better-auth client never sent a bearer token, so
  `/api/auth/get-session` came back with no session and the page showed "?" / "Signed in" / "—". Wired the
  native `authClient` to send the same bearer token the `/api/v1` REST client already uses (the better-auth
  session token minted by the Plex device-link login, stored in `lib/auth`) via `fetchOptions.auth` —
  mirroring tv-web's client config. Now `useSession()` resolves the account and the User page shows the real
  details. Pure JS — hot-reloads. (Confirmed on device.)

## [0.9.5] - 2026-07-28

### Fixed

- **Settings: reaching the first option scrolls the pane to the top so the header above it is visible
  (tv-native).** After the v0.9.4 snap-scroll, D-padding all the way up landed on the top-most focusable
  option (e.g. Device → "Run capability diagnostic") but left the non-focusable content above it (the page
  title + the device-info card) scrolled off-screen, with no way to reveal it. Now selecting the first option
  scrolls the content pane fully to the top. Wired via a new `SettingsCtx.scrollToTop`, fired from
  `useSettingsPage` when the selection is at index 0 (it runs after the row's own snap-scroll, so it wins for
  the top row). Pure JS — hot-reloads.

## [0.9.4] - 2026-07-28

### Fixed

- **Settings pages snap-scroll the D-pad selection into view, and the Device page's "Recent playback issues"
  are now reachable by remote (tv-native).** Like the guide grid and the guide sidebar, the settings content
  pane now keeps the focused row on screen: when a D-pad-focused `SettingRow` would fall outside the shell's
  ScrollView it snaps into view (no animation, "only when off-screen"), measured via `measureLayout` against
  the scroll content (rows are nested in sections/columns, so a plain `onLayout` Y isn't content-relative).
  Wired through `SettingsCtx.ensureVisible`, so every settings page (Device / Server / User / General) gets it.
  On the **Device** page the codec toggles could overflow the screen with no way to scroll, and the "Recent
  playback issues" list had no focusable rows at all — so it was unreachable by remote. Each recent issue is
  now an (informational) D-pad focus stop: you can scroll down to see them and they snap into view; OK does
  nothing on them. Pure JS — hot-reloads. _(Known/deferred: the codec grid's column-major D-pad flow still
  "zig-zags" from the bottom of column 1 to the top of column 2 — true 2D up/down/left/right nav is a separate
  change for later.)_

## [0.9.3] - 2026-07-28

### Fixed

- **Guide sidebar: the lens/package list now snap-scrolls to keep the D-pad selection in view (tv-native).**
  When a server has enough packages that the sidebar's filter circles overflow the screen, D-padding down
  moved the focus ring onto circles below the fold but never scrolled the list — so the selected circle went
  off-screen. The lens `ScrollView` now mirrors the guide grid's "scroll only when off-screen" behavior: when
  the selected filter circle would fall outside the viewport it snaps into view (no animation) — to the top
  edge if it's above, the bottom edge if below — and leaves the list put when the circle is already visible,
  so moving down travels through the visible circles and only scrolls at the edges (exactly like moving up/down
  through programs in the guide). Each circle's position is measured via a forwarded `onLayout` on
  `GlassCircleButton` (the action circles above the divider aren't scrolled). Driven by selection + focus, so
  it's a no-op on touch (native scroll handles it). Pure JS — hot-reloads.

## [0.9.2] - 2026-07-28

### Reverted

- **Revert the global Android `mediacodec_embed` VO back to `gpu-next` (tv-native).** v0.9.1 swapped the
  Android mpv VO to `mediacodec_embed` (for HDR passthrough) but did it **globally** — forcing every Android
  program (SDR included) off mpv's own renderer. That's not what we want: mpv stays the god renderer for SDR,
  and the HDR path should engage only for HDR content. Reverted to the known-good `gpu-next` default (HDR
  tone-maps to SDR as before — acceptable-but-not-final). The correct approach — **dynamic, per-program** HDR
  detection done entirely in the Android-native `MpvCore.kt` (read `video-params/gamma` on load → switch to
  `mediacodec_embed` only for HDR programs, exactly like the Apple side reads gamma to switch the display),
  with **zero shared-JS changes** so the proven iPad / Apple TV builds stay untouched — is fully specified as
  the next arc in the tv-native plan (§13.5) and deliberately deferred. Android is parked in the known-good
  state; no behavior change from the last Android build on the Streamer.

## [0.9.1] - 2026-07-28

### Changed

- **Android HDR (Path A experiment): switch the Android mpv VO to `mediacodec_embed` (tv-native).** v0.8.75's
  HDR attempt (`vo=gpu-next` + `target-colorspace-hint`) played HDR as **low-frame-rate SDR** on the Google TV
  Streamer — because mpv's OpenGL-ES Android VO (gpu-next) **fundamentally cannot do HDR passthrough; it always
  tone-maps HDR→SDR** (confirmed by findroid #645, mpv-android #874, and libplacebo's author), and that
  per-frame tone-map is what tanked the frame rate. So v0.8.75's "gpu-next is the whole HDR story" premise was
  wrong. This swaps the Android VO to **`mediacodec_embed`**, which lets MediaCodec render decoded frames
  **directly to the SurfaceView** — Google's official HDR-video path (the same one ExoPlayer uses) — so
  HDR10/HLG pass through to the panel with no GPU tone-map (frame rate should recover). Also set
  `hwdec=mediacodec` (the direct/zero-copy decoder `mediacodec_embed` requires; the `-copy` variant reads
  frames back to the CPU and can't feed it). Trade-off: mpv gives up its own renderer on Android (no gpu-next
  scaling / OSD / subtitle rendering / panscan) — acceptable here since subtitles are server-burned and we
  direct-play. Android-only; the Apple/JS side is untouched, and it's a one-line revert back to `gpu-next`.
  **Native → needs an EAS Android build to validate on the Streamer** (HDR lights + frame rate recovers + DVR /
  surface-lifecycle / bumper-rollover still work); if it regresses SDR or doesn't light HDR, revert. The full
  analysis + the ExoPlayer alternative (Path C: ExoPlayer for HDR-only on Android) are documented in the
  tv-native plan (§13).

## [0.9.0] - 2026-07-28

Version-line bump to **0.9.x** — the tv-native clients (iPad, Apple TV, Android/Android TV) and webOS are all
shipping and branded as Airwave. No functional change; patch bumps continue from here.

## [0.8.75] - 2026-07-28

### Fixed / Added

- **Android mpv: surface-lifecycle hardening (fixes DVR/no-video) + HDR via gpu-next (tv-native).** Two
  Android-mpv-only changes in `packages/mpv-player/android/MpvCore.kt` — the Apple/Swift core + JS contract are
  untouched. Grounded in the two canonical mpv-Android references (cloned to `.refs/mpv-android` +
  `.refs/findroid`, which uses our exact `dev.jdtech.mpv` AAR); NOT plezy (its Android HDR is on ExoPlayer).
  - **Step 1 — surface lifecycle (the real unblocker).** mpv's VO holds a raw pointer to the Android surface;
    our old teardown just called `detachSurface()`, so when the surface was destroyed/reconfigured with the VO
    still active, the next reconfig hit a dangling pointer → "Missing surface pointer" → no video. Because the
    DVR tune-in seeks to the live offset on load, that reconfig fired immediately → **DVR never activated**.
    Adopted mpv-android/findroid's exact order: **disable the VO (`vo=null`) + `force-window=no` BEFORE
    `detachSurface`**, and re-attach + restore the VO on `surfaceCreated`. The detach runs synchronously
    (`runBlocking`, on the main-thread `surfaceDestroyed`) because the surface is freed the instant that
    callback returns — async would reintroduce the race.
  - **Step 2 — HDR.** Switched the VO `gpu` → **`gpu-next`** (the entire Android-mpv HDR story per both
    references) + `target-colorspace-hint=yes` to force the display into HDR + pass metadata through on an HDR
    panel (the analogue of the Apple `AVDisplayManager` switch); tone-maps to SDR otherwise.
  - **Native → needs an EAS Android build to compile + validate on the Streamer.** HDR passthrough on Android
    mpv is a known-imperfect area (findroid #645), so step 2 may need on-device iteration; step 1 is the solid
    fix that makes DVR + all content play.

## [0.8.74] - 2026-07-28

### Fixed

- **Android app now displays as "Airwave" (tv-native).** The v0.8.67 rename set the display label for
  iOS/tvOS (`CFBundleDisplayName`) and webOS (appinfo title) but missed Android, where the launcher label
  resolves to `android:label="@string/app_name"` = `expo.name` ("ChannelGuide"). Added a small config plugin
  (`plugins/with-android-app-name.js`, `withStringsXml`) that overrides the `app_name` string to "Airwave" —
  keeping `expo.name` and every namespace (`android.package` = com.channelguide.tv) unchanged, mirroring the
  iOS override. Native/config change → applies on the next Android build (the just-installed v0.8.72 APK still
  shows "ChannelGuide").

## [0.8.73] - 2026-07-28

### Added

- **Airwave app icons for Android + Android TV (tv-native).** Extended `scripts/gen-app-icons.py` to also emit
  the Android assets from the same Airwave mark on the dark radial gradient: an **adaptive icon** (transparent
  `android-adaptive-fg.png` logo kept inside the launcher's safe zone + `android-adaptive-bg.png` gradient
  background, wired into `android.adaptiveIcon.foregroundImage`/`backgroundImage`), and the **Android TV
  leanback** assets — `android-tv-banner.png` (320×180 home-screen banner) + `android-tv-icon.png` (512×512
  launcher icon) via the config-tv plugin's `androidTVBanner`/`androidTVIcon`. Now Android/Android TV match the
  iPad/Apple TV/webOS icons. Native/config change → applies on the next Android build (the just-installed
  v0.8.72 APK predates it).

## [0.8.72] - 2026-07-28

### Fixed

- **Android EAS builds failed on the `brew install` pre-install hook — guard it to macOS (tv-native).** The
  `eas-build-pre-install` hook (added v0.8.57 to install cmake/ninja for the iOS/tvOS from-source-Hermes
  builds) ran `brew install cmake ninja` on *every* platform. The Android build worker is Linux and has no
  `brew` → `brew: not found` → build fails (the last Android APK, v0.8.15, predated the hook, so it only
  surfaced now). Guarded the hook with `if command -v brew …` so it runs only where brew exists (the macOS
  iOS/tvOS workers, which need cmake for from-source Hermes) and no-ops on the Linux Android worker (Android
  doesn't build Hermes from source). Unblocks `preview-androidtv`.

## [0.8.71] - 2026-07-28

### Fixed

- **Android now fills the whole screen — removed the overscan inset (tv-native).** The app root padded the
  entire UI (background + video + content) by a legacy ~5% Android-TV "overscan margin" (48/27dp), which on the
  Google TV Streamer + a modern TV (no overscan) was pure wasted border. Per Android's own TV layout guide,
  modern TVs don't crop the picture and the background should NOT be clipped to a safe area; Expo SDK 55 already
  draws edge-to-edge on Android (no system bars on Android TV). So the fix is simply to drop the inset: the
  root is full-bleed on every platform. Apple TV / iPad had zero overscan padding already, so they're
  unchanged. Removed the now-dead `OVERSCAN_H`/`OVERSCAN_V`. Pure JS — hot-reloads.

## [0.8.70] - 2026-07-28

### Fixed

- **Sidebar focus ring no longer clipped on the lens circles (tv-native).** The D-pad focus ring is drawn
  ~4px outside each circle; the filter/lens circles live in a `ScrollView`, which clips its content to its
  frame — so the ring was cut off on the left (every lens) and the top (the first, "All"). Fixed at the actual
  clipper: the lens `ScrollView` now extends its frame outward (`marginLeft`/`marginTop: -RING_ROOM`) and pads
  the content back by the same amount, giving the rings room inside the clip while every circle stays
  pixel-identical. The ring itself (`glass-button.tsx`) is untouched — looks exactly as before, just no longer
  cut. (The action circles above the divider aren't scrolled and already cleared, so they needed nothing.) This
  removes a tv-web Chromium-108 port artifact that RN doesn't share. Pure JS — hot-reloads.

## [0.8.69] - 2026-07-28

### Fixed

- **Apple TV: Back exits the app at the guide root (tvOS root-exit, the analogue of tv-web's platformBack).**
  Before, the Menu/Back key was always captured for in-app back, so at the guide root (nothing playing) Back
  did nothing instead of leaving the app. Now the guide reactively toggles the tvOS Menu key: it's disabled
  (so the OS backgrounds the app to the Home screen on Back) only when the guide is the focused screen AND at
  its resting root (`zone === "grid"` and `player.layout === "off"`); any in-app back state re-enables it —
  the rail/sidebar zone, a docked or full-screen player, or a pushed Settings screen (guide blurs). So the full
  flow is: full chrome → Back → mini → Back → close mini → Back → **exit to the Apple TV home screen**. New
  `setBackExitsApp()` in the input dispatcher (`disableTVMenuKey`/`enableTVMenuKey`), driven by a focus-gated
  effect in `aurora-grid.tsx`. No-op on iPad/Android (no tvOS Menu key). Pure JS — hot-reloads on the tvOS dev
  client; needs a `preview-tvos` rebuild to land in the release build.

## [0.8.68] - 2026-07-28

### Added

- **Real Airwave launcher icon ("logo card") for the webOS TV app (tv-web).** `public/icon.png` was a blank
  211-byte placeholder; replaced it with the Airwave cloud+wave mark on the same dark blue-navy radial gradient
  as the native icons (opaque), at the webOS launcher size **80×80**, plus a **130×130** `largeIcon` wired into
  `appinfo.json`. Now the C2 launcher shows a proper Airwave card, matching the iPad/Apple TV icons. Packaged
  a ready-to-install `.ipk` via `ares-package dist --no-minify` (`apps/tv-web/build-ipk/com.channelguide.tv_0.8.68_all.ipk`);
  install with `ares-install --device tv <ipk>` once the C2's wifi is back on. (`.ipk`/`dist` are gitignored
  build artifacts.)

## [0.8.67] - 2026-07-28

### Changed

- **The installed apps now display as "Airwave" (tv-native + tv-web).** The in-app branding was already
  Airwave (`APP_NAME`), but the OS-level app label still read "ChannelGuide". Fixed the user-visible name
  everywhere it shows, without touching any namespace (bundle id `com.channelguide.tv`, Expo `name`/`slug`,
  webOS `id` all unchanged):
  - **iPad + Apple TV** — `ios.infoPlist.CFBundleDisplayName: "Airwave"` (Expo's `ios` config covers tvOS),
    so the home-screen label under the icon reads "Airwave". Kept `expo.name` as "ChannelGuide" so the Xcode
    project/target name is stable (the mpv plugin finds the app target by product type, but no reason to churn
    the project name). **Needs a rebuild** to apply.
  - **webOS / Tizen (tv-web)** — `appinfo.json` `title` → "Airwave" (the launcher label used by
    `ares-install`), and the web player's browser-tab `<title>` → "Airwave". `vendor` left as "ChannelGuide"
    (publisher metadata, not the app label — change later if wanted). Applies on the next TV package / web build.

## [0.8.66] - 2026-07-28

### Added

- **Real Airwave app icons — the logo mark on a dark radial gradient (tv-native).** Generated the app icons
  from the Airwave cloud+wave mark centered on a dark blue-navy radial gradient (matches the app's `#060a14`
  background), reproducibly via `apps/tv-native/scripts/gen-app-icons.py` (Pillow + numpy) into
  `assets/icons/`: a 1024×1024 opaque square for **iPad/iOS** (`expo.icon`), and the full **Apple TV** brand
  asset set at the exact sizes `@react-native-tvos/config-tv` requires (icon 400×240/800×480, App Store icon
  **1280×768**, top shelf 1920×720/3840×1440, top shelf wide 2320×720/4640×1440) wired via the plugin's
  `appleTVImages`. All opaque RGB (no alpha → App-Store-safe). **Native/config change → needs a rebuild** to
  appear (icons bake at prebuild, not over Metro): rebuild `development` (iPad dev client), `preview` (iPad),
  and `preview-tvos` (Apple TV). Android icons (adaptive + TV banner) not done yet — separate follow-up.

## [0.8.65] - 2026-07-28

### Added

- **Off-network Plex connection probe in tv-native — the local→remote→relay pick that makes away-from-home
  playback work (parity with tv-web).** The native app streams DIRECTLY from Plex, so away from home it needs
  the server's remote/relay URL, not the LAN one. Ported tv-web's `lib/plex-connection.ts` faithfully:
  `src/lib/plex-connection.ts` fetches `/api/v1/connections` and probes each base's `/identity` (4s timeout)
  local→remote→relay, remembering the first reachable one; the api client stamps it onto `/media` as
  `?network=` (only when remote/relay — local is the server default), and the server maps it to the source's
  stored URL (`broker.ts`, refreshed hourly by `plex-connection-refresh`). RN specifics vs the web version:
  AsyncStorage-backed with a `hydrateNetwork()` at launch (so `getNetwork()` stays synchronous for the api
  client), and a plain `fetch` reachability probe (no `no-cors`; ATS already allows arbitrary loads). Wired at
  launch in `_layout.tsx` (after session hydrate, guarded on an existing session) and after both login paths
  (`login.tsx`). **Settings → Server** now shows Media connection (select to re-probe) + Force connection
  (Auto → Remote → Relay, for testing the off-network path from the LAN) + the connection mode, matching
  tv-web. This unblocks the road-trip use case (server reachable off-network via Cloudflare HTTPS).

## [0.8.64] - 2026-07-28

### Added

- **iPad/iOS release EAS profile (`preview`) with the from-source-Hermes stack (tv-native).** The v0.8.63
  `preview-tvos` release build launches + plays on a physical Apple TV. Set up the plain `preview` profile
  (release, no dev client) for **iPad/iOS** with the same from-source env as `preview-tvos` **minus `EXPO_TV`**
  (`RCT_BUILD_HERMES_FROM_SOURCE=true`, `EXPO_USE_PRECOMPILED_MODULES=0`, `RCT_HERMES_V1_ENABLED=1`,
  `REACT_NATIVE_NODE_MODULES_DIR`). Release iOS needs the from-source Hermes for the same reason tvOS did
  (`buildReactNativeFromSource` + release → the jsi split); the v0.8.63 tvOS copy-path fix is tvOS-only but
  harmless to iOS. Run `eas build --profile preview --platform ios` to get the first non-dev-client iPad build.

## [0.8.63] - 2026-07-28

### Fixed

- **THE real cause of the tvOS release link wall: the from-source Apple TV Hermes framework was copied to the
  wrong folder, so the app linked an empty one (tv-native).** After six builds chasing symbol *export* (visibility,
  `-all_load`, `SHARED_JSI`), the actual bug was a **path mismatch in the react-native-tvos fork**, found by
  diffing the Xcode-inline builder (`build-hermes-xcode.sh`) against the CI builder (`build-apple-framework.sh`):
  the flags are **identical** (same `--target hermesvm`, same `HERMES_BUILD_SHARED_JSI=false`), so the framework
  content was never the problem. But `build-hermes-xcode.sh`'s `get_platform_copy_destination` has no case for
  `appletvos` — it falls through to **`ios`**, copying the real Apple TV framework to
  `destroot/Library/Frameworks/ios/`. Meanwhile `hermes-engine.podspec` vendors tvOS from
  `destroot/Library/Frameworks/tvos/` — which only ever held the empty **dummy** (and `create-dummy-hermes-xcframework.sh`
  didn't even create a `tvos` dummy). So on Apple TV the app linked an empty framework → **every** hermes + jsi
  symbol undefined (`makeHermesRuntime`, `makeHermesRootAPI`, `HostObject`, `NopCrashManager`, …), frozen at 61
  no matter what we did to visibility. **Fix (two one-line patches to the react-native-tvos patch):** (1)
  `get_platform_copy_destination` returns `tvos` for `appletvos`/`appletvsimulator` so the real framework lands
  where the podspec vendors it; (2) `create-dummy-hermes-xcframework.sh` adds `tvos` to its platforms so the
  dummy exists at pod-install time. **Reverted** the v0.8.59–v0.8.62 framework-content hacks (`-all_load`,
  `-fvisibility=default` sed, `SHARED_JSI=true`) — the CI flags produce a correct framework; only the copy path
  was wrong. `preview-tvos` only. Rebuild to verify — this should finally move the symbol count.

## [0.8.62] - 2026-07-28

### Fixed

- **Build jsi as a shared library so it actually lands in the from-source `hermesvm.framework`
  (`HERMES_BUILD_SHARED_JSI=true`, tv-native).** v0.8.61 proved visibility is NOT the gate: the sed landed
  (`append("-fvisibility=default" …)` confirmed in the log), `hermesvm.framework` was relinked, there's no
  exported-symbols allowlist — and the undefined count stayed frozen at 61 across **four** builds (`-all_load`
  → per-config visibility → global `-fvisibility=default`). Conclusion: jsi isn't *hidden* in the framework,
  it's *absent*. Cause: RN's `build-hermes-xcode.sh` force-sets **`-DHERMES_BUILD_SHARED_JSI:BOOLEAN=false`**,
  which builds jsi as a **static** lib that never gets bundled into `hermesvm.framework`'s exports — and
  `React-jsi` excludes `jsi.cpp` expecting the framework to provide it, so nobody does. `HERMES_BUILD_SHARED_JSI`
  is a real Hermes cache var ("Build JSI as a shared library", default ON for Apple platforms; RN overrides it
  OFF). **Fix:** flip it back to `true` so jsi is built + exported as a shared library from the framework.
  Kept the v0.8.61 `-fvisibility=default` sed (exports the VM's `NopCrashManager` too) and the v0.8.59
  `-all_load`. Same react-native-tvos patch, `preview-tvos` only. Rebuild to verify. **If the count finally
  moves, we're on the right mechanism; if a new "libjsi.dylib not found" / packaging error appears, that's
  progress too (jsi is now a real shared object) and we handle the embed.** Backup plan if this stalls:
  compile `jsi.cpp` directly in `React-jsi`.

## [0.8.61] - 2026-07-28

### Fixed

- **Flip Hermes's global `-fvisibility=hidden` to `default` at its source so the from-source
  `hermesvm.framework` exports its jsi + VM symbols (tv-native).** v0.8.60 added `-fvisibility=default` via
  the per-config `CMAKE_*_FLAGS_MINSIZEREL`, but the build still failed with the same 61 undefined symbols —
  and tellingly, even the non-jsi `hermes::vm::NopCrashManager` stayed hidden, proving the per-config override
  was **not winning**: Hermes emits a later `-fvisibility=hidden` the per-config flags can't get behind.
  Confirmed via Hermes's `CMakeLists.txt`: `if (GCC_COMPATIBLE) append("-fvisibility=hidden" CMAKE_CXX_FLAGS
  CMAKE_C_FLAGS)` ("Don't export symbols unless we explicitly say so"). That file is downloaded onto the EAS
  worker (not in our patchable `node_modules`), but `build-hermes-xcode.sh` runs after the fetch and before
  cmake configures — so it now `sed`s that line to `append("-fvisibility=default" …)` before configuring,
  making every Hermes symbol default-visibility (exported), matching the prebuilt framework. Replaces the
  ineffective per-config-flag approach; keeps the v0.8.59 `-all_load` (force-includes jsi's objects so there
  is something to export). Added a `grep fvisibility` echo right after the sed so the next build log shows the
  actual line (in case the fork's spacing differs and the sed no-ops). Same react-native-tvos patch,
  `preview-tvos` only. Rebuild to verify.

## [0.8.60] - 2026-07-28

### Fixed

- **Export the from-source Hermes framework's public jsi + VM symbols (tv-native) — the second half of the
  v0.8.59 link fix.** v0.8.59's `-all_load` correctly *included* jsi's objects in `hermesvm.framework`, but
  the link still failed with the same undefined symbols — because the build log showed jsi is compiled with
  **`-fvisibility=hidden`**: the symbols are present in the framework but **hidden, not exported**, so nothing
  can link them. Hermes's root `CMakeLists.txt` does `append("-fvisibility=hidden" CMAKE_CXX_FLAGS
  CMAKE_C_FLAGS)` ("Don't export symbols unless we explicitly say so"), and our from-source Hermes V1 on tvOS
  isn't re-exporting jsi/`NopCrashManager` the way the prebuilt framework does. **Fix:** override the
  per-config `CMAKE_CXX/C_FLAGS_MINSIZEREL` (+ `_RELEASE`) in `build-hermes-xcode.sh` to append
  `-fvisibility=default`. Hermes appends its `-fvisibility=hidden` only to the *general* flags; the per-config
  flags are applied **after** the general ones on every compile and Hermes doesn't touch them, so
  `-fvisibility=default` is the last `-fvisibility` on the line and wins — forcing jsi (HostObject/Value/
  typeinfo/vtables) and `hermes::vm::NopCrashManager` to export from the framework, matching the prebuilt one.
  Pairs with the v0.8.59 `-all_load` (include the objects) → export the objects. Should also unify the jsi
  type-info across the framework boundary — the original crash's root cause. Same react-native-tvos patch,
  `preview-tvos` only. Rebuild to verify.

## [0.8.59] - 2026-07-28

### Fixed

- **Force-include jsi + the Hermes VM symbols into the from-source `hermesvm.framework` (tv-native) — the fix
  for the v0.8.58 final-link wall.** The v0.8.58 build compiled everything then failed at the app's final
  link with ~60 `Undefined symbols`: the *entire* `facebook::jsi::` core (`HostObject`, `Value` ctors,
  `Array::createWithElements`, `NativeState`, `MutableBuffer`, `JSINativeException`, `strictEquals`, …),
  referenced from ~11 libraries (ExpoModulesJSI/Core, Worklets, Reanimated, Fabric, GestureHandler,
  jsiexecutor, ReactCommon), plus `hermes::vm::NopCrashManager::~NopCrashManager()`. **Root cause (read from
  the xcode build log + Hermes's CMake):** `React-jsi` deliberately excludes `jsi.cpp` when using Hermes
  (`# JSI is a part of hermes-engine`), expecting the Hermes framework to provide those symbols — the
  *prebuilt* `hermes.framework` does, but our *from-source* one does **not**. Hermes builds `jsi` as a static
  lib and links it into the `hermesvm` **shared** framework `PUBLIC` **without whole-archive**, and that
  framework's top-level target is an empty `dummy.cpp`, so every jsi/VM symbol nothing inside the VM already
  references gets **dropped at link** and never exported. (This is a known, upstream-unresolved from-source
  gap — facebook/react-native#46593.) **Fix:** patch `sdks/hermes-engine/utils/build-hermes-xcode.sh` to add
  `-all_load` to `HERMES_EXTRA_LINKER_FLAGS`, force-loading every archive into the `hermesvm` framework so the
  jsi + VM symbols land in it and export — matching the prebuilt framework. The flag is proven to reach that
  exact link (the existing `-ld_classic` flag rides the same var). Added to the existing
  `patches/react-native-tvos@0.83.6-0.patch`; `preview-tvos` only. Rebuild `preview-tvos` to verify.

## [0.8.58] - 2026-07-28

### Fixed

- **Build all Expo modules from source too (`EXPO_USE_PRECOMPILED_MODULES=0`) so they link against the
  from-source Hermes (tv-native).** The v0.8.57 build reached the **final link** and then failed on one
  undefined symbol — `hermes::vm::NopCrashManager::~NopCrashManager()` referenced by `libExpoModulesJSI.a`, a
  **precompiled** Expo module (EAS auto-sets `EXPO_USE_PRECOMPILED_MODULES=1`) built against the *prebuilt*
  Hermes, which our from-source Hermes exports differently. Per Expo's docs, a from-source build must set
  `EXPO_USE_PRECOMPILED_MODULES=0` so every Expo module compiles from source against the same Hermes/toolchain.
  Added it to `preview-tvos`. This is the final piece of "align the whole C++ stack from source" — it makes the
  build slower still, but it's required.

## [0.8.57] - 2026-07-28

### Fixed

- **Install cmake/ninja on the EAS build so Hermes can compile from source (tv-native).** v0.8.56's
  `RCT_BUILD_HERMES_FROM_SOURCE=true` worked — the build log confirms it selected Hermes V1 from the pinned
  `.hermesv1version` tag (`hermes-v250829098.0.4`) — but `pod install` then failed at `hermes-engine.podspec`
  with `Unable to locate the executable cmake` (the EAS worker doesn't ship cmake, which compiling Hermes
  requires). Added an `eas-build-pre-install` hook (`brew install cmake ninja`) so the from-source Hermes build
  can run. (The `EXPO_USE_PRECOMPILED_MODULES` line in that log is a benign warning — a known consequence of
  building RN from source, not the failure.)

## [0.8.56] - 2026-07-28

### Changed

- **Build Hermes V1 from source on the tvOS release build — THE fix for the release startup crash (tv-native).**
  `preview-tvos` now sets `RCT_BUILD_HERMES_FROM_SOURCE=true`. Root cause of the release-only
  `RCTFatalException: non-std C++ exception [type: facebook::jsi::JSINativeException]`: RN core is built from
  source (`buildReactNativeFromSource`, required because the fork's Hermes V1 dropped the `inspector_modern`
  symbols Expo's precompiled RN core expects) but Hermes stayed **prebuilt** — so RN core and Hermes carried two
  different `jsi::` type-infos, and a `jsi::JSINativeException` thrown by Hermes couldn't be caught by RN core's
  `catch (const std::exception&)` → it escaped as fatal (debug handles it fine). Per RN's Bundled-Hermes docs the
  two copies of JSI must be one; `RCT_BUILD_HERMES_FROM_SOURCE=true` builds Hermes V1 from the pinned
  `.hermesv1version` tag with the same JSI as the from-source RN core, unifying the type-info so RN catches the
  exception and boots. Trade-off: much longer build (Hermes compiles from source). If confirmed, roll to every
  iOS/tvOS **release** profile — the crash is iOS-26-release-generic, so an App Store iPad build needs it too.

## [0.8.55] - 2026-07-27

### Fixed

- **Boot splash black-screened the app on the iPad dev client — restore the known-good boot + isolate the
  splash (tv-native).** v0.8.52 restructured the root layout (mounting the providers before session load and
  gating the `Stack` on `ready`) to slot the splash in; that left the iPad on a black screen after load.
  Restored the exact original boot — early-return dark screen while session/device hydrate, then the full
  provider + `Stack` tree mounts unconditionally — and made the splash a pure overlay ON TOP of the mounted
  app, wrapped in an error boundary so a splash render failure can never blank the app (worst case it silently
  skips the animation).

## [0.8.54] - 2026-07-27

### Fixed

- **Boot splash could leave a black screen (tv-native).** The animated splash dismissed via a Reanimated
  `withTiming` completion callback (`runOnJS(onFinish)`), which can silently not fire — leaving the splash
  stuck over the app (a black screen after the intro). Drive the hand-off from a plain JS timer instead
  (guaranteed to fire), and set `pointerEvents="none"` on the splash so it can never trap the app underneath
  even if it ever lingers.

## [0.8.53] - 2026-07-27

### Changed

- **Diagnostic — the Apple TV boundary patch now REVEALS the exception type in the crash reason (tv-native).**
  v0.8.50's swallow got the app to *open* (the crash is fixed mechanically) but it then HUNG on a white screen
  (`Creating hang event` in the device log) — so the swallowed exception is on a **critical init path**, not
  fire-and-forget. To identify the real source, the `RCTCxxUtils` `catch (...)` patch now surfaces the ACTUAL
  C++ exception type + message (`abi::__cxa_current_exception_type` / `__cxa_demangle`) directly in the returned
  error, so the crash reason reads `non-std C++ exception [type: <culprit>] <detail>` instead of the opaque
  generic string. Deliberately fatal again (not swallowed) for this one diagnostic build — once we know the
  type, we fix the source and it boots cleanly.

## [0.8.52] - 2026-07-27

### Added

- **Animated Airwave boot splash (tv-native).** On launch the whole screen is the Airwave lockup, centered
  and large: the mark fades + scales in, then the "Airwave" letters cascade up one by one; it holds briefly,
  then fades into the app — the native analogue of tv-web's framer-motion `<Logo animate>`. Built with
  Reanimated shared values (`src/components/boot-splash.tsx`, imperative — sidesteps the fork's inverted
  `FadeIn*` naming); the app mounts underneath during the intro so it's warm the instant the splash clears.
  Overlaid in the root layout, gated on session/device load + intro completion.

## [0.8.51] - 2026-07-27

### Added

- **Airwave wordmark logo on the server-setup screen (tv-native).** The same `<Logo width={100} wordmark />`
  lockup used on the login screen now sits above the "Connect to your server" heading, so the branding is
  consistent across onboarding (setup → login).

## [0.8.50] - 2026-07-27

### Fixed

- **Apple TV release crash, take 2 — patch the RIGHT boundary (`RCTCxxUtils`) + reveal the culprit
  (tv-native).** v0.8.49's patch was verified compiled into the binary (grepped the shipped `.ipa` — the
  `[RN#54859]` marker is present) yet the crash persisted with **no** `[RN#54859]` log — proving the throw does
  NOT go through `performVoidMethodInvocation`. It exits at a different boundary: `RCTCxxUtils.mm`'s
  `tryAndReturnError`, whose `catch (...)` blanked the exception to the useless generic "non-std C++ exception"
  string, which the caller then `RCTFatal`s → abort. Extended the patch to that boundary: it now (1) prints the
  ACTUAL C++ exception **type + message** via the C++ ABI (`abi::__cxa_current_exception_type` /
  `__cxa_demangle`) so the culprit finally shows in the device log (`[RN#54859] … type=… detail=…`), and (2)
  **swallows** it (returns no error) instead of letting the app abort — matching what the dev client does (the
  v0.8.49 dev build loads fine), so the release build can boot. The void-method patch (v0.8.49) stays as a
  second safety net. Both live in `patches/react-native-tvos@0.83.6-0.patch`.

## [0.8.49] - 2026-07-27

### Fixed

- **THE Apple TV release-build startup crash — patch the React Native framework bug directly (tv-native).**
  After removing two specific triggers (GameController v0.8.46, keychain v0.8.47–48) the release / New-Arch
  tvOS build STILL aborted at launch with `RCTFatalException: non-std C++ exception` — a *third* throwing void
  TurboModule, exactly as RN #54859 warns ("multiple modules"). Since the New Architecture / bridgeless
  **cannot** be disabled in SDK 55 (RN 0.83 removed the legacy arch) and there's no upstream fix yet, we patch
  the root cause ourselves: `ObjCTurboModule::performVoidMethodInvocation` re-threw a caught `NSException` on
  the async dispatch queue, where nothing catches it → `std::terminate` → `abort()`. The non-void path was
  fixed upstream (PR #50193); the void one never was. The patch (`patches/react-native-tvos@0.83.6-0.patch`,
  via pnpm `patchedDependencies`, auto-applied by EAS's `pnpm install`) **logs** the offending module/method
  (`[RN#54859]`) and **swallows** it instead of aborting — a fire-and-forget void method failing silently is
  fine; crashing the whole app is not. This is what makes a release / App Store build viable at all, and it
  surfaces the culprit's name so we can optionally address the specific module later.

## [0.8.48] - 2026-07-27

### Fixed

- **Extend the Apple TV keychain-free fix to better-auth (tv-native).** v0.8.47 moved the startup token off
  expo-secure-store, but `@better-auth/expo`'s `expoClient` still used SecureStore — reached by the device-code
  login (`login.tsx`) and `useSession()` in Settings → User, so **logging in or opening that screen on the
  Apple TV could still hit the same RN #54859 keychain crash**. better-auth reads its storage
  **synchronously**, so AsyncStorage can't back it directly; added a synchronous, keychain-free `SyncCredStore`
  — an in-memory cache hydrated from AsyncStorage at startup (`hydrateSyncCreds()`, awaited in `loadSession`)
  and write-through for persistence — used on the Apple TV, with real SecureStore on iPad + Android. The whole
  Apple TV auth path is now keychain-free. Added `[cred-store]` console logs (Apple TV only, keys + hit/miss —
  never token values) so the keychain-free path is visible in the Metro console while verifying.

## [0.8.47] - 2026-07-27

### Fixed

- **THE Apple TV release-build startup crash — stop using expo-secure-store on tvOS (tv-native).** The
  release / New-Architecture tvOS build aborted at launch with `RCTFatalException: non-std C++ exception`
  (fine in the dev client / debug). Root cause is a React Native **framework** bug,
  [facebook/react-native#54859](https://github.com/facebook/react-native/issues/54859): on **iOS/tvOS 26 +
  release + bridgeless**, a throwing async **void** TurboModule method isn't caught in
  `ObjCTurboModule::performVoidMethodInvocation`, so the re-thrown exception aborts the process.
  `expo-secure-store` is a named trigger — and our `loadSession()` reads the bearer token from the Keychain
  at startup, where tvOS's heavily-restricted keychain throws. Added `lib/cred-store.ts`: a SecureStore-shaped
  credential store that falls back to **AsyncStorage on the Apple TV** (`Platform.OS === "ios" && isTV`),
  keeping the real Keychain/Keystore on iPad + Android (tvOS keychain persistence is unreliable anyway).
  Stacks with v0.8.46, which removed the other startup trigger (GameController). Effective on the next tvOS
  build.

## [0.8.46] - 2026-07-27

### Fixed

- **Candidate fix for the release / New-Architecture tvOS startup crash — skip GameController on tvOS
  (tv-native).** `@ChannelGuide/key-input` reads `GCKeyboard` (GameController) for hardware-keyboard input,
  which is only useful on the iPad (no TV remote). On tvOS the Siri Remote is delivered via react-native-tvos
  `useTVEventHandler`, so the module is redundant there — but its `OnCreate` accessed `GCKeyboard.coalesced`
  at startup, spinning up the shared GameController session that enumerates the Siri Remote, exactly where the
  **release + bridgeless (New Architecture)** build aborts (`RCTFatalException: non-std C++ exception`, right
  after "Connected devices changed -> Siri Remote"). Guarded all GameController use behind `#if !os(tvOS)`.
  iPad + Android unaffected. **Native — effective on the next tvOS build (currently parked), and unverified
  until then** (react-native-tvos could also touch GameController independently).

## [0.8.45] - 2026-07-27

### Fixed

- **Android TV overscan reworked to a single global inset — fixes the guide + settings being massively inset
  (tv-native).** The v0.8.42/43 per-screen overscan (subtracting the inset from the guide's layout width and
  padding the guide root; an extra inset View in settings) pushed the guide grid far off the sidebar and
  over-inset the settings shell. Reverted all of it: the guide and settings go back to their **normal Apple TV
  / full-bleed layout, unchanged**, and the Android-TV overscan (~5% of the 960×540 dp space) is now applied
  **exactly once** — `paddingHorizontal/Vertical` on a single View at the app root (`app/_layout.tsx`). So the
  whole UI shifts in uniformly (sidebar + content together, no gaps, no double-inset), and it's a no-op on
  iPad/Apple TV (`OVERSCAN_* = 0`). Trade-off: full-screen video is inset by the same thin margin on Android TV
  rather than bleeding off the panel edges.

## [0.8.44] - 2026-07-27

### Fixed

- **Settings pages were massively inset on Apple TV — now full-bleed (tv-native).** The settings shell was
  the last screen still wrapped in `SafeAreaView`, which on tvOS applies the title-safe overscan margin on
  **all four edges** — pushing the whole shell *and* the category sidebar far in from the screen edges (the
  guide dropped `SafeAreaView` for full-bleed back in v0.8.22; settings never did, so it looked increasingly
  wrong next to the full-bleed guide). Replaced it with a plain full-bleed `View`, keeping the
  **Android-TV-only** overscan inset on the inner View. iPad/Apple TV now hug the edges like the guide;
  Android TV keeps its overscan-safe inset. (JS — hot-reloads into the Apple TV dev client.)

### Added

- **`preview-tvos` EAS profile.** A **release** Apple TV build (no `developmentClient` → JS is bundled, no
  Metro / dev server), internal distribution, mirroring `preview-androidtv`. For measuring real on-device
  tvOS performance without the dev-client overhead (the Android preview proved the dev client was the
  perf drag). The v0.8.40 cleartext/ATS exemption (`NSAllowsArbitraryLoads`) already lets a release tvOS
  build reach a plain-HTTP LAN server.

## [0.8.43] - 2026-07-27

### Changed

- **Settings overscan applied on a plain inner View, not the `SafeAreaView` (tv-native).** v0.8.42 hung the
  Android overscan padding on the settings `SafeAreaView`, which relies on how `SafeAreaView` merges style
  padding with its (Apple TV) safe-area insets — ambiguous. The two screens' Apple-TV layouts were always
  *different by design* (guide = full-bleed `View` since v0.8.22; settings = `SafeAreaView`), so we keep each
  one's working layout and add the **Android-only** `OVERSCAN` inset on top: the guide's plain root View
  (already done), and — for settings — a **plain inner View** wrapping the whole shell (incl. the absolute
  sidebar), leaving the `SafeAreaView` untouched. On iPad/Apple TV `OVERSCAN_* = 0`, so the inner View is a
  no-op pass-through (byte-identical to the working layout); on Android TV it's the only inset.

## [0.8.42] - 2026-07-27

### Fixed

- **Android TV overscan — content cut off at the screen edges (tv-native).** Real TVs crop ~5% of the
  edges over HDMI ("overscan"), so the full-bleed guide lost its sidebar's left edge and the bottom
  row / sidebar bottom on the physical Streamer (the emulator, a virtual display, doesn't overscan, so
  it looked fine — hence the mismatch). Added **Android-TV-only** overscan-safe insets (`OVERSCAN_H` 48 /
  `OVERSCAN_V` 27 — ~5% of the 960×540 dp space; **0 on iPad/Apple TV**, which have no overscan and where
  tvOS manages its own safe area). The guide (`AuroraGrid`) subtracts the horizontal inset from its layout
  width so the grid still fits the safe area, and pads its root; the settings shell pads its `SafeAreaView`
  (which is the parent of its absolute sidebar). Kept full-bleed on iPad/Apple TV.

## [0.8.41] - 2026-07-27

### Changed

- **Guide-load failure now renders the full guide shell (sidebar + GuideGhost), not a dead-end — tv-native
  + tv-web.** When the guide can't load (server unreachable / down) or has zero channels, both clients now
  render the real `AuroraGrid` (sidebar + featured chrome + context-aware ghost) so the sidebar's
  Settings/Account are **always reachable through the normal D-pad zone machine** — the user changes servers
  or signs out instead of being stranded.
  - **tv-native:** replaced the v0.8.40 bespoke error screen (a half-measure — it had its *own* throwaway
    key layer, so you couldn't cross into the sidebar) with the real guide shell. It now runs entirely
    through the **global input dispatcher** like everything else; the guide's zone machine already handles
    zero channels (LEFT opens the sidebar), so escape works with no channels loaded.
  - **tv-web:** extended its existing empty-channels shell to the **error** case too (it previously
    dead-ended on a plain "Couldn't load the guide." message).
  - `serverTime` falls back to the client clock when the fetch failed; a 401 still forces sign-out.

## [0.8.40] - 2026-07-27

### Fixed

- **Release/production builds couldn't reach a plain-HTTP server (tv-native).** Android **release** builds
  block cleartext HTTP by default (dev/debug builds allow it), so a `preview`/production APK couldn't connect
  to a self-hosted server on a plain `http://` LAN address — even though the dev client, iPad, and Apple TV
  (all dev builds) connect fine. Confirmed via the release APK's manifest (no `usesCleartextTraffic`, no
  network-security config). Enabled cleartext via `expo-build-properties` `android.usesCleartextTraffic:true`,
  plus the iOS equivalent (`NSAppTransportSecurity.NSAllowsArbitraryLoads`) so an iOS release isn't blocked by
  ATS. Load-bearing for self-host (plain-HTTP LAN) on any non-dev build. Native — takes effect on the next build.
- **The guide-load-failure screen was a dead-end (tv-native).** When the guide couldn't load (server
  unreachable / down), the user was stranded on a static "Couldn't load the guide" with no escape — unlike
  tv-web, which shows the ghost guide + sidebar. Now it's recoverable: a focusable **Open Settings** (OK on
  the remote, or tap) → change servers or sign out. A one-item zone machine so the D-pad isn't stuck.

## [0.8.39] - 2026-07-27

DV arc, stage 2 — plumb the captured Dolby Vision metadata through to the client. (Then paused: the native
DV-mode switch is confirmed cosmetic on the Apple TV — see below.)

### Added

- **`dovi` in the `/media` response (server → client).** `broker.resolveMedia` looks up the played item's
  `MediaItem.guide.dovi` (captured in v0.8.38) and includes it on the playback response; the tv-native
  `MediaInfo` type now carries `dovi: { profile, level, blCompatId }`. **Plumbed but not yet consumed** —
  the native DV-mode switch is a deferred, tvOS-only step.

### Why we stopped here (not building the native badge)

Real Dolby Vision = an HDR base image + the **RPU** (dynamic per-scene tone-mapping). Our mpv `avfoundation`
video output doesn't apply the RPU — and, confirmed against `.refs/plezy`, **neither does plezy on iOS/tvOS**
(it uses `avfoundation` there too; only its *macOS* build uses `gpu-next`, which can). So on the Apple TV a
DV "mode" switch is just the badge over the HDR10 base — cosmetic, no picture change. The 288 Profile-8.1/7
titles already direct-play correctly as HDR10 today. Building the `dvh1` badge (Stage C) and Profile-5
handling (Stage D) is documented as deferred in `.plans/tv-native.md` §10.2 C.

## [0.8.38] - 2026-07-27

Starts the **Dolby Vision** arc — captures the DV metadata from Plex (the foundation for switching the
Apple TV into DV mode).

### Added

- **Capture Dolby Vision profile / level / BL-compat-id from Plex (server).** The Plex client now reads
  `DOVIProfile` / `DOVILevel` / `DOVIBLCompatID` off the video stream (we previously grabbed only the
  `DOVIPresent` flag) and stores `dovi: { profile, level, blCompatId }` on `GuideMeta` → `MediaItem.guide`
  (a JSON column, so **no migration**). `blCompatId` classifies the base layer — 1/6 → HDR10, 4 → HLG,
  2 → SDR, 0 → none (Profile 5). This is what the native tvOS player needs to build the `dvh1` display
  criteria (mpv can't report it — it only decodes the base layer). **Re-run the metadata sync to backfill
  existing items** (their stored `guide` JSON predates the field); the data is inert until the API + native
  stages land.

## [0.8.37] - 2026-07-27

### Changed

- **Dropped the redundant logo from the QR sign-in card (tv-native + tv-web).** The logo + wordmark lockup
  already sits above the card, so the second mark inside it was duplicative.

### Added

- **`preview-androidtv` EAS profile.** A **release** Android TV build (no `developmentClient` → JS is bundled,
  no Metro / dev-server) as an installable APK (`EXPO_TV=1`). For measuring real on-device performance on the
  Streamer without the dev-client overhead — to confirm whether the UI slowness is the dev server.

## [0.8.36] - 2026-07-27

Brings the **Airwave** logo + wordmark to **tv-web** (login, QR card, About), mirroring tv-native.

### Added

- **Airwave brand mark + reusable `<Logo>` component in tv-web** (`src/lib/logo.tsx`): renders `/logo.png`
  from `public/` at a px `markWidth` (keeps the native 715×517 aspect), with an optional white "Airwave"
  wordmark laid out `row` (beside) or `column` (below). Used on **login** (mark + wordmark lockup, replacing
  the old inline `<Logo>` stub + the "ChannelGuide" text title), the **QR sign-in card** (mark), and
  **Settings → About** (lockup replacing the big name text). Added `apps/tv-web/public/logo.png`.
  (`APP_NAME` was already "Airwave" in tv-web.)
- **Staggered logo entrance on the login screen** (framer-motion, `animate` prop on `<Logo>`): the mark
  fades + scales in, then the "Airwave" letters cascade in one by one. Off by default (About/QR render
  static); enabled only on login.

## [0.8.35] - 2026-07-27

Brings the **Airwave** brand into tv-native — logo + wordmark on login, the QR screen, and About — and
reworks the QR sign-in screen into two columns.

### Added

- **Airwave brand mark + a reusable `<Logo>` component (tv-native).** Converted the mark (cloud + wave,
  transparent) to `apps/tv-native/assets/logo.png` and added `src/components/logo.tsx`: renders the mark at a
  chrome-scaled `width` (keeps the native 715×517 aspect), with an optional `wordmark` ("Airwave" in white)
  laid out `row` (beside) or `column` (below). Used on **login** (mark + wordmark lockup replacing the old
  text title), the **QR sign-in card** (mark, top-left), and **Settings → About** (lockup replacing the big
  name text). (Native `Image` can't reliably decode webp on iOS/tvOS, so the source `.webp` → PNG.)
- **App display name is now "Airwave"** (`APP_NAME`) — updates the About page + copy. (The launcher name /
  bundle IDs in `app.json` are unchanged; that's a deeper rename for later.)

### Changed

- **The Plex / device-code QR screen is now a two-column layout (tv-native).** Logo + heading + instruction +
  Back on the left, a vertical separator, then the QR + code on the right — which fits a 16:9 screen (wide,
  short) far better than the tall vertical stack that was overflowing on Android TV. Sized via `scaled()` /
  `cs()`.

## [0.8.34] - 2026-07-27

Fixes D-pad navigation on the login + setup screens — they were unreachable on Android TV.

### Fixed

- **Login + setup couldn't be navigated by the D-pad on Android TV (tv-native) — you couldn't select a
  button to sign in.** These onboarding screens were built "touch-first," relying on the **native Android
  focus engine** rather than the app's zone machine. But the v0.8.30 Android D-pad capture
  (`KeyInputModule`) intercepts every D-pad event at the Activity's `dispatchKeyEvent` and forwards it to
  our dispatcher — **consuming it before the native focus engine sees it**. So on any native-focus screen
  the D-pad did nothing: no focus movement, no ring, no way to press a button. (It had been broken since the
  first `development-androidtv` build; login just wasn't hit until now.) Converted **login** and **setup**
  to the same `useKeyLayer` zone machine every other screen uses: ▲/▼ move a selection, **OK** activates
  (OK on the address field opens the keyboard), with a visible `sel`-driven ring (inline white/accent
  border). Note: NativeWind's `focus:` variant is inert on these screens — it keys off the native `onFocus`
  event, which never fires once the D-pad is captured — so the ring is state-driven, not `focus:`-class.

### Durable gotcha

- **Any screen that used the native focus engine must use the zone machine now.** The global Android D-pad
  capture (which makes the guide/watch/settings work) deliberately starves the native focus engine, so
  `focusable` + native focus + `focus:` styling is dead on Android TV. Drive selection + OK via `useKeyLayer`
  and style from the selection index, exactly like the rest of the app.

## [0.8.33] - 2026-07-27

Completes the Android-TV chrome scaling — the **full-size player chrome, channel surf, number entry,
bumper card, and the diagnostic page** now scale via `scaled()` / `cs()`. iPad + Apple TV untouched.

### Fixed

- **Oversized full-size channel chrome + diagnostic + remaining watch UI on Android TV (tv-native).**
  Applied `scaled()` / `cs()` (Android-TV-gated) to every remaining raw-dp screen:
  - **Feature panel** — the title, the multi-segment DVR scrubber (thumb/halo/labels), the control row +
    circle selectors, the Info view (metadata, delivery readout), and the audio/subs/quality picker modal.
  - **Full chrome** (`watch`) — the top-right channel chip + the back affordance.
  - **Channel surf** — tiles + carousel (scaling `TILE_W`/`GAP` at the source cascades to the art height
    and centering math), the "Watching" flag, progress, and labels.
  - **Channel-number entry**, the **mini-player** Full/Close buttons + focus hint (`player-context`), and
    the **bumper** "Coming up next" card (countdown donut sized via `cs()` + text).
  - **Diagnostic** — frame radius, test chips, progress bar + counts, and the inspect card (the
    screen-proportional `frameW`/`frameH` are left alone; only the literal siblings scale).
  - The guide empty-state (`guide-ghost`) already used `vw()` and needed nothing.
  All JS; hot-reloads. iPad + Apple TV render identically (`cs`/`scaled` are ×1 there).

### Not scaled (by design)

- **Onboarding / login / setup** use **NativeWind** (Tailwind `className`), a separate styling system from
  the `vw`/`cs` pipeline — and they're first-run, native-focus, touch-first screens. Scaling those is a
  distinct conversion, deferred unless needed.

## [0.8.32] - 2026-07-27

Extends the Android-TV chrome scaling to the **settings** screens via a new `scaled()` style-object helper.
iPad + Apple TV remain mathematically untouched.

### Added

- **`scaled()` — a style-object form of `cs()`** (`features/guide/layout`). Multiplies the size-like keys
  of a style object by `CHROME_SCALE` and **returns the same object untouched when `CHROME_SCALE === 1`**
  (iPad / Apple TV / Android tablets — no copy, no change). Allow-listed keys: width/height/min-max,
  padding*/margin*, top/bottom/left/right, borderRadius*, fontSize/lineHeight, gap*. Deliberately skips
  `borderWidth` (hairlines), opacity/flex*/zIndex/elevation/aspectRatio, and any non-number ("100%"
  strings, percent offsets). One wrap per style block instead of wrapping each number.

### Fixed

- **Oversized settings UI on Android TV (tv-native).** The settings screens are authored in raw dp (never
  `vwOf`), so on the 960dp space they rendered ~2× too big. Applied `scaled()` to the shared primitives
  (`PageHeader` / `SettingRow` / `SectionLabel` / `Pill` / `Toggle` in `settings-ui`), the shell's content
  padding + max-width, and each page's detail card + `Info` rows (`device` / `user` / `server` / `about`,
  incl. the avatar + recent-errors card). Android-TV-gated; iPad + Apple TV unchanged. JS; hot-reloads.

### Still to do

- The **full-size channel chrome** (`feature-panel`) and the **diagnostic** page are still raw-dp — next
  scaling pass. Separately, the **Android-TV input lag** (~seconds per D-pad press on the Streamer) is a
  distinct perf investigation (dev-build overhead + video-decode contention are the leading suspects; the
  guide render was ruled out — the clock isn't a tick, the `Row` memo holds, logs/blur are cold-path).

## [0.8.31] - 2026-07-27

Android TV chrome scaling — the fixed-dp chrome (sidebars, cards, gaps) now scales to Android TV's 960dp
layout space, so it matches the guide instead of rendering oversized. iPad + Apple TV are mathematically
untouched.

### Fixed

- **Oversized chrome on Android TV (tv-native).** Android TV normalizes every panel — 1080p or 4K — to a
  **960dp** layout space, ~half the dp width tvOS reports for the same screen (confirmed: the Google TV
  Streamer + both emulators all report `w=960` regardless of `scale`). The guide grid scales with width via
  `vwOf` and looked right, but the sidebar widths, glass circles, icons, border radii, inter-program gap,
  and the sidebar's layout spacer were authored in **raw dp**, so they rendered ~2× oversized against the
  guide: a huge collapsed sidebar, over-rounded program cards, too-wide gaps between programs, and the
  rails/featured panel pushed right by the old sidebar width. Added `CHROME_SCALE` / `cs()` (≈0.5 at 960dp)
  and applied it to the guide sidebar + its spacer, the shared glass-circle button (size/ring/gap/labels),
  the program-card / badge / mini-feed radii, the inter-program gap, and the **settings** sidebar + shell.
  **Gated to Android TV only** (`Platform.OS === "android" && Platform.isTV`) — iPad + Apple TV
  (`Platform.OS === "ios"`) and Android tablets (`isTV` false, which use `UI_SCALE` 1.3 like the iPad) stay
  at exactly ×1, so `cs(x) === x` there and their proven sizing is unchanged. JS; hot-reloads.

### Changed

- **Startup `[platform]` diagnostic now logs window + screen dp size** (`win=`/`screen=`) alongside `isTV`,
  to diagnose chrome-vs-guide scaling and rule out system-bar insets (confirmed the guide fills the full
  960×540 — the emulator's bottom strip is its own nav bar, not a layout gap). Temporary; removed once
  Android is dialed. Known follow-up: the settings **content** pages (cards) are still raw-dp and may read a
  touch large on Android TV — a separate `cs()` pass if needed.

## [0.8.30] - 2026-07-27

Starts the **Android TV arc**: makes the D-pad actually drive the app. On the Google TV emulator `isTV`
resolved **true** (so scaling isn't an `isTV` bug — see below), but **no remote input did anything** — the
architectural difference from tvOS, now fixed.

### Fixed

- **Android TV D-pad input was completely dead (tv-native).** On tvOS `useTVEventHandler` is a global,
  focus-independent handler, so our manual zone machine (ported from the browser, everything
  `focusable={false}`) works. On **Android**, D-pad navigation *is* the native focus engine — the OS routes
  `KEYCODE_DPAD_*` to move focus **between focusable Views** — so with nothing focusable, focus can't move
  and `useTVEventHandler` never fires → no button did anything. Fixed by capturing the D-pad (up/down/left/
  right + OK/center/enter) in the native key module at the Activity's **`dispatchKeyEvent`** — which is
  global and focus-independent — and forwarding it to the same dispatcher (the model media apps use on
  Android TV: intercept above the focus engine, don't fight it). Consuming the event also stops the focus
  engine seeing it, so there's no double-dispatch. Directional keys re-emit on auto-repeat (hold-to-scroll);
  OK fires once per press. Android-only (Kotlin); tvOS/iPad untouched. **Needs a `development-androidtv`
  rebuild** (the APK on the Streamer/emulator is still the v0.8.15 native).

### Added

- **The remote's Back button now works in-app on Android, and exits at the root (tv-native).** Back was
  exiting the app immediately (like the Apple TV Menu button did before `enableTVMenuKey`). Handled via RN's
  **`BackHandler`** — the version-robust "special way" on modern Android, where Back is routed through the
  predictive-back dispatcher rather than always `dispatchKeyEvent`. Because our `dispatchKey()` returns
  synchronously whether a layer claimed the key, Back honors Android's contract exactly: it navigates in-app
  when something can handle it (close Info / a panel / go back a screen) and **falls through to a real
  app-exit at the guide root** — the genuine "regular Back button" behavior (a cleaner result than tvOS's
  currently-deferred root-exit). Android-only (iOS has no hardware Back; tvOS routes Menu→back through
  `useTVEventHandler`). JS — lands with the same rebuild.

- **Window dp size added to the startup platform diagnostic (tv-native).** The `[platform] …` log now also
  prints `w/h/scale/fontScale`, so we can see why fixed-dp chrome (the sidebar widths + program-cell border
  radius are raw dp, not run through `vwOf`) looks oversized against the `vwOf`-scaled guide on a given
  screen — the likely cause of the emulator's huge collapsed sidebar + over-rounded cards. Diagnostic only;
  hot-reloads. (Temporary; removed once the Android scaling is dialed on real hardware.)

## [0.8.29] - 2026-07-27

### Changed

- **Moved the `isTV` diagnostic from About to the Device page's detail card (tv-native).** It now shows as an **"Is TV?" Yes/No** row alongside Model / Platform / Resolution / HDR — where device details belong — and is off the About page.

## [0.8.28] - 2026-07-27

### Added

- **Platform diagnostic on Settings → About (tv-native).** A small line showing `Platform.OS`, the OS version, and **`isTV`**. `isTV` drives `UI_SCALE` and the whole focusable/native-focus gating, so being able to read it on-device is the first check for TV builds — especially on **Android**, where `isTV` depends on the build's `IS_TV`/the device uiMode rather than just `EXPO_TV=1`.

## [0.8.27] - 2026-07-27

### Changed

- **Skip the per-tick scrubber build unless full-screen (tv-native perf).** `buildScrubber` (loops the timeline slots + maps each segment) ran every 500ms in the player tick regardless of layout — but only the feature panel, which exists only in full-screen chrome, consumes the scrubber. It's now gated on `layout === "full"`, so that work is skipped while a mini feed is docked (i.e. while you're browsing the guide) or off — freeing JS-thread time on the perf-sensitive path (weak-GPU-friendly). Still pre-built when full, so the scrubber is ready the instant the chrome opens. No visual or behavior change.

## [0.8.26] - 2026-07-27

### Changed

- **Guide `Row` is memoized — the big guide-perf win (tv-native).** The row was a plain component, so every up/down re-rendered **every visible row** (the FlashList `extraData` changes each render), each painting several gradient program cells. `Row` is now `React.memo`'d with stable props: the tap handlers are `useCallback`-stable via refs (they close over `fc`/`fp`/`zone`/`channels`, which change every keypress — refs keep the callbacks stable while reading the latest values), and `index` is passed in. Now navigation re-renders only the **~2 rows whose selection actually changed**, not all ~10. Purely internal — no visual or behavior change — and it helps every platform (iPad, Apple TV, and Android TV when we get there).

## [0.8.25] - 2026-07-26

### Added

- **Resume-stall watchdog — recover from a dead Plex session on unpause (tv-native).** After a long pause Plex can reap the transcode session, so unpausing a dead stream just froze forever. On resume, if mpv produces **no progress within ~5s** (its clock is frozen), the player re-establishes at the same spot (`goTo(currentEffective())` → fresh session). **Bounded so it can't loop:** at most 2 *consecutive* reloads, and the counter resets on any real progress — so only a stream that's dead *and stays dead* hits the cap; after that it gives up in a **retryable** paused state ("Playback stopped. Press Play to retry.") rather than reloading forever. Manual Play/seek/re-tune always starts fresh. (The *proactive* fix — keeping the Plex session alive during pause via a Plex timeline heartbeat with `isPaused`, plezy's mechanism — is a separate, bigger arc shared with tv-web; this is the recovery safety net.)

## [0.8.24] - 2026-07-26

### Fixed

- **HDR content left the Apple TV's HDMI link in HDR after you closed it** (the guide/UI stayed in an HDR container). The display-criteria reset only ran in `applySource` on `source → null`, but Close **unmounts** the mpv view (it's conditionally rendered on `source`), so that path never fired — only `deinit`. Now `deinit` clears the criteria synchronously (via the retained window), dropping the link back to SDR when an HDR program is stopped. Native — takes effect on the next tvOS rebuild.

## [0.8.23] - 2026-07-26

### Fixed

- **Play/pause never resumed (tv-native).** `togglePause` decided pause-vs-play off `playingRef`, which is set `true` on load and never cleared — so it *always* took the pause branch: the first press paused, every press after just re-paused, and it never resumed. (A *seek* resumed only because `goTo` explicitly calls `play()`.) It now toggles the **actual** pause state (`pausedRef`), so play/pause and the scrubber's OK correctly resume.
- **Re-tuning the same channel right after Close wouldn't play.** Close nulls `source` (unmounting the mpv view, so `viewRef` is null), but the last-loaded URL was retained. Re-tuning the *same* channel at the same live position produced the *same* URL, so `goTo` took the "same media → seek" path and called `seek()`/`play()` on the unmounted view (no-ops) and **never set `source`** → nothing remounted. A different channel reloaded fine (different URL). The last-loaded URL is now cleared on channel change / Close, so any re-tune reloads.

## [0.8.22] - 2026-07-26

A large tvOS input / performance / layout polish pass, bringing the Siri-remote guide experience to tv-web parity.

### Fixed

- **Guide navigation was very laggy.** Each row mapped the whole day's program back-buffer on every keypress. Programs are now culled to the visible window (+ rail-edge slivers dropped) at the **SOURCE** (the `channels` memo), matching tv-web (§7.1) — rows are cheap and `fp` navigates exactly what's rendered.
- **The guide re-centered on every move** (never felt like scrolling). It now scrolls **only when the focused row would go off-screen** (fixed row height + tracked scroll offset), so you travel through the visible rows and it scrolls at the edges — like tv-web. Scroll-follow also snaps instantly (no animation).
- **Unused strips above/below the guide.** The route wrapped `AuroraGrid` in a `SafeAreaView` that applied tvOS overscan top/bottom insets; the guide is now **full-bleed** (tv-web parity), sidebar + grid edge-to-edge.
- **The native tvOS focus engine double-fired every control** — `select` ran a focused `Pressable`'s `onPress` on top of our zone machine (pause opened the audio picker, closing the mini also tuned channel 1, the sidebar opened on Back, etc.). Added **`TvPressable`** (`focusable={false}` on tvOS by default) and swapped it across all 11 zone-machine screens, so `select` runs **only** our dispatcher. Includes the featured-panel Pressable where the mini docks; the guide also now visually **deselects** channels while the mini is focused.
- **Siri-remote swipes fired spurious navigation** (random sidebar/panel jumps). Dropped the raw swipe→direction mapping — the touchpad is imprecise; the clickpad edges are the reliable d-pad. **Menu/Back** now navigates in-app (`TVEventControl.enableTVMenuKey()`) instead of exiting.
- **Scrubber focus was hard to see.** The focus style (zone-machine-driven — never lost by the focus changes) now draws a prominent accent **halo** around the thumb, matching tv-web's glow.

### Added

- **D-pad up into the docked mini player** (from the guide's top row) + the **mini-focus handled inside the guide's one handler** by the active-zone check (◄/► pick Full/Close, OK activates, Back stops, Down returns) — the tv-web model, not a separate key layer.
- **Hold-OK to focus the mini** (`longSelect` → `okLong`) — the Siri-remote stand-in for the LG green button; the mini hint updated to match.

## [0.8.21] - 2026-07-26

### Fixed

- **v0.8.20 crash-looped on Apple TV the moment playback started (`doesNotRecognizeSelector` → abort).** The HDR path calls `window.avDisplayManager`, which is a category **AVKit** adds to `UIWindow`. `import AVKit` compiles against the SDK headers, but the `mpv-player` podspec never **linked** AVKit — so at runtime the selector was absent and `-[UIWindow avDisplayManager]` aborted (SIGABRT) on the first clip's first frame, before the diagnostic could complete (hence the relaunch loop). Fixed by declaring `s.frameworks = 'AVFoundation', 'AVKit', 'CoreMedia'` in `MpvPlayer.podspec`. (plezy links these app-wide via Flutter, so its Swift never declared them — an Expo module must.) Needs a native rebuild.
- **The diagnostic no longer renegotiates the HDMI display on every clip.** `applyDisplayCriteria` now only drives the display for actual HDR content; SDR (every diagnostic clip + most SDR playback) just releases any HDR mode instead of setting an "SDR criteria," so the 49-clip capability scan doesn't hammer the link.

## [0.8.20] - 2026-07-26

Real HDR on the Apple TV — HDR content now switches the HDMI output into HDR10/HLG (LG's HDR badge lights) instead of playing tone-mapped to SDR.

### Added

- **tvOS HDR10 / HLG display-mode switching (`packages/mpv-player` native).** mpv renders its own frames via the `avfoundation` VO, so — unlike AVPlayer — tvOS never auto-switched the HDMI output to HDR, and `target-colorspace-hint` is inert in that VO while EDR is iOS-only. So HDR content direct-played but tone-mapped to SDR (no LG HDR badge). Now `MpvCore` reads the decoded stream's colorimetry (`video-params/gamma`/`primaries`/`sig-peak`) on first frame and `MpvPlayerView` drives the window's `AVDisplayManager.preferredDisplayCriteria` with an `AVDisplayCriteria(refreshRate:formatDescription:)` (tvOS 17+, public) tagged BT.2020/PQ (HDR10) or BT.2020/HLG — so the Apple TV switches into HDR, mpv's already-`target-colorspace-hint: auto` output passes through, and the display lights its HDR badge. Clamps to the display's advertised modes, dedupes across channel changes to avoid black-flash storms, and resets to SDR on leaving playback. Ported from `.refs/plezy`'s proven implementation. Respects the Apple TV's "Match Content → Match Dynamic Range" setting. **Dolby Vision Profile 8.1 content lights up as HDR10 here** (mpv decodes its PQ base layer); the true Dolby-Vision display mode (plezy's synthetic `dvh1` path + the DV profile from Plex metadata) is a later phase. All `#if os(tvOS)`-guarded; the iPad/iOS build is unchanged. Needs a native rebuild.

## [0.8.19] - 2026-07-26

Fixes the Apple TV Siri-remote experience — the input layer worked for the webOS d-pad model but never accounted for tvOS's quirks.

### Fixed

- **The Menu/Back button exited the app instead of navigating back.** On tvOS the Menu button backgrounds the app to Home by default; react-native-tvos only delivers a `menu` event (→ our `back`) if you call `TVEventControl.enableTVMenuKey()`. We now do, at the app root — so Back closes Info / panels / navigates in-app. (At the guide root it no longer exits to Home; use the TV/Home button. Root-exit refinement noted for later.)
- **Siri-remote swipes did nothing.** The clickpad sends `swipeUp/Down/Left/Right` for touch swipes and `up/down/left/right` only for edge-clicks; we mapped only the clicks. Swipes now map to the same discrete directional steps — the tvOS analogue of tv-web treating each LG wheel notch as one d-pad press.
- **The guide list fought the remote (smooth-scroll vs. snap).** The `FlashList` was being scrolled *natively* by tvOS (and its `Pressable` rows were grabbing the native focus engine), competing with our zone machine — so up/down sometimes snapped, sometimes slow-scrolled. On TV we now disable the list's native scroll, drive `scrollToIndex` from the zone machine so the list follows the selection, and take the row `Pressable`s out of the native focus engine (`focusable={false}`). iPad touch-scroll + tap-to-focus are untouched (all changes are `Platform.isTV`-gated).

## [0.8.18] - 2026-07-26

### Fixed

- **The capability diagnostic hard-crashed the app on Apple TV (and would on iPad) at the AV1 clip.** The diagnostic plays every matrix clip raw to measure real decode — including AV1, which mpv software-decodes via dav1d and which **null-crashes** on Apple platforms (`EXC_BAD_ACCESS` in `ff_libdav1d_decoder`; the Apple TV 4K's A15 has no hardware AV1, same as the iPad M1). It died deterministically right after logging clip 13 (`vid_av1_mkv`) — onLoad resolves on the first frame while the instance keeps decoding AV1 during teardown, and dav1d crashes. The diagnostic now **skips playing** any AV1 clip when `Platform.OS === "ios"` (react-native-tvos reports that for tvOS too) and records it **unsupported** — which is the honest, correct result: `codecs.ts` already quirks `av1 → ios` so the server force-transcodes AV1 regardless, making the native measurement both pointless and dangerous. First full diagnostic run to complete on real Apple TV hardware. JS-only; no rebuild.

## [0.8.17] - 2026-07-26

Opens the path to running tv-native on a **physical Apple TV** — which EAS's ad-hoc flow can't reach.

### Added

- **`testflight-tvos` EAS build + submit profile for physical Apple TV validation.** EAS's ad-hoc device management is **iOS-only by design** (`eas device:create` and the automated UDID registration never register or list a tvOS device — confirmed against Expo's own TV guide + eas-cli #2074), so a `distribution: internal` tvOS build can never target a real Apple TV: the ad-hoc device picker only ever shows iOS devices. The escape is **TestFlight** — App Store / TestFlight provisioning profiles carry **no device list**, sidestepping tvOS device registration entirely. New `testflight-tvos` profile clones `development-tvos` (keeps `developmentClient: true` so the installed app still hot-reloads from Metro over LAN, plus `EXPO_TV=1` + the react-native-tvos build env) but sets `distribution: "store"`; a matching `submit` profile lets `eas submit` push the build to TestFlight. Flow: `eas build --platform ios --profile testflight-tvos` → `eas submit --platform ios --profile testflight-tvos --latest` → install the TestFlight app on the Apple TV → download ChannelGuide → connect to `expo start --dev-client`. `development-tvos` (the ad-hoc device profile) is left untouched. Config-only.

## [0.8.16] - 2026-07-26

### Changed

- **`UI_SCALE` is now iPad/tablet-only — TVs render at 1.0.** The `1.3` global scale-up compensates for the iPad's taller-than-16:9 aspect (pure width-scaling under-sizes it and leaves vertical slack); a TV IS 16:9 (the layout's native design aspect), so applying 1.3 there oversizes everything by ~30% (huge fonts/rows, less content on screen). Now `UI_SCALE = Platform.isTV ? 1 : 1.3` — tvOS / Android TV / Fire TV get the design's intended proportions (matching tv-web's proven C2 sizing), while the iPad keeps 1.3. JS-only, hot-reloads. The iPad value is still "dial to taste."

## [0.8.15] - 2026-07-24

### Fixed

- **Android mpv loaded (libc++ fixed) but every diagnostic clip timed out "no frame" — a load-before-create race.** Android's `dev.jdtech.mpv.MpvPlayer.create` is a **suspend** (async) function, unlike iOS's synchronous `mpv_create` + `mpv_initialize`. `MpvCore.setup()` launched create and returned immediately, then `load()` ran before `player` existed and bailed at `val p = player ?: return@launch` — so `loadfile` **never executed**, mpv never opened the file, no frame ever came, and the capability diagnostic timed out on every clip. Fixed: `load()` now records the pending url/offset and `setup()`'s create-completion runs it, so the file always loads once mpv is up. Also forwarded mpv's own log stream to logcat (`adb logcat -s MpvCore`) for diagnosing any remaining decode/VO issues on device.

## [0.8.14] - 2026-07-24

### Fixed

- **Android crashed loading `libmpv.so` — `cannot locate symbol …__from_chars_floating_point<float>`.** The app now runs end to end (server URL + Plex device-link login + the capability diagnostic starting) — the *only* failure left was `System.loadLibrary("mpv")`. libmpv.so is built against a newer `libc++_shared.so` that has `std::from_chars<float>`, but an older `libc++_shared.so` (bundled by RN/Reanimated) was winning the jniLibs merge and lacks that symbol → `dlopen` fails. The libc++ source-dir set in the mpv-player **module** build.gradle can't win — Gradle merges **project-scope (app)** jniLibs *ahead* of libraries/AARs. Added a config-plugin `withMpvAndroidLibcxx` that appends the app's `build.gradle` with an app-scope `jniLibs.srcDir` pointing at the module's extracted libmpv `libc++_shared.so` (+ `pickFirst` + the `extractMpvLibcxx` merge dependency), so libmpv's newer libc++ wins. Mirrors `.refs/plezy`'s app-module setup, adapted to Expo's generated `app/build.gradle`.

## [0.8.13] - 2026-07-24

### Fixed

- **Android app crashed at startup — `Failed resolution of … AnyTypeCache` in `DomWebViewModule`.** A transitive `@expo/dom-webview` resolved to **57.0.1** (SDK 57) — a wildcard `*` peer + pnpm's auto-install-peers grabbed `latest`, overriding expo@55's `^55.0.6` — while the app runs `expo-modules-core@55`. The 57.x DOM-webview Android module references `expo.modules.kotlin.types.AnyTypeCache` (added in core 56), which core 55 doesn't have → `ClassNotFound` at module registration, killing app launch. (iOS didn't hit it — the reference is Android-Kotlin-specific.) Pinned `@expo/dom-webview` to **55.0.6** (the SDK-55 line) as a **direct dependency of tv-native** — a pnpm root `overrides` entry alone wasn't enough (auto-installed peers ignore overrides), but a direct dep forces the app's tree to 55.0.6. We don't use Expo DOM Components; this just version-matches the transitive module to core 55.

## [0.8.12] - 2026-07-24

### Fixed

- **Android build failed at the libmpv AAR download — `Could not find method exec()`.** Gradle 9.0 removed the `exec {}` closure from task actions (`doLast { exec {...} }`), which the mpv-player android `downloadLibmpv`/`extractMpvLibcxx` tasks used (ported from plezy's older-Gradle script). Rewrote both as the **`Exec` task type** (`tasks.register('…', Exec) { commandLine … }`) — the Gradle-9-native way to run `curl`/`unzip`. These tasks run in the pre-build phase (before compilation), so the Kotlin *still* hasn't compiled — the next Android build remains the first real validation of the mpv engine + key-input.

## [0.8.11] - 2026-07-24

### Fixed

- **Android build died at Gradle configuration — `'android.defaultConfig.versionName' is not defined`.** Gradle 9 / newer AGP requires `versionName`/`versionCode` in a library module's `defaultConfig` (the stock Expo modules set them). Our `mpv-player` android `build.gradle` set only `minSdkVersion` there (redundant — the `expo-module-gradle-plugin` already applies `minSdk 26` from the app's `expo-build-properties`), and `key-input` set none. Added `versionCode 1` + `versionName "0.0.0"` to both and dropped the redundant `minSdkVersion` from mpv-player. Configuration-only fix — the failing build died *before* any Kotlin compiled, so the next Android build is still the real first validation of the mpv engine + key-input Kotlin. (Separately: the **tvOS `development-tvos-sim` compile-check build SUCCEEDED** — the whole tvOS toolchain compiles.)

## [0.8.10] - 2026-07-24

### Added

- **Android hardware-key input (`packages/key-input/android`) — first implementation (pending build validation).** The Kotlin twin of the iOS GCKeyboard module: it wraps the Activity's `Window.Callback` (via Kotlin interface delegation, so all other callbacks pass through) and intercepts `dispatchKeyEvent`, emitting the same semantic `onKey {key, digit}` the JS dispatcher consumes. It **only** consumes the keys `useTVEventHandler` doesn't deliver — **digits** (0–9 + numpad) and **channel up/down** (`CHANNEL_UP/DOWN` + `[`/`]`/`=`/`-` for a Bluetooth keyboard) — and lets D-pad/OK/Back fall through, so there's **no double-dispatch** on the TV build. Enables channel-number entry + CH± from a BT keyboard / number remote on Android TV / Fire TV. Registered via `expo-module.config` android; degrades gracefully until compiled. Validated on the next Android build.

## [0.8.9] - 2026-07-24

### Added

- **tvOS compile-validation profile.** `development-tvos-sim` EAS profile (`EXPO_TV=1` + the fork env + `ios.simulator: true`) — an unsigned tvOS **Simulator** build used purely to **validate that the tvOS target compiles** before Apple TV hardware is on hand. Shakes out any tvOS-specific build snags early (config-tv retargeting to tvOS, MPVKit's tvOS product link via the app-target SPM plugin, tvOS-only compile errors) so the eventual `development-tvos` **device** build is green when a physical Apple TV arrives. Note: it won't *run* on an Intel Mac (the arch dead-end from v0.8.8) — it's a "does it build" check, not a runtime test.

## [0.8.8] - 2026-07-24

### Added

- **tvOS (Apple TV) device build profile.** `development-tvos` EAS profile — `EXPO_TV=1` + the fork's `REACT_NATIVE_NODE_MODULES_DIR`/`RCT_HERMES_V1_ENABLED` env (`buildReactNativeFromSource` carries from app.json). It's a **device** dev-client build (no `ios.simulator`) for a physical Apple TV, whenever the new model lands.

### Decision — Intel-iMac tvOS Simulator is deliberately skipped

- Not a viable path for this app: (1) EAS builds on Apple-Silicon workers and a Debug simulator build defaults to **arm64-only**, which won't launch on an Intel Mac's sim without forcing a universal build via a Podfile config plugin — and even then **Hermes-for-tvOS** must ship an x86_64 simulator slice (unverified; would only surface *after* a ~40-min from-source build); (2) mpv's Metal/GL rendering in the tvOS Simulator is unreliable regardless of arch, so it likely can't exercise playback anyway. MPVKit itself *does* ship x86_64 tvOS-sim slices (verified). **tvOS testing = the physical Apple TV** (arm64 device build — no arch fight, mpv works).

## [0.8.7] - 2026-07-24

### Added

- **Android / Android TV / Fire TV build config for tv-native.** `expo-build-properties` now sets `android.minSdkVersion: 26` (the `libmpv-android` AAR's floor; the Fire TV Stick 4K Max is API 30, well above). New EAS profiles: **`development-android`** (tablet dev client) and **`development-androidtv`** (`EXPO_TV=1` → `config-tv` emits the leanback manifest + banner + `LEANBACK_LAUNCHER` intent for the Android TV emulator + a sideloaded Fire Stick). The first Android build compiles + validates the v0.8.4 Kotlin mpv engine. Key-input stays inert on Android (graceful, via `requireOptionalNativeModule`) until its Kotlin `onKeyDown` lands — D-pad still works via `useTVEventHandler`.

## [0.8.6] - 2026-07-24

### Added

- **Device capability overrides ported to tv-native (Settings → Device) — a faithful port of the tv-web page.** Per-codec toggles (video / audio / container) that override the server's measured caps + platform quirks. Each row shows the effective on/off `Toggle` + a `Pill` (Override / Forced) + a status line (Measured / Known-issue / Overriding); tapping flips it instantly (optimistic cache update) and collapses back to *clearing* the override when the choice matches the diagnostic default; a **Reset to diagnostic** row appears when any override is set; recent playback issues are listed for context. Same 2-column column-major grid + toggle logic as tv-web, wired to the existing `GET/POST /api/v1/device/caps` + `/reset` endpoints via new `api.ts` functions + types. So the v0.8.5 AV1 auto-transcode is now **visible and overridable** here, and any codec that misbehaves per-platform (Android / Fire TV / tvOS) is one toggle away. JS-only — hot-reloads, no rebuild.

## [0.8.5] - 2026-07-24

### Fixed

- **AV1 now auto-transcodes on the native mpv clients (device quirk) — fixes an iPad playback crash.** tv-native's mpv (MPVKit) has no reliable hardware AV1 path; it software-decodes AV1 via dav1d, which **null-crashes the decode thread** on iPad/Apple TV (confirmed: "Howl's Moving Castle", mkv/av1/opus → `EXC_BAD_ACCESS` in `ff_libdav1d_decoder` right after the first frame). AV1 is now in the video quirk table **scoped to platform `ios`**, so `getDeviceNativeCaps` drops it from the credited native set and the server transcodes AV1 → H.264 (no direct-play, no crash). The quirk tables are now **platform-scoped** off `TvDevice.platform`: a quirk with no `platforms` applies everywhere (VP9/DTS unchanged — still global), one with `platforms` only to those clients — so the C2 (hardware AV1) and Android (MediaCodec) aren't needlessly transcoded. Server-side only; no app rebuild.

### Required restart

- The dev server (`bun --hot`) may need a manual restart to pick up the `packages/api` change; then re-tune an AV1 channel — it now resolves to an HLS transcode instead of crashing.

## [0.8.4] - 2026-07-24

### Added

- **Android mpv engine (`packages/mpv-player/android`) — first implementation (pending first-build validation).** The Kotlin twin of the iOS mpv module. `MpvCore` binds the `dev.jdtech.mpv.MpvPlayer` **coroutine** API from the prebuilt `edde746/libmpv-android` AAR (v1.0.7, downloaded at build time via a gradle task; ships arm64-v8a/armeabi-v7a/**x86_64** so the emulator's covered), rendering into a `SurfaceView` via the Android `gpu` VO with MediaCodec hw decode — options/`loadfile … -1 start=`/seek/keep-open-EOF all mirrored from the Swift core. `MpvPlayerView` (ExpoView + SurfaceView, load coalescing, surface lifecycle) and `MpvPlayerModule` expose the **identical** props/events/functions as the Apple module, so the platform-agnostic JS (`requireNativeView("MpvPlayer")` + `use-tv-player`) drives it unchanged. Registered via the `android` platform in `expo-module.config.json`; includes the `libc++_shared` dedupe. Not yet compiled — gets validated on the first Android EAS build.

## [0.8.3] - 2026-07-24

### Fixed

- **iPad dev build crashed immediately at launch — a dyld symbol mismatch in react-native-tvos's Hermes.** The app built clean but died on open with `Symbol not found: facebook::hermes::inspector_modern::RuntimeAdapter::~RuntimeAdapter()`, referenced by the prebuilt `React.framework`, expected in `hermesvm.framework`. Cause: Expo SDK 55 ships a **precompiled React Native core** (built for stock Hermes's legacy chrome inspector), but react-native-tvos ships its own **Hermes V1** (`useHermesV1` defaults on in SDK 55), which dropped the legacy `inspector_modern` symbols — so the precompiled React references a symbol its Hermes doesn't export. Fixed with `expo-build-properties` `ios.buildReactNativeFromSource: true`, which builds React core from source against the *actual* Hermes V1 (the dead inspector reference is guarded out and never emitted). `RCT_HERMES_V1_ENABLED=1` (v0.8.2) stays — still required for the worklets podspec. Hermes itself is NOT rebuilt (the prebuilt `hermesvm` stays used), so the build-time hit is bounded (~1.5–2×). This is the react-native-tvos + Expo-precompiled-RN incompatibility (issue #697 family); the fork ships no Expo-compatible precompiled `React.xcframework`, so RN core must build from source.

## [0.8.2] - 2026-07-24

### Fixed

- **EAS iOS build failed compiling `react-native-worklets` against the react-native-tvos prebuilt Hermes** (the next snag after the v0.8.1 pod-install fix; MPVKit itself compiled + linked fine). `WorkletHermesRuntime.h` includes the legacy Hermes chrome-inspector header (`hermes/inspector-modern/chrome/Registration.h`) in Debug when `HERMES_V1_ENABLED` is undefined — but the react-native-tvos prebuilt Hermes xcframework doesn't ship those legacy debugger headers (stock RN's does), so the include (and the `chrome::enableDebugging/disableDebugging` calls right after) can't resolve. Fixed by setting `RCT_HERMES_V1_ENABLED=1` in the EAS `development` env — `RNWorklets.podspec` translates it to a target-scoped `-DHERMES_V1_ENABLED`, short-circuiting the legacy-debugger guard. Verified against the worklets 0.7.4 source that *every* `HERMES_V1_ENABLED` reference is a negative guard (`!defined`), so the flag only skips the legacy debugger path and activates no V1-only code — safe on RN 0.83's (V0) Hermes. Debug-only; the same env carries to the future tvOS profile.

## [0.8.1] - 2026-07-24

### Fixed

- **EAS iOS build broke at `pod install` after the `react-native-tvos` alias (v0.8.0).** `react-native-gesture-handler`'s podspec detects the RN version via `require.resolve('react-native/package.json')`, which pnpm **realpath-resolves to the physical `react-native-tvos` directory** — so it finds no `react-native` folder there and falls back to the unset `REACT_NATIVE_NODE_MODULES_DIR` env var, crashing with `no implicit conversion of nil into String`. Fixed by setting `REACT_NATIVE_NODE_MODULES_DIR` (the escape hatch RNGH's own error message documents) to the app's `node_modules` — where a `react-native` symlink *does* resolve — in the EAS `development` profile env. (The `[Expo-precompiled] … xcframework not found` lines in the same log are a harmless 404 cache-miss for the `0.83.6-0` fork version; those modules just build from source.)

## [0.8.0] - 2026-07-24

Opens the **v0.8.x multi-platform native arc** — extending `apps/tv-native` from iPad-only to Android / Android TV / Fire TV / Apple TV. Full plan + blueprint in the tv-native plan §9.

### Changed

- **tv-native switched to the `react-native-tvos` fork** (`react-native` → `npm:react-native-tvos@0.83.6-0`). This is the load-bearing foundation for every TV target: Meta's stock React Native **cannot build tvOS at all**, and the fork is a drop-in **superset** that produces the identical iPad/Android app when `EXPO_TV` is off, and adds the TV focus + leanback support when it's on. The input dispatcher already **feature-detects** `useTVEventHandler` (`dispatcher.ts:78`), so nothing changes for the existing iPad build — the fork only *adds* TV capability, it doesn't remove iPad. Verified: `react-native` resolves to `react-native-tvos@0.83.6-0`, the whole dep graph re-pegged to it, typecheck clean. Takes effect on the next native dev-client rebuild (gate: confirm the iPad still direct-plays before any TV/Android work lands on top).

## [0.7.41] - 2026-07-24

### Changed

- **Feature-panel and channel-surf auto-hide now ride the shared input-activity notifier.** Both auto-hide timers previously reset only on key events via their own local handlers, so on iPad a touch (tapping controls) wouldn't reset them and the chrome could vanish out from under you mid-interaction. Both now subscribe to the same `onInputActivity` signal the mini-idle timer uses, so ANY input — a hardware key, the TV remote, or a touch — resets them. Back behavior is unchanged, still handled independently by each component's key layer (info → picker → close for the panel; close for surf), so the timer unification can't affect it.

## [0.7.40] - 2026-07-24

### Added

- **Mini-player idle → auto-expand to full (tv-web parity).** When a channel is docked in the mini feed and there's no input for 60s, it auto-expands to full-screen (on a TV the screensaver would otherwise blank everything but the tiny video). The `MINI_IDLE_FULLSCREEN_MS` constant existed but was never wired; now it is, via a shared **input-activity notifier** in the dispatcher — the timer resets on ANY input: a dispatched key (`dispatchKey` → `notifyInputActivity`) or a touch (a root `onTouchStart` → `notifyInputActivity`). (The feature-panel auto-hide still uses its own local key-reset for now — unifying both onto the shared notifier is a follow-up.)

## [0.7.39] - 2026-07-24

### Fixed

- **Intermittent "stuck at the end of a program" (no bumper).** mpv's `keep-open` holds the last frame at EOF and stalls the position clock, so the tick's rollover check (`effective >= slotEnd − 0.25s`) sometimes missed the boundary and left playback frozen at the program's end instead of rolling into the bumper — intermittently, depending on how close the stall landed to the threshold (some episodes rolled fine, some stuck). Fixed two ways: `onEnd` now rolls to the next slot on the mpv EOF event with a 2s tolerance (tv-web's `ended` handler) for when mpv *does* emit it; and a **stall backstop** in the tick — near the slot end, if the position clock stops advancing while playing (not paused/buffering) for ~1.5s, the media has hit EOF, so roll into the bumper. Between the two the boundary can't slip through. (`goTo`'s in-flight guard dedupes them.)

## [0.7.38] - 2026-07-24

### Fixed

- **Subtitles no longer show unless selected.** mpv auto-selects a media's embedded/forced subtitle track by default (`sid=auto`), so subs appeared even though none were chosen. In tv-native subtitles are delivered by server-side burn-in (selecting them re-resolves to a transcode that hardcodes them into the video), so mpv must never render a text sub track itself — now defaulted to `sid=no` / `sub-auto=no` via the player's mpv options. (Selecting subtitles still burns them in as before.)

## [0.7.37] - 2026-07-24

### Fixed

- **Mini player now docks bottom-aligned without needing a focus.** The slot's screen rect was measured on a single `requestAnimationFrame` that could fire before the guide's ancestors finished positioning — so it captured a top-ish rect, and only a focus re-render re-measured it into place. Now it re-measures across a couple of frames + a short settle delay and on the outer container's `onLayout`, so it lands correctly on dock.
- **Green "to focus" banner is hidden on iPad.** The green-button hint under the mini feed is an LG-remote affordance; it's now gated on `Platform.isTV`, so on iPad/touch (where you just tap the mini to focus) the bottom banner no longer shows. It still appears on actual TV builds.

## [0.7.36] - 2026-07-24

### Fixed

- **Mini-player dock is now a true 16:9 box, bottom-aligned to the progress bar.** The featured-panel mini slot used a fixed width + `alignSelf: stretch`, so its aspect depended on the info-column height and the video ended up letterboxed inside it (floating, not filling to the bottom). Now the dock is an outer full-height container that **bottom-aligns** a **16:9 inner box** (fixed width → `aspectRatio: 16/9` derives the height, no circular layout). The measured slot is exactly 16:9, so the video fills it cleanly and its bottom lines up with the progress bar beside it.

## [0.7.35] - 2026-07-24

### Changed

- **tv-native hides the iPad status bar during full-screen playback.** The time/battery/status bar now fades away while a channel is full-screen (for a clean 10-foot frame) and restores in the mini player or when closed — `setStatusBarHidden` keyed on the player layout, so it doesn't fight the app's light status-bar style elsewhere.

## [0.7.34] - 2026-07-24

### Fixed

- **Scrubber snapping to 0:00 on a quality change — the actual root cause.** The DVR clock is `startS + offset + (currentTime − playStartCurrentTime)`, so the baseline `playStartCurrentTime` must be the first position of the NEW stream. tv-native anchored it on `onProgress` with no guard, so on a quality switch a **stale `onProgress` from the outgoing stream** (fired after the current program was swapped but before the new source loaded) anchored the new program's baseline to the wrong position — and it never re-anchored, so the scrubber sat at the program start. Fixed with tv-web's per-load guard, adapted to mpv: a baseline **barrier armed only after the new source's `onLoad`**, so stale cross-stream progress can't anchor it; then the first real position of the new stream anchors the clock (mode-agnostic — works for direct and any HLS timestamping). Offset playback, DVR seek, and bumper rollover paths are unchanged.

## [0.7.33] - 2026-07-24

### Fixed

- **Scrubber jumped to the program start when switching to a transcode (HLS) quality.** The effectiveTime baseline was anchored in `onLoad` (before playback actually started) using whatever position was seeded, and mpv can timestamp a server-positioned HLS stream either from 0 or from the offset — so the anchor was wrong and the DVR clock computed the program start (playback itself was fine). Now matches tv-web's model: **direct-play** anchors deterministically at the offset (we pass `loadfile start=offset`), while **HLS/http** anchor to the *first real `onProgress` position* — wherever the stream actually opens, mode-agnostic. Supersedes the v0.7.32 seed for the transcode case.

## [0.7.32] - 2026-07-24

### Fixed

- **Scrubber snapped to the program start after a quality change.** Switching quality (e.g. 720p → Original) re-resolves the program at the current spot — playback stayed correct, but the DVR scrubber jumped to the beginning of the program. Cause: the direct-play reload seeded `positionSecRef = 0`, so in the window between `onLoad` (which anchors the baseline at `offset`) and mpv's first `onProgress` (which reports `offset`), `currentEffective` computed `startS + offset + (0 − offset) = startS`. Now the direct reload seeds the position at the offset (matching where playback opens), so the clock is consistent immediately. Also removes the same transient on tune-in.

## [0.7.31] - 2026-07-24

### Fixed

- **Channel-number entry slide direction.** Same reversed-Reanimated-naming fix as the full chrome: the top-center number card was using `FadeInDown` (which rises from below); switched to `FadeInUp` so it drops **down from the top** and exits upward, matching tv-web and the channel chip.

## [0.7.30] - 2026-07-24

### Fixed

- **Full-chrome open animation direction.** The feature panel was entering from *above* (settling down) instead of sliding up from the bottom. In this Reanimated build `FadeInUp` starts above and moves down (the reverse of the name), so the enter/exit were mismatched. Corrected: the panel uses `FadeInDown`/`FadeOutDown` (slides up in, down out) and the chip uses `FadeInUp`/`FadeOutUp` (down from the top in, up out).

## [0.7.29] - 2026-07-24

### Changed

- **Full-player chrome now slides in like tv-web.** The chip and feature panel were popping in with no animation. Wrapped them in Reanimated entrances (250ms, matching tv-web's Framer transitions): the top-right channel **chip slides down** from `y:-30` (`FadeInDown`), and the bottom **feature panel slides up** from `y:48` (`FadeInUp`), with matching exits. The panel's `LinearGradient` now fills the animated wrapper. (The bottom gradient scrim was already present; tv-web has no top gradient scrim — just the chip — so none was added.)

## [0.7.28] - 2026-07-24

### Changed

- **Audio/Subtitles/Quality picker is now a centered glass modal with full D-pad/keyboard nav.** Replaced the anchored dropdown (which had layout + navigation problems) with a centered modal styled like the channel-number entry — `expo-blur` glass, border, generous padding, a title, and a scrollable list. It's fully navigable: **up/down** move an accent-filled focus row (auto-scrolling to keep it in view), **OK** selects, **Back** or an outside tap closes; touch taps a row directly. The current selection is check-marked. Conditionally-mounted Modal (no stacking).

## [0.7.27] - 2026-07-24

### Fixed

- **Audio/Subtitles/Quality dropdown polish + close behavior.** The v0.7.26 dropdown had a disconnected trailing check, cramped rows, and only closed on select/button-tap. Reworked: each row has a **leading check slot** (check beside the label, labels aligned), generous padding, intrinsic width, and a scrolling max-height. It now renders in a transparent, conditionally-mounted full-screen Modal so a **tap anywhere outside closes it** (the menu claims its own touches), and **Back closes it** via the panel's key layer (GCKeyboard is app-wide, so it fires under the Modal). Conditional mount avoids the visible-toggle stacking the original Modal had.

## [0.7.26] - 2026-07-24

### Fixed

- **Full-player Audio/Subtitles/Quality menus no longer stack, and look native.** They used a full-screen RN `<Modal>` (a centered dark box) which, on iOS, could re-present before the previous one finished dismissing — leaving menus stacked behind each other on close. Replaced with an **anchored glass dropdown** that opens upward from its own selector circle (tv-web's `side="top" align="end"` — right-offset so Audio/Subtitles/Quality each align under their button), Aurora-styled to match the sidebar glass + Info chips, with the current option accent-tinted and check-marked. No native Modal → no stacking; an outside tap or Back closes it.

## [0.7.25] - 2026-07-24

### Changed

- **tv-native full-player Info view: the Playback readout now matches tv-web.** The delivery/streaming info was a single plain-text line (`MODE · container/codec/codec · connection`); it's now the same **chip row** as tv-web — an accent-tinted mode chip (Direct Play / HLS Transcode / Progressive Transcode), gray container + video/audio codec chips each carrying Plex's copy-vs-transcode call (orange on transcode), and a connection chip (Local / Remote / Relay). Ported `DeliveryReadout` faithfully.

## [0.7.24] - 2026-07-24

### Fixed

- **Collapsed sidebars expand on a background tap again.** v0.7.23 made the collapsed circles individually pressable but dropped the sliver's tap-to-expand target, so tapping the sidebar background no longer expanded it. Restored: the collapsed sliver is an outer tap-to-expand `Pressable`, with each circle a nested `Pressable` that captures its own tap (so a direct button press activates and a tap on the gaps/background expands). Applies to both the guide sidebar and the settings rail.

## [0.7.23] - 2026-07-24

### Fixed

- **tv-native collapsed sidebars respond to a direct tap.** Both the guide sidebar and the settings rail wrapped their collapsed sliver in a single tap-to-expand target, so the circular buttons did nothing until you expanded first. Now each collapsed circle is individually pressable: guide **Guide/Settings/Account** fire their action directly and the **filter** circle expands the sliver (there's no single lens to apply from collapsed); every settings **category** circle navigates directly.

## [0.7.22] - 2026-07-24

Fixes tv-native bumper playback + brings the between-programs interstitial to tv-web parity.

### Fixed

- **Playback resumes after a bumper.** mpv's `pause` is a persistent property that survives `loadfile`/`seek`; the bumper paused the video and nothing resumed it, so every program after a bumper — the bumper→next rollover, a seek that rolls back into the current program, a seek to a previous program — painted its first frame but stayed paused. Now `viewRef.play()` is called on program entry (in `onLoad` for fresh loads and after the same-media DVR seek), mirroring tv-web's `tryPlay(video)` on every load.

### Changed

- **Bumper card now matches tv-web.** Replaced tv-native's plain text-on-solid-background interstitial with a faithful port of `bumper-card.tsx`: a `react-native-svg` **CountdownDonut** (accent ring draining from full to empty, seconds centered, smooth local clock), a blurred cover-art background (`Image blurRadius`) + gradient scrim, and "Coming up next" + title + episode line. Adds the **compact variant** (small donut + "Up next", no art) for the mini feed — previously the mini just shrank the plain block.

## [0.7.21] - 2026-07-23

**The tv-native D-pad + channel-number entry are now drivable on iPad — via a hardware keyboard.** The input dispatcher and zone machine were ported from tv-web but had no key source on iPad (`useTVEventHandler` is TV-only; iOS doesn't deliver keyboard events to apps without GameController). Confirmed working on-device: the full guide navigates by arrow keys and channel numbers tune.

### Added

- **`@ChannelGuide/key-input`** — a small Expo native module that reads Apple's **GameController `GCKeyboard`** app-wide (no first-responder juggling, doesn't interfere with text fields) and maps physical keys to our semantic vocabulary: arrows → D-pad, Enter/Space → OK, Esc/Delete → Back, `[`/`-` → channel-down, `]`/`=` → channel-up, number row + keypad → digit. Emits `onKey`; wired as `useHardwareKeyInput()` alongside `useTVInput()`, and `dispatchKey` now carries the digit. This makes the D-pad zone machine + number entry work from any attached Bluetooth/Magic keyboard or keyboard-equipped remote. Stock system framework only — no SPM/linking. Android/Fire TV get the same JS contract via `onKeyDown` next.

### Changed

- **Channel-number entry now matches tv-web exactly.** Replaced the iPad-only stopgap (a persistent bottom-right keypad FAB + modal) with a faithful port: typing a digit slides a **top-center glass card down** (Reanimated + expo-blur), **OK** commits (tunes, or flashes red if the channel doesn't exist), **Back** cancels, an arrow passes through to navigation, inactivity dismisses without tuning, and **CH▲/▼** step the lineup.

## [0.7.20] - 2026-07-23

**mpv now direct-plays the Plex library on iPad, at the live offset.** The `@ChannelGuide/mpv-player` engine (v0.7.19) built after a long EAS link fight, but no direct-play channel would start. This release lands the fixes that make it actually work end to end — confirmed on-device tuning real channels (4K HEVC/TrueHD/DTS-MA direct-play, opening at the live offset).

### Fixed

- **THE channel-playback bug — mpv 0.38+ `loadfile` signature.** mpv 0.38 inserted an `index` argument: `loadfile <url> <flags> <index> <options>`. We sent `["loadfile", url, "replace", "start=<offset>"]`, so `start=` landed in the index slot → malformed command → **no file loads and mpv emits zero events**. Every direct-play channel (which opens at a live offset via `start=`) silently failed; HLS/offset-0 channels took the 3-arg path and played — the exact split the PlaybackLog watchdog revealed. Also explains the "channel switch from the mini player keeps playing the old channel" symptom: the malformed `replace` never executed. Fix: pass the `-1` (default) index, matching the plezy reference's `loadfile <uri> replace -1 <options>`. (`packages/mpv-player/ios/MpvCore.swift`)
- **MPVKit link — duplicate MoltenVK / missing Libass.** Resolved the EAS link wall: RN's `spm_dependency` merges MPVKit's static libs into the pod (MoltenVK force-loads → ~545 duplicate `_vk*` symbols) and only pulls a shallow closure (drops transitive `Libass` → `_ass_add_font`). The **app target is now the sole owner** of MPVKit (`app.plugin.js` adds the SPM product to the app's native target — full transitive closure, one copy); the pod compiles `import Libmpv` against **vendored libmpv headers** (`ios/libmpv/`) and links nothing. (`useFrameworks: dynamic` is a dead end under SDK 55's static ExpoModulesCore.)
- **Diagnostic freeze (OOM).** The capability diagnostic cycled one reused mpv instance through 49 mixed-codec 4K clips, stacking VideoToolbox decoder sessions/surfaces until the app froze (~clip 8). Now each clip runs in a fresh instance that is destroyed afterward (mount `MpvPlayerView` only while a clip is under test). Confirmed: all 49 complete.
- **onLoad robustness** — also emit the loaded dimensions on mpv's `playback-restart` (a frame is decoded by then), fixing a first-frame-painted-but-`0x0` case where `onLoad` never fired.

### Added

- **PlaybackLog watchdog in tv-native** (ported from tv-web): post one row ~6s after every load regardless of `onLoad`/`onError`, capturing `firstFrame`/`buffering` so a stuck load still records ground truth — read with `apps/server/scripts/show-play-log.ts`. Plus `BUFFERING`/`FIRST-PROGRESS` Metro logging. This is what pinpointed the `loadfile` bug.

## [0.7.19] - 2026-07-23

### Added

- **`@ChannelGuide/mpv-player` — a new Expo native video module powered by mpv (libmpv/MPVKit), a full replacement for both AVPlayer (expo-video) and libVLC (expo-libvlc-player).** mpv is ffmpeg-based, so it **estimates HTTP seeks**: `loadfile … start=<offset>` opens a live channel AT its offset via a byte-range request instead of the sequential read-to-offset that made libVLC take ~40–60s on un-indexed Plex MKVs (proven on-device via the `[vlc]` timeline: `buffering 0%` for the whole delay). It direct-plays every codec/container and handles HDR/Dolby-Vision. Renders via MPVKit's `avfoundation` VO into an `AVSampleBufferDisplayLayer` with `hwdec=videotoolbox`; core ported from plezy's proven `MpvPlayerCoreBase`. Targets **iOS · iPadOS · tvOS** now (MPVKit SPM + a config plugin that wires it into the Xcode target — the Expo equivalent of plezy's `wire_mpv.rb`); **Android / Android TV / Fire TV** (libmpv-android) is structured in and implemented next. The JS contract is a **seekable media element** (`source`/`startTime`/`seek(seconds)` + `onLoad`/`onProgress`/`onBuffering`/`onError`) so the proven tv-web/tv-native effectiveTime + DVR logic maps onto it 1:1.

### Changed

- **tv-native playback swapped from libVLC → mpv.** `use-tv-player`, `player-context`, and the capability `diagnostic` now drive `<MpvPlayerView>`: the clock reads `onProgress` currentTime (seconds, absolute — like an HTML `<video>`, matching tv-web); direct-play opens at the offset via `startTime`; DVR seeks are a fast `seek()`; PlaybackLog + heartbeat retained. Removed the libVLC-era workarounds (`time`-prop, `--input-fast-seek`, the forceHls threshold) — mpv seeks like a real media element, so none are needed.

### Notes

- **Needs a fresh EAS development build** (native module + MPVKit SPM). The config-plugin SPM wiring (`app.plugin.js`) is the piece most likely to need a build-cycle to land, and the Swift compiles for the first time on that build. libVLC (`expo-libvlc-player`) + `expo-video` remain installed during the transition; they'll be removed once mpv is proven on-device. Why this route: libVLC couldn't byte-range-seek un-indexed MKV over HTTP (confirmed in the library's own source — instance-only options aren't reachable through the wrapper), and the C2's native player estimates the seek where libVLC won't; on iPad there's no native MKV path, so mpv (which estimates like the C2) is the fix.

## [0.7.18] - 2026-07-23

### Changed

- **tv-native upgraded to Expo SDK 55 (React Native 0.83.6 / React 19.2) — the groundwork for the libVLC video engine.** The SDK-54 pin only ever existed because Expo Go can't load a newer SDK; committing to a **development build** removes that ceiling, so the project moves to **SDK 55** — the exact pair `expo-libvlc-player` is built against (Expo ~55.0.27 / RN 0.83.6). `expo install --fix` realigned every native module (Reanimated 4.2.1, worklets 0.7.4, screens 4.23, gesture-handler 2.30, svg 15.15, expo-router 55, expo-video 55, React 19.2). `expo-doctor` is **19/19** and typecheck is green. SDK-55 config migration: `newArchEnabled` dropped from `app.json` (new arch is the SDK-55 default), Metro `watchFolders` now appends to Expo's defaults instead of replacing them.

### Added

- **`expo-dev-client` + `expo-libvlc-player` (7.1.6)**, with the libVLC config plugin wired into `app.json`. libVLC direct-plays the full container/codec matrix (MKV · HEVC · E-AC3 · DTS · TrueHD) the way the Plex app does — the root fix for both the capability diagnostic (AVPlayer can't open the raw cap-media clips) and transcode-everything playback on iPad.
- **`eas.json`** with `development` (internal-distribution dev client), `preview`, and `production` build profiles, and **eas-cli** for the cloud iOS build (no Mac needed).

### Notes

- **Toolchain/dependency release — no behavior change yet.** libVLC is installed and will compile into the dev build, but the playback code still runs on expo-video; the swap to the event-driven `LibVlcPlayerView` (`use-tv-player.ts` + `diagnostic.tsx`) follows once the first iOS development build proves the toolchain. `LibVlcPlayerView` is a ref-based view (`source` prop, `onTimeChanged`/`onEncounteredError`/`onBuffering` events, ms-based `seek`), so the swap re-works `use-tv-player`'s internals while keeping its `status`/`controls` interface unchanged for the chrome. Next: `eas login`/`init`/`device:create` → `eas build --profile development --platform ios`. Plan: `.plans/tv-native.md`.

## [0.7.17] - 2026-07-23

### Added

- **tv-native: channel-number entry + CH up/down (the last chrome piece).** tv-web types channel numbers on the LG remote's number pad; tv-native has none (the Apple TV / RN-TV remotes have no digits, and `useTVEventHandler` doesn't deliver them), so the input path is adapted for touch: an **on-screen numeric keypad** (opened by a floating # button on the guide + full player) types a channel number → tunes it (flashes if it does not exist), with the typed buffer shown in a top-right slide-in; and **CH up/down buttons** float on the full player (a while-watching gesture) stepping the ordered lineup via the existing in-flight-locked `channelStep`. The dispatcher still carries `digit`/`chUp`/`chDown` semantic keys so a future native key path (a number-remote Android TV, or a hardware keyboard) or a webOS build feeds the same handlers.

### Notes

- Completes the ported chrome. The remaining work is the **libVLC video swap** (`expo-libvlc-player`, for direct-play parity), which needs a **development build** (Android free / iPad Apple-Dev + EAS) — a surgical swap of the video element inside the finished chrome. Session summary: `.docs/summaries/2026-07-23-input-controller-and-tv-native.md`; plan: `.plans/tv-native.md`.

## [0.7.16] - 2026-07-23

### Added

- **tv-native: channel surf + full-chrome parity fixes (chrome increment 3).** The channel-surf carousel (◄/► from the closed chrome): a horizontal FlashList of channel tiles (cover art, live progress, channel/program, the focused tile scaled + accent-bordered, a "Watching" flag on the current channel), opening centered on what you are watching; ◄/► move (wrapping), OK tunes, Back closes, ~12s auto-hides; top MODAL layer + touch.
- **Full chrome now matches tv-web exactly:** the missing **top-right glass channel chip** (Tv icon + number + name), and the control row rebuilt to the real layout — five **pill** buttons (Play/Pause · Restart · Channel Surf · Info · Continue Watching/Jump to Live) then the three **circle** selectors pushed right (Audio · Subtitles · Quality, with SlidersHorizontal). Seek is ±10s.

### Notes

- Channel-number entry is the last chrome increment; then the libVLC video swap.

## [0.7.15] - 2026-07-23

### Added

- **tv-native: the full-screen feature panel (chrome increment 2), ported from tv-web.** Expanded `use-tv-player` with the DVR — `currentEffective`, `goTo(anyTime)` (rewind out of the current program through the bumper into the previous one), the multi-segment `buildScrubber`, controls (pause / seek ±15s / jump-to-live / restart), tracks, and paused/delivery status. The `FeaturePanel` UI on top: the multi-segment scrubber (per-slot segments, accent fill to the thumb, red LIVE marker, position / −behind labels), the control row (Pause · Restart · Surf · Info · Live · Audio · Subs · Quality), the Info view (year/rating/genres/cast/directors/studio + delivery readout), and Audio/Subtitle/Quality pickers. Quality/track changes re-resolve `/media` at the same spot.
- Wiring: OK/tap opens the panel, Back peels it (info → picker → close) and returns to mini; the panel owns the keys while open (its own `useKeyLayer`), with row 0 (scrubber) ⇄ row 1 (controls) D-pad nav and touch on every control. A touch back-to-guide affordance for iPad.

### Notes

- Increment 2 of the chrome. Channel surf (◄/► from the closed chrome) and channel-number entry are the next increments; the surf button currently closes back to the video until then.

## [0.7.14] - 2026-07-23

### Added

- **tv-native: the persistent player (chrome increment 1), ported from tv-web.** Playback now lives at the root (`PlayerProvider` in the layout) so it survives guide↔watch navigation: tapping a channel plays it **full-screen**, Back drops it to a **mini feed** (still playing), Close stops it — one video, repositioned between full and mini with a Reanimated spring (no route change; the `/watch` route is retired). Mini feed: tap to focus → the two buttons (Full screen / Close) + the Sling-style green-button "to focus" hint. **CH▲/▼** steps the ordered lineup (clamped, behind the in-flight lock). Bumper "Up next" interstitial in both layouts. The guide tunes via `player.tune()`.

### Notes

- Increment 1 of the player chrome (the video engine stays expo-video for now; the libVLC swap is later and only replaces the video element inside this chrome). Next increments: the full feature panel (scrubber/DVR + controls + info), channel surf, and channel-number entry — each mounts into this host. The mini currently docks to a fallback position; exact featured-slot docking + the guide↔mini D-pad wiring come with those.

## [0.7.13] - 2026-07-23

### Added

- **tv-native: the capability diagnostic — measured profile → direct-play (fixes the buffering).** Ported from tv-web's `Diagnostic`: plays each capability-matrix clip through expo-video and records whether it reaches ready-to-play (decodes) or errors, posting per-device results to the server. Same flow + framed-video/progress appearance; the measurement adapts to native (AVPlayer/ExoPlayer expose no decoded-frame counts, so "reached readyToPlay without erroring" is the decode signal — which is what confirms iPadOS drops the un-decodable containers to HLS). Runs automatically on first sign-in / server switch (per-server done-flag), reports device info, `deviceId` + caps-done hydrated at startup.

### Changed

- **The player uses the measured profile instead of forcing HLS.** `/media` now gets this device's `deviceId`, so the server direct-plays what the device supports and only transcodes what it can't — no more transcoding everything (the cause of the constant buffering). Added mode-aware playback baseline: direct-play seeks to the offset, HLS/http start at the baked offset; `effective = startS + offset + (currentTime − baseline)` handles both.

## [0.7.12] - 2026-07-23

### Added

- **tv-native: native video plays — the player foundation (increment 1 of the player arc).** `expo-video` (AVPlayer/ExoPlayer, bundled in Expo Go) driven by the effectiveTime clock ported from tv-web's `use-tv-player.ts`: resolve a program → play at the right offset, derive the current slot from real playback position, and roll at program/bumper boundaries. A full-screen watch screen (`app/watch/[channelId]`) with `VideoView`, the bumper "Up next" interstitial, and minimal now-playing chrome. Ported the media/timeline REST API (`/media`, `/timeline`, `MediaInfo`/`TimelineSlot`, heartbeat/stop/endSession).
- HLS is forced for now so iPadOS plays reliably until the capability diagnostic provides a measured profile (AVPlayer can't direct-play most containers; the diagnostic is what confirms that and drops to HLS).

### Notes

- Increment 1 of the player. Next, layered with on-device iteration (the web hook is 745 lines built entirely on the HTML `<video>` + hls.js API — a different engine, so it ports in stages): the DVR scrubber + rewind, the full feature-panel chrome, the mini player, channel surf, channel-number entry, ch up/down, and the capability diagnostic.

## [0.7.11] - 2026-07-23

### Added

- **tv-native: the full settings system, ported at parity.** The master-detail shell (`app/settings/_layout.tsx`) with the sliver category rail (the guide's glass-circle treatment, slide + shadow) and the selected subpage; the same rail ↔ content zone machine as tv-web, driven by touch (tap the collapsed rail to expand, tap a category) and D-pad (rail ▲/▼ + OK / ► into content / Back to guide), with each page's options via a ported `useSettingsPage`. Ported primitives: `PageHeader`, `SettingRow` (focus ring), `SectionLabel`, `Pill`, `Toggle`.
  - **General**, **About** (app identity + version), **User** (the better-auth session card — avatar / name / email / role — + two-tap Sign out), **Server** (address + two-tap Change server → onboarding).
  - **Device** shows the device info strip; its measured playback capabilities + per-codec overrides + recent errors come with the player arc (they need the capability diagnostic — the one that confirms iPadOS drops to HLS). **Server's** media-connection / force-connection rows likewise arrive with the player (they need the Plex connection probe).

### Notes

- The two deferred sections (Device caps, Server media-connection) are gated on the capability diagnostic + connection probe, which are playback concerns — next arc, not a simplification. Everything else is full parity.

## [0.7.10] - 2026-07-23

### Added

- **tv-native guide: the unified zone machine (touch + D-pad), ported from tv-web.** The guide now runs the same grid ↔ rail ↔ sidebar state machine as tv-web, driven by **both** input methods:
  - **Touch:** tap to focus, tap the already-focused thing to activate — tap a program to focus it (the featured panel + highlight follow), tap it again to tune; tap a channel rail to focus it (the icon circle becomes the favorite heart), tap again to toggle favorite. Same intent D-pad expresses with move + OK.
  - **D-pad:** the aurora-grid key handler (grid: ◄/► browse programs, ▲/▼ change channel, ◄ off the first program → rail, OK → tune; rail: ◄ → sidebar, ▲/▼ change channel, OK → favorite; sidebar: ▲/▼ + OK), registered as a `useKeyLayer` on the ported input dispatcher — fires on the TV build via `useTVInput`, no-op on iPad.
- The rail's focus states now match tv-web (accent row highlight + inset bar, and the rail-focused heart affordance), and the sidebar takes D-pad focus (`focused`/`sel` → the ring on the selected circle).

### Notes

- One state, two inputs — sidebar expanded ⇔ `zone === "sidebar"`. Touch is exercisable on iPad now; the D-pad path is faithful and lights up on the tvOS / Android TV build.

## [0.7.9] - 2026-07-23

### Added

- **tv-native: the Aurora guide, ported for exact parity** — not a simplified lineup, the real thing. Faithful ports of tv-web's guide internals:
  - The **`vw` scaling system** (2560-design → dp via screen width), same constants (`CH_FRAC`, `ROW_FRAC`, `FEATURE_SCALE 0.76`, `WINDOW_MIN 180`, `LEAD_MIN 30`, sliver 92 / expanded 300).
  - The **featured panel** — tinted channel icon tile, number + name in accent, genres/tagline, title with S/E, the 4K/HD/HDR/audio gradient badges, year·rating·critic-star line, 2-line summary, time range + status + progress bar.
  - The **time-grid**: `TimeHeader` with the day label + 30-min ticks, and rows with the channel rail (icon circle / number / name, favorite heart) and absolutely-time-positioned program cells — the live cell carrying the two-tone accent gradient (`expo-linear-gradient`) + the on-air bar, selection outline, and the now-marker triangle.
  - The **sidebar**: the sliver + expand overlay system (Reanimated spring width matching Framer), the glass circle buttons, actions (Guide/Settings/Account) + the Filters stand-in that expands to the lenses (Favorites/Recents/packages in their tints).
  - The **GuideGhost** skeleton empty state.
  - Virtualization via **FlashList** (recycling — the RN equivalent of tv-web's `@tanstack/react-virtual`). Touch: tap a row to select (featured + highlight follow), tap again to tune; tap the Filters circle to expand the sidebar.

### Notes

- Ported blind (no iOS render on this Windows box), so appearance is faithful to the source styles but the last pixels get locked against a device screenshot — RN translates gradients/shadows/fonts slightly differently than CSS. Settings pages (the sliver-shell + subpages) and the player are the next ports; the current `/settings` routes are temporary stubs only so guide navigation resolves.

## [0.7.8] - 2026-07-23

### Changed

- **tv-native pinned to Expo SDK 54** (from the bleeding-edge 57 that `expo install` had defaulted to). SDK 57 is newer than any published Expo Go, so it couldn't load on a device at all; SDK 54 is what the current App Store Expo Go supports. Realigned via `expo install --fix`: React 19.1, React Native 0.81.5, expo-router 6, **Reanimated 4.1** (so the `react-native-worklets` Babel plugin stays correct), and the expo-router peer packages (expo-linking/constants/metro-runtime) pulled to their SDK-54 versions. No app-code changes — typecheck + `expo config` green.

## [0.7.7] - 2026-07-23

### Added

- **tv-native: both login options + onboarding, at parity with tv-web.**
  - **"Log in with a code"** now works — the better-auth device-authorization flow via the official **`@better-auth/expo`** client (pinned to `1.6.23` to match the server), same `authClient.device.code/token` API as tv-web. The client is built lazily since the native server URL hydrates asynchronously at startup.
  - **Onboarding / server-setup screen** (`app/setup.tsx`), ported from tv-web's `ServerSetup`: manual address entry validated against `/api/health`, plus **LAN auto-scan** — the native port of `server-scan.ts` using `expo-network` for the device IP (tv-web leaks it via WebRTC, which RN has no equivalent for) then the same /24 `/api/health` sweep. The entry gate now routes to setup when no server is configured.

### Notes

- Typed routes are off for now: expo-router generates route types into the gitignored `.expo/`, which isn't present in a clean checkout, so leaving them on would break `pnpm check-types`. Routing is identical at runtime; compile-time route-string checking can return later behind a type-gen step. Runtime verification (Expo Go) still pending on device.

## [0.7.6] - 2026-07-23

### Added

- **`apps/tv-native` — the foundation of the native client** (Expo SDK 57 · React Native 0.86 · React 19). One codebase targeting iOS / iPadOS / tvOS / Android / Android TV / Fire TV, reusing the existing `/api/v1` REST surface unchanged. Stack per your spec: **expo-router** (file-based routing, typed routes), **Reanimated 4** (worklets plugin), **NativeWind 4** (Tailwind v3, isolated from the web apps' v4) with the color tokens ported verbatim from tv-web's `theme.ts`, **lucide-react-native + phosphor-react-native**, TanStack Query (same lib as tv-web). The **`@react-native-tvos/config-tv`** plugin is wired (it applies the native TV project changes — Android TV leanback manifest, tvOS target — when `EXPO_TV=1`). Building for tvOS / Android TV *additionally* requires aliasing `"react-native": "npm:react-native-tvos@<sdk-matched>-stable"` in package.json — the plugin does **not** swap the dependency itself. That alias is added when we take on the TV targets; iOS / iPadOS / Android use plain `react-native` (correct and current), which is all the iPad-first goal needs.
- **Ported foundation:** the theme palette (`src/lib/theme.ts`), the bearer REST client (`src/lib/api.ts` — the same `request()` helper tv-web uses, not tRPC), and the session store (`src/lib/auth.ts` — token in `expo-secure-store`, server URL in `AsyncStorage`; the native analogue of tv-web's `auth-client` + `server-url`).
- **First runnable screen — login** (`app/login.tsx`), the Plex device-link flow fully wired (start → QR/code → poll → token → guide), styled to match tv-web. Plus a signed-in placeholder that proves the session + API round-trip against a live server.

### Notes

- Integrated into the monorepo: `apps/*` already in the workspace, so `pnpm dev` starts `expo start` alongside server/web/tv-web, and `pnpm check-types` includes it. Set `EXPO_PUBLIC_SERVER_URL` in `apps/tv-native/.env` to skip onboarding while iterating.
- **Windows dev note:** this box can build/bundle/typecheck but can't render iOS/tvOS — run via Expo Go / a dev client / EAS Build. Next increments: the better-auth Expo client (the "Log in with a code" option), then the guide grid, player, and capability diagnostic — each ported for full appearance + behavior parity with tv-web.

## [0.7.5] - 2026-07-22

### Added

- **The remote's green button jumps focus to the mini player.** From anywhere in the guide, pressing green when a mini feed is playing focuses it and shows its two buttons — exactly as if you'd d-padded all the way up to it, minus the travel.
- **A hint strip along the bottom of the mini feed** showing that shortcut, in the Sling style: the green key is drawn as the physical button it refers to (a wide, thin, rounded green bar, which is what's on the LG remote) followed by "to focus". It appears only while the feed is playing and *un*focused, and fades out once focused — at which point the two buttons are on screen and the hint has done its job. Purely decorative (`pointer-events: none`), over a soft gradient so it sits on the video rather than on a hard bar.

### Notes

- This completes the input-controller arc (v0.7.1 → v0.7.5). It was chosen as the arc's acceptance test *before* the dispatcher was written: under the old system a new key meant another `window` listener plus a guard added to every existing handler, and the app had **no** color-button handling at all to extend. Under the layer stack it's five lines inside the guide's existing handler — no new listener, no new state, no other file touched.

## [0.7.4] - 2026-07-22

### Added

- **The four screens that never had D-pad support now have it.** Login, server setup, the capability diagnostic and the remote key probe were reachable *only* by the magic-remote pointer — arrow keys did nothing on any of them, because D-pad support wasn't a property of the app, it was something each screen had to hand-roll and these four never did. Now:
  - **Login** — ▲▼ moves between "Log in with Plex" and "Log in with a code", OK activates; Back returns from the code screen to the chooser.
  - **Server setup** — ▲▼ moves over the address field, Connect, any found servers, and Scan; OK activates.
  - **Diagnostic** — OK now activates **Continue** (and **Skip** on the error screen) once the run finishes, instead of the button being pointer-only.
- **A `useDpadList` hook** for exactly this shape — a screen declares how many items it has and what OK does, and it's navigable. No listener, no key constants, no zone plumbing.
- **A logo slot on the login screen**, above the sign-in choices: drop a `logo.png` into `apps/tv-web/public/` and it appears. Until then it renders nothing (not a broken image), so the layout is identical either way.

### Fixed

- **The diagnostic's Back key now uses the full key set.** Its inline test was missing `GoBack` and `BrowserBack` — the one copy of the back-key check that had drifted from the other seven. It's now the shared normalization, so it can't drift again.

### Notes

- **Server setup handles the on-screen keyboard properly.** While the address field is focused the keyboard owns the keys (LG documents that keydown/keyup don't fire for it apart from Enter and Back), so the screen claims *nothing* except Back — which closes the keyboard and hands control to the D-pad list. OK on the address field re-opens it. Enter still connects, as before.
- **The remote key probe deliberately keeps no D-pad navigation** — it must swallow every key to measure it, so its Clear/Exit buttons stay pointer-only and double-Back remains the keyboard escape. It's now an `exclusive` `MODAL` layer instead of a raw pair of listeners.
- **Every hand-rolled `window` key listener in the app is now gone.** All input flows through the one dispatcher.

## [0.7.3] - 2026-07-22

### Changed

- **The whole player cluster is on the dispatcher, and the mutex refs are gone.** Full-screen chrome, the feature panel, channel surf, and channel-number entry are now four layers at declared priorities: chrome/panel at `CHROME`, number entry at `OVERLAY` (it claims digits/CH/OK/Back but lets arrows through so you can navigate away mid-entry), channel surf at `MODAL` + exclusive (it owns every key while up). **No behavior change intended.**

### Removed

- **`numberEntryActiveRef` and `surfActiveRef`** — the two shared boolean mutexes that five different handlers had to read at event time to decide whether they were in charge. Stack position now produces the same outcomes: a layer that isn't on top simply isn't consulted. Channel surf outranking number entry is what used to be number entry's `if (surfActiveRef.current) return`.
- **Every `stopImmediatePropagation` call.** With one listener there are no siblings to shout down; it now appears only in a comment explaining why it used to be needed.

### Notes

- The feature panel deliberately still does **not** claim OK on its control row — it's the one place driving real DOM focus, so leaving OK unconsumed lets the natively-focused button or dropdown trigger fire its own click. Same reason its `openMenu` branch declines every key: base-ui owns them while a dropdown is open.

## [0.7.2] - 2026-07-22

### Changed

- **The guide is now a dispatcher layer.** `aurora-grid`'s zone machine (grid / rail / sidebar / mini-feed focus) moved off its own `window` listener and onto the input stack. The `if (player.layout === "full") return` guard is gone — the layer is simply off the stack while the full-screen player is up. The handler also stopped being the app's only bubble-phase listener (every other one was capture), which meant it could never win a key contest it didn't already have a ref guard for. **No behavior change intended.**

### Notes

- One temporary guard remains: the guide still checks `numberEntryActiveRef` for OK/Back. It goes away when channel-number entry becomes a `MODAL` layer in the next step, at which point number entry claims those keys before the guide is ever consulted.

## [0.7.1] - 2026-07-22

### Added

- **A centralized TV input dispatcher** (`lib/input/`) — one `window` keydown listener for the whole app, routing each press through a priority-ordered stack of layers (`BASE` → `CHROME` → `OVERLAY` → `MODAL`). Layers declare what they consume; anything unclaimed falls through to the layer beneath, so a screen that isn't on top simply never sees the key. Replaces the pattern where ~10 components each added their own listener and had to guess whether they were currently in charge. Includes: semantic key normalization (`lib/input/keys.ts`) so raw keycodes are translated exactly once at the boundary; three layer modes (`transparent` / `exclusive` / `passive`); a counted **semaphore** pause (not a boolean — so two holders can't unblock each other); a root-level interceptor slot; and our own held-key bookkeeping, since TV firmware often doesn't set `KeyboardEvent.repeat`.

### Changed

- **Settings is the first screen migrated to the dispatcher** — the category rail and the per-subpage option navigation are now two layers whose `active` flags are mutually exclusive, instead of two window listeners that each early-returned on the other's zone. **No behavior change intended:** same keys, same transitions, same two-tap confirms.

### Notes

- First step of the input-controller arc; the guide, player, and the four screens that have no D-pad support at all (login, server setup, diagnostic, remote probe) follow in subsequent releases. Migration is deliberately one screen at a time so any regression bisects to a single commit.

## [0.7.0] - 2026-07-22

### Added

- **A dedicated TV Settings → Server page.** The connected server and Plex-connection controls used to sit on the About page, which made no sense — About is app identity. They now have their own category in the settings rail (between User and Device), laid out like the Device page: an info strip (Address · Media connection · Connection mode), a **Plex connection** section (media-connection recheck, Force connection for testing), and the **Change server / Sign out** action with its two-tap confirm.
- **The User page now shows who's signed in** — avatar (the account's picture, falling back to an initials circle), name, email, and a role pill, above the sign-out action. Reads the better-auth session over bearer; no new endpoint.

### Changed

- **The guide sidebar's Account circle opens the User settings page** instead of signing you out on the spot. Sign-out still lives one press away, but now behind the same two-tap confirm as Change server — so a stray OK on the sidebar can't drop you to the login screen. (A rejected token still signs out automatically, as before.)
- **About is now purely app identity** — name, tagline, version, description, and a pointer to where the server and account settings moved.

### Fixed

- `useSettingsPage` no longer drives its selection index negative on a settings subpage with zero focusable rows (About is now one); ◄/Back still returns to the category rail.

## [0.6.46] - 2026-07-22

### Fixed

- **A fresh install (zero channels) now loads the full TV guide interface** — sidebar, featured chrome, and the context-aware empty-state grid — instead of a dead-end "No channels yet." card with no navigation. `GuideScreen` was short-circuiting to a bare centered message *before* mounting the guide, so on a brand-new server the sidebar never rendered and you couldn't reach Settings / Change server / the filter lenses. The v0.6.44 empty-state work (skeleton grid + nav-trap fix) already handled this inside `AuroraGrid`, but only the *filtered*-empty cases (Favorites / Recents / package filter) ever got there, because those still have a non-empty raw channel list. Removed the early return so the genuinely-empty case renders the same real interface.

## [0.6.45] - 2026-07-22

### Fixed

- **"Change server" on the installed webOS/Tizen app now reaches the server-selection screen** instead of dropping to the login page. `apps/tv-web/.env.production` carried a leftover dev `VITE_SERVER_URL` (`192.168.1.156:3000`) that got baked into the native build — so clearing the stored server fell back to that baked URL, the app still thought it "had a server", and routed to `/login`. That default is now **empty**, so the packaged app bakes no server URL and returns to the setup/scan screen. (The Docker web player is unaffected — it gets its URL from the container env, which overrides `.env.production`.)

### Changed

- **The change-server action is context-aware:** "Change server" on the installed app (signs out **and** clears the stored server → setup screen), "Sign out" on the browser web player (where the server is fixed by the build → login screen). Both use the two-tap confirm. Adds a `hasBakedServer()` helper.

## [0.6.44] - 2026-07-22

### Added

- **A proper empty state for the TV guide** — when the (filtered) channel list is empty (a fresh install, or a Favorites / Recents / package filter with nothing in it), the guide now renders its *own* structure as static, non-animated skeleton placeholders behind a centered, context-aware message ("No favorites yet", "Nothing watched yet", …) instead of a broken-looking blank. Mirrors the admin guide-preview's skeleton approach (no shimmer — measured to be too costly at scale on the C2).

### Fixed

- **You can no longer get trapped in an empty guide.** The D-pad key handler bailed on *every* key when there were zero channels, so ◄ could never reach the sidebar. Left now always opens the sidebar from an empty grid.
- **"Change server" now signs you out** (the bearer token is server-specific) in addition to clearing the stored server, behind a **two-tap confirm** (press OK, then OK again). Previously it only cleared the server URL — so on the web player (where the server URL is baked in) it fell straight back into the guide still logged in, which re-triggered the capability diagnostic and never reached the scan/manual-entry screen. Now it lands on onboarding (native app) or the login screen (web player), and never re-runs the diagnostic mid-session.

## [0.6.43] - 2026-07-22

### Fixed

- **The TV capability diagnostic now re-runs when a device is pointed at a different server.** The device's decode-capability profile is measured on-device but stored in the *server's* database (per `deviceId`), so switching a TV to another server left that server with no profile — and playback fell back to the (unreliable) `canPlayType` guess. The "already ran" flag now records *which server* the diagnostic ran against, so a server switch (via Settings → About → Change server, or a rebuilt web player pointed elsewhere) automatically re-runs the diagnostic against the new server. First sign-in and same-server relaunches are unchanged.

## [0.6.42] - 2026-07-22

### Changed

- **The TV connection probe is more forgiving on slow/marginal connections.** The reachability check timeout went 2s → 4s (a remote/relay TLS handshake over weak cellular can take longer than 2s), and when *nothing* answers in time the probe now falls back to **Relay** instead of Local — relay tunnels through Plex so it works from anywhere, whereas Local (raw http) is useless off-LAN and mixed-content-blocked on an HTTPS player.

## [0.6.41] - 2026-07-22

### Added

- **`TV_SERVER_URL` — point the TV web player at its own domain, independent of the admin's server URL.** Defaults to `SERVER_PUBLIC_URL` (so a plain LAN setup is unchanged), but can be set to the player's own public domain — e.g. when the player is reverse-proxied at `https://airwave-tv.example/` with `/api` + `/img` forwarded to the server. That lets the **player be exposed publicly while the server stays unexposed on the LAN**: the visitor's browser only ever talks to the public HTTPS player domain, and the proxy bridges `/api` to the LAN server internally (no CORS, no mixed content, no cert on the server).

## [0.6.40] - 2026-07-22

### Added

- **The TV app can be served as an auth-gated browser web player from the Docker image** — a third `CG_ROLE=tvweb` that builds the 10-foot TV app at startup (with the server URL baked in, so it connects without device onboarding) and serves it on its own port. Off by default; enable it by adding `tvweb` to `COMPOSE_PROFILES` in `.env` and setting `TV_WEB_PUBLIC_URL` + `TV_WEB_PORT`. The player's URL is auto-allow-listed on the server (`TV_APP_ORIGIN`) so its login flow (`/api/auth/*`, which a browser CORS-enforces — unlike the native webOS app) works. Anyone with an account can open it as a web player. Reuses the same image + static server; no rebuild of the app itself.

## [0.6.39] - 2026-07-22

### Added

- **Playback logs now record which Plex connection streamed each tune** (local / remote / relay), so `scripts/show-play-log.ts` can correlate connection with outcome — e.g. confirming a title played (or failed) specifically on the remote/relay path. New `PlaybackLog.connection` column (migration `add_playlog_connection`); the TV client includes it in each log row from the `/media` response.

### Notes

- Schema change — applies on deploy via `migrate deploy`. The server must be restarted for the log to capture the new field.

## [0.6.38] - 2026-07-22

### Added

- **The player's Info view now shows which Plex connection is streaming** (Local / Remote / Relay), alongside the existing delivery chips (Direct Play, container, codecs). It reflects the **server-resolved** connection from the `/media` response — so when you force Remote for a test, you can confirm it's actually remote and didn't silently fall back to Local (which happens if `remoteUrl` isn't populated). Remote/relay render in the channel accent color to stand out.

## [0.6.37] - 2026-07-22

### Added

- **TV Settings → About: a "Force connection (testing)" toggle** below the connection indicator, to exercise the remote/relay playback path from the home LAN without going off-network. It cycles **Auto → Remote → Relay** and overrides the launch probe (persisted on the device); the indicator above reflects the effective connection. Auto returns to following the probe.

## [0.6.36] - 2026-07-22

### Added

- **Remote playback — the TV app streams from the right Plex connection whether it's home or away** (finishes the arc started in 0.6.35). The server exposes the media server's reachable URLs at `GET /api/v1/connections`, and playback resolve (`/media`) takes `?network=local|remote|relay`, maps it to the source's stored `baseUrl`/`remoteUrl`/`relayUrl`, and stamps **only that base** onto the URL the client streams — the server itself always fetches Plex over the LAN `baseUrl`, and it only ever uses one of its own known URLs (never a client-supplied one, so the admin token can't be pointed anywhere). The TV app **probes the candidates once at launch** (local → remote → relay, via a short no-cors `/identity` check), remembers the reachable one on the device (localStorage), and sends it on every `/media` call automatically. **Settings → About** shows the resolved connection (Local / Remote / Relay) with tap-to-recheck. The admin token authorizes all three, so nothing else is needed auth-wise.

### Notes

- On the home LAN this resolves to **Local** (the previous behavior); the remote/relay paths only engage off-network, and require the source's `remoteUrl`/`relayUrl` to be populated (the hourly **Plex Connection Refresh** job, or re-saving the source). The TV-side launch probe needs on-device validation (webOS).

## [0.6.35] - 2026-07-22

### Added

- **Media sources now store the Plex server's off-network connection URLs** (`remoteUrl` + `relayUrl`) — groundwork for playing channels on a TV that's away from home. The ChannelGuide server always runs alongside Plex, so it keeps using `baseUrl` (effectively the LAN URL) for everything; only a remote TV needs the WAN/relay URL to reach Plex. These are captured from plex.tv's `/resources` at connect time and kept current by a new **Plex Connection Refresh** job (hourly) — because `/resources` always reflects the present WAN IP, that handles dynamic-IP drift automatically. The admin token already authorizes every one of these URLs, so nothing else is needed. (The TV-side check that picks local-vs-remote at launch is a later step; this release only captures the data.) Adds a `probe-plex-connections.ts` diagnostic script.

### Notes

- Schema change — new `MediaSource.remoteUrl` / `relayUrl` columns (migration `add_source_remote_urls`). Applies automatically on deploy via `migrate deploy`.

## [0.6.34] - 2026-07-22

### Fixed

- **Creating a channel (and the AI chat) no longer crashes on a plain-HTTP self-host.** `crypto.randomUUID()` is only defined in a **secure context** (HTTPS or localhost), so on a LAN-IP-over-HTTP admin (e.g. `http://192.168.1.10:36021`) it was `undefined` and threw `TypeError: crypto.randomUUID is not a function` (channel filter builder, AI chat panel). Added a `uuid()` helper (`apps/web/src/lib/uuid.ts`) that uses `crypto.randomUUID()` when available and otherwise builds a v4 UUID from `crypto.getRandomValues()` (which works in non-secure contexts), and routed all web call sites through it.

## [0.6.33] - 2026-07-22

### Fixed

- **`WORKFLOW_ENABLED=1` now works on a fresh Docker database.** The AI-lineup workflow engine keeps its state in its own Postgres schema (drizzle-managed `workflow` tables + graphile-worker), which had no bootstrap in the container — so on a fresh install the engine failed to start (`relation "workflow.workflow_runs" does not exist`, caught and non-fatal, but the AI lineup builder was unusable). The server role's entrypoint now runs the world's schema bootstrap when `WORKFLOW_ENABLED=1`, before the server starts. It's a migration runner (records what it applied, skips it thereafter), so it's idempotent and safe on every boot; a failure is non-fatal (the API still boots). Added a `workflow:bootstrap` script to the server package.

## [0.6.32] - 2026-07-22

### Fixed

- **Admin login now works on a plain-HTTP self-host** (e.g. `http://<nas-ip>:port`). The session cookie was hardcoded `sameSite: none; secure: true`, and browsers only honor a `Secure` cookie over HTTPS — so on a LAN IP over HTTP the cookie was silently dropped and login failed. The cookie attributes now derive from the `BETTER_AUTH_URL` scheme: **HTTPS → `none`/`secure`** (unchanged, and supports cross-site setups), **HTTP → `lax`/insecure**, which works because the admin web and the server share a host (their ports are same-site). Admin + server on *different* hosts over plain HTTP is unsupported — front it with a TLS proxy.

## [0.6.31] - 2026-07-22

### Fixed

- **Docker image build failed creating the runtime user** — `node:22-bookworm-slim` already ships a `node` user at uid/gid 1000, so forcing the `app` user to 1000 collided (`groupadd` exit 4). The build now lets the system assign free ids; the entrypoint still remaps `app` to your PUID/PGID at runtime. Caught by the first GHCR publish run.

## [0.6.30] - 2026-07-21

### Added

- **A self-hosting quick-start in the README** — Docker/Dockge deploy steps (grab the compose + `.env`, set the public URLs / secret / admin / PUID·PGID·TZ, `docker compose up -d`), the GHCR image reference, first-run flow (admin → Plex sync → TV onboarding), and how to build the image yourself (staging the `media-v1` capability media). Also updated the dev DB setup to use `pnpm db:migrate` (migrations) instead of `db push`.

### Notes

- Completes the self-host/Docker groundwork: Prisma migrations baseline, the single `CG_ROLE` image, the compose stack + `.env.example`, the GHCR publish Action, and the README. Next: cut a `v*` tag to publish the first image, flip the GHCR package to public, and verify a clean deploy.

## [0.6.29] - 2026-07-21

### Added

- **A GitHub Action that builds and publishes the image to GHCR** (`.github/workflows/docker-publish.yml`). Pushing a `v*` tag (e.g. `git tag v0.6.30 && git push origin v0.6.30`) builds a multi-arch image (linux/amd64 + linux/arm64 via QEMU) and publishes `ghcr.io/quixomatic/channelguide` tagged `{version}`, `{major}.{minor}`, and `latest`; a manual run publishes a `sha-<short>` image for testing. The job first pulls the capability-media from the private `media-v1` release into the build context (the built-in `GITHUB_TOKEN` has access), then bakes it in — no secret ever enters the image. Uses GitHub Actions layer cache.

### Notes

- The first publish creates a **private** package; flip it to public once (GitHub → Packages → channelguide → Package settings → Change visibility). Repo visibility is independent — the repo can stay private while the image is public.

## [0.6.28] - 2026-07-21

### Added

- **A `docker-compose.yml` + `.env.example` for the self-host stack** (Dockge-ready). Three services — `postgres:16`, the API `server`, and the admin `web` (the last two are the same image, split by `CG_ROLE`) — wired with health checks, `depends_on` ordering, a named Postgres volume (with a commented bind-mount option for TrueNAS datasets), and PUID/PGID/UMASK/TZ passthrough. One stack `.env` drives everything: the public URLs browsers/TV actually use (`SERVER_PUBLIC_URL` / `WEB_PUBLIC_URL`, which back `VITE_SERVER_URL` + auth/CORS), published host ports, Postgres credentials, `BETTER_AUTH_SECRET`, an optional seeded first admin, and optional OAuth / Plex / workflow-engine toggles. `DATABASE_URL` and the workflow Postgres URL are derived from the Postgres settings by compose.

### Notes

- Continuing the self-host arc — the GitHub Action (build + publish to GHCR) and the README quick-start follow next.

## [0.6.27] - 2026-07-21

### Added

- **A Docker image for self-hosting — one image, two roles.** A single multi-arch image (built on `node:22` + Bun) runs as either the API **server** or the admin **web**, selected at runtime by `CG_ROLE`, so `docker-compose` runs it twice with each service's own `.env`. The server role applies `prisma migrate deploy` then runs the prebuilt Bun bundle; the web role builds the SPA at startup with that deployment's `VITE_SERVER_URL` (each self-host lives at a different address) and serves it. The URL-independent parts — the server bundle **and** the workflow-SDK handlers (`.well-known`) — are built once at image-build time, never per-boot. Runs unprivileged with **PUID/PGID/UMASK/TZ** remapping via `gosu` (for TrueNAS datasets). New: `Dockerfile`, `docker/entrypoint.sh`, `docker/serve-web.ts` (a dependency-free Bun static server with SPA fallback), `.dockerignore`, `.gitattributes` (LF-locks the entrypoint).
- **Capability-probe media is baked into the image** (429MB of frozen test clips, published as the `media-v1` release asset) so the TV capability diagnostic works out of the box — no ffmpeg, no runtime download. The build stages it from `docker/cap-media/` (CI/local pull it with `gh release download media-v1`), with a public-URL fallback; no token is ever embedded in the image.

### Notes

- Groundwork for the self-host arc — the `docker-compose.yml` + `.env.example`, the GitHub Action that builds/publishes to GHCR, and the README quick-start follow in subsequent releases.

## [0.6.26] - 2026-07-21

### Changed

- **Database schema is now managed by Prisma migrations instead of `db push`** — the first step of the self-host/Docker work. A baseline `0_init` migration (generated from the current schema) was added under `packages/db/prisma/migrations`, and the existing development database was marked as already-applied (non-destructively — nothing was recreated or reset). A fresh install (e.g. the upcoming Docker image) now builds its schema by running the migration. Added a `db:migrate:deploy` script (`prisma migrate deploy`) for the container startup to apply pending migrations safely (never resets, never prompts). Going forward, schema changes are authored with `pnpm db:migrate` (`prisma migrate dev`) and committed as migrations; `db push` is dev-scratch only.

## [0.6.25] - 2026-07-21

### Added

- **TV app: a "Connect to your server" onboarding.** A self-hosted server lives at a different address per install, so the TV app no longer bakes the URL in. On first launch it shows a setup screen that **scans the local network** (a WebRTC-derived subnet → sweep of `/api/health`) *and* accepts a **manually-entered** address, validates it, stores it on the device, and reloads against it. **Settings → About** shows the connected server with a **Change server** action. The server base URL is now runtime (localStorage), with `VITE_SERVER_URL` only a dev default.
- **Server enablers for self-host:** a public `/api/health` endpoint (CORS-open, so a TV app can discover/validate a server cross-origin) and optional single-container static serving of the built admin SPA via `SERVE_WEB_DIR` (foundation for the upcoming Docker image).

## [0.6.24] - 2026-07-21

### Added

- **Update your display name from Settings → General.** The previously-empty page now has a **Profile** section with an editable Name — saved through better-auth's `updateUser` (it owns the user record + session, refreshed on save) — with your email shown read-only beneath it.

## [0.6.23] - 2026-07-21

### Changed

- **AI connection roles are explicit now — no silent fallback.** The AI lineup's planner/worker roles used to fall back to the chat connection at runtime, so they couldn't be turned off independently. Now each role resolves only to the connection explicitly flagged for it: AI settings offers **Same as chat** (copies chat's *current* connection onto the flag), a specific connection, or **None** (off) for planner/worker (Chat is a connection or None). Clearing planner or worker genuinely **disables the AI lineup** — the "Auto-generate → AI lineup" tile disables and the build job refuses to start. A single-connection setup still auto-claims all three roles on creation, so the common case is unchanged.

## [0.6.22] - 2026-07-21

### Added

- **Auto-generate is a picker modal now — preset vs AI.** The Channels "Auto-generate" button opens a modal with two tiles: **Preset generator** (rebuild from the built-in catalog — kicks off the `lineup-generate` job) and **AI lineup** (design a custom lineup — kicks off `ai-lineup-build`, which dispatches the durable workflow). The **AI tile is disabled until an AI connection is configured** (a planner + worker must resolve — they fall back to the chat connection), with a link to Settings → AI Assistant. The AI-lineup job also now guards up front that a planner + worker resolve before it dispatches.
- **A confirmation modal for "Refresh styling"** (Packages) that spells out what it does — re-applies the preset catalog's package styling (name / description / icon / tint / order) without touching any channels.
- **A reusable `Modal`** (`components/modal.tsx`) — a lightweight overlay + card (Escape / click-outside close) backing the two above.

### Changed

- **The AI Chat connection can be turned off.** AI settings' Chat role got a **None (off)** option (planner/worker keep "Same as chat"); the server no longer refuses to unset chat. The AI assistant side panel now shows a clear empty state (shared `EmptyState`) when Chat has no connection assigned.

## [0.6.21] - 2026-07-21

### Fixed

- **The Packages provenance filter now separates AI-generated from manual.** It previously conflated AI-lineup packages with hand-made ones — there are two distinct flags (`generated` = preset/static generator, `aiGenerated` = AI lineup), and manual is neither. The Filter → Type menu now offers **Auto (preset) / AI-generated / Manual**, `packages.list` filters on the correct flag and returns `aiGenerated`, and package rows show an **AI** badge alongside the existing **Auto** badge.

## [0.6.20] - 2026-07-21

### Added

- **Search, filter, and sort on the Channels and Packages pages — server-side, URL-backed.** Each list gained a compact sub-header toolbar: a keyword **search**, a **Filter** menu (Channels: by package / order type / status; Packages: Auto vs Manual), and a **Sort** menu (field + ascending/descending). The filtering/sorting runs **server-side** — `channels.list` / `packages.list` now take `q` / filter / `sort` / `dir` params and build the Prisma `where`/`orderBy`; the UI just forwards the state. It all lives in the **URL** (`?q=&sort=…`), so reload / back / share preserve the view, and empty params = the default (number/order ascending). The sub-header's **left** shows the active filters as **dismissible pills** (each with an ✕), or "All channels" / "All packages" when nothing's applied. Both lists show a **skeleton** while loading and a distinct "no matches" state.

### Changed

- **Auto-generate** (Channels) and **Refresh styling** (Packages) moved into their list's frame header; **New channel** / **New package** stay in the top header. (Refresh styling re-applies the preset catalog's package metadata — name/description/icon/tint/order — to the auto-generated packages, without touching channels.)

## [0.6.19] - 2026-07-21

### Changed

- **Bumpers are enabled by default on a fresh install.** The global `BumperConfig` singleton now defaults to `enabled: true` (was `false`) with a **15-second** fallback interstitial (was 8) — matching the tuned settings this deployment runs — so interstitial breaks work out of the box instead of needing to be switched on. Only affects new installs: column defaults apply when the singleton is first created, so existing configs are untouched.

### Notes

- Schema change (column defaults only) — `pnpm db:push` was run; on an already-created singleton it changes nothing.

## [0.6.18] - 2026-07-21

### Changed

- **Admin: the package detail page's channel list matches the Channels page.** Its channels now render with the same row as the main Channels list — tinted icon tile (inheriting the package's icon/tint), number, name + callsign, an **Inactive** badge, the ordering, and an **active toggle** — instead of a bare number + name. The empty state uses the shared `EmptyState` too. `packages.get` now returns each channel's icon/tint/callsign/ordering.

## [0.6.17] - 2026-07-21

### Changed

- **Admin: the icon control shows a chevron and the preview is a touch smaller.** The tinted-icon preview now has a dropdown **chevron** beside it so it reads as editable (it opens the icon picker), and the `xl` preview tile is dialed back from 64px to 56px.

## [0.6.16] - 2026-07-21

### Changed

- **Admin: the channel/package icon + accent control is bigger and clearer.** The tinted-icon preview (which opens the icon picker) is now a large `xl` tile — much easier to see the chosen look — and the accent swatches are larger **rounded squares** instead of small circles. Adds an `xl` size to `AccentIconTile`.

## [0.6.15] - 2026-07-21

### Added

- **Channel creation is gated on media-source readiness — enforced in the UI *and* the API.** A channel can only be built from a source that's **connected** to a media server (enabled + a resolved base URL) **and** has had a metadata **sync** run — without synced media there's nothing to resolve, filter, or schedule against. `channels.create` now rejects an unready source with a clear message; the Channels page disables **New channel** (with a tooltip) and its empty state points you to Sources until a source is ready; and the channel form guards with a state-specific reason (no sources / none connected / none synced). `sources.list` now reports `connected` / `synced` / `ready` per source, surfaced as a **Disconnected / Not synced / Ready** badge on the Sources list.
- **A "Danger zone" on the source detail page, with a type-DELETE confirmation.** Removing a source cascade-deletes every channel, schedule, and cached item built from it, so the action moved into a distinct destructive-titled section and now requires typing `DELETE` in a confirmation modal — replacing the one-tap `window.confirm`.

## [0.6.14] - 2026-07-21

### Changed

- **New channels get a windowed initial schedule inline, on every creation path.** Manually-created channels (`channels.create`) and the static preset generator (`generateLineup`) now build a ~12h windowed initial schedule the moment a channel is created — the same thing the AI lineup builder already did — so a channel is watchable immediately instead of waiting for the next `schedule-backfill` tick (which trickles 25 channels per 10 min). `schedule-refresh` then grows each channel from its stored cursor to the full 7-day horizon on the next hourly pass (it extends when a tail drops below 2 days of runway). Best-effort per channel: a build failure leaves the channel for `schedule-backfill` rather than aborting creation/generation.
- Note: the generator now resolves each filter twice — once for the min-items check, once inside the schedule build — the same double-resolve the AI path has. Passing the already-resolved pool through is a future optimization.

## [0.6.13] - 2026-07-21

### Added

- **Admin: proper empty states across the list views.** A new reusable `EmptyState` component (centered tinted icon + title + guidance + call-to-action) replaces the thin one-line "nothing here" text on **Channels**, **Packages**, **Sources**, **Users**, and **Settings → AI connections**. Each carries a fitting icon and CTA — New channel / New package / Add source / Import Plex Users, and a pointer to the add-connection form. All are guarded to show only after the data has loaded, so there's no empty flash during the initial fetch.

## [0.6.12] - 2026-07-21

The admin Guide page is rebuilt on the TV app's **Aurora** design and framed as a TV, so the admin's "what's on" view feels like the 10-foot client it drives.

### Changed

- **Admin: the Guide is the TV's Aurora grid now.** The old flat table is replaced by a look-port of `apps/tv-web`'s Aurora design — a featured now-playing panel over a horizontal time-grid with tinted "on now" cells (two-tone progress fill), the day/time axis, and a pulsing now-marker. It's mouse-driven (hover a program to feature it, click to tune) and theme-aware. The subtle geometry (lane math, program clamping) is carried over verbatim; sizing is fluid, scaled off the measured container width. New `features/guide/aurora-guide.tsx`; the shared `channels.guide` service already returns the rich `GuideMeta` it needs.
- **Presented inside a TV device mockup.** The guide "screen" sits in a dark plastic bezel (chin + power LED) on a center-pedestal stand, full-bleed and inset from the content edges. The body is a fixed **16:9** that measures the available area and scales to fit — so it stays TV-shaped when the content narrows (e.g. the AI side panel opens). The bezel/stand lighten in dark mode so the device reads against the dark background.
- **A "Guide preview" badge** above the TV toggles the **screen** light/dark independently of the admin theme (defaulting to it, and snapping back when the app theme flips), and toggles a **preview of the empty state**.
- **Empty state = skeleton + message.** A fresh install renders the guide's own structure as *static* (non-animated) placeholders with a centered "No channels yet" card over them, rather than bare text.
- **The current viewing session** shows as a compact live chip in the sub-header's top-left (replacing the old "Now watching" panel).

### Added

- **`Skeleton` gains an `animate` prop** (`@ChannelGuide/ui`) — set `false` for a cheap static placeholder; the animated shimmer uses a `fixed`-attachment gradient that gets expensive across many elements.
- **A `.light` class** in the UI globals mirrors `:root`'s light tokens, so a subtree can be *forced* light even under a `.dark` root (the guide's screen light/dark toggle relies on it; `.dark` already forced dark this way).

## [0.6.11] - 2026-07-21

### Fixed

- **Admin: the About page reads "About Airwave" with the live version.** It was hardcoded to `0.1.13`. The version now comes from the web app's own `package.json` via a new `lib/app-info.ts` (which also centralizes `APP_NAME`), so the `/version-bump` flow keeps the About page current automatically instead of it drifting stale.

## [0.6.10] - 2026-07-21

### Changed

- **Admin: the run detail page's Refresh is now a labelled button in the first frame's header.** It moved out of the floating icon-only button above the page into the header of the run (cost) frame, alongside the run id, and reads "Refresh" with its icon.

## [0.6.9] - 2026-07-21

### Changed

- **Admin: the workflow pages match everything else now.** Settings → Workflows, the AI-lineup runs list, and the per-run detail page all moved from Cards to Frames. The workflows list and the runs list are proper divide-y row lists (like channels/packages/sources) instead of bordered cards nested inside a card. A run's status is a **coloured badge** (green completed, blue running, red failed, muted cancelled).

## [0.6.8] - 2026-07-21

### Changed

- **Admin: the settings pages are on Frames now too.** General, AI Assistant, Jobs & Cache, and About all moved from Cards to the coss Frame treatment (title + description header over a raised panel), matching the rest of the admin. (The Jobs schedule-editor is still a Card — it's a modal, not a page section.)
- **Jobs page polish.**
  - Each job carries an **Auto** (sky) or **Manual** (amber) badge, with an icon.
  - The schedule details are **badges** now instead of a text line — outline pills for the cron cadence and next run, and a **green “Last ran …”** badge.
  - **Manual jobs no longer show a cron / “next run”** (they never auto-fire) — just the last run.
  - The **Edit** button comes **before** Run, and for a manual job it's shown **disabled** (with a tooltip) rather than hidden, so the row layout stays consistent.
  - More gap between a job's action buttons.

## [0.6.7] - 2026-07-21

### Changed

- **Admin: sources, users, bumpers, and the channel/package lists are on Frames now.** Following the channel/package forms, these pages moved from Cards to the coss **Frame** treatment — a title + description header over a raised panel. The **channels** and **packages** lists keep their good bits (tinted icon tiles, numbers, callsigns, Auto/Inactive/package badges). Redundant back-links dropped (breadcrumb covers them).
- **Toggles are Switches now, consistently.** The source **Libraries** enable, the channel-list **Active** toggle, the bumpers **Enable** master switch, and the new-source **Use SSL** are all the `Switch` component instead of native checkboxes. The new-source **Server** picker is the base-lyra `Select` too.
- **Users page: admin/user role badges got some life** — an amber shield for **Admin**, a muted user outline for everyone else, instead of a plain grey pill.

## [0.6.6] - 2026-07-21

### Changed

- **Admin: page content width is now consistent, set once in the layout.** Every page used to hand-roll `mx-auto max-w-*` and they'd drifted (2xl / 3xl / 4xl / 5xl / 6xl). The layout now centers content at a single **`max-w-6xl`** by default, and pages no longer set their own width — so channels, packages, sources, settings, bumpers, users and the dashboard all match. A page that genuinely needs full width opts out with `staticData: { fullBleed: true }` (the mechanism the guide grid already uses).
- **Admin: the package create/edit form gets the Frame treatment** to match the channel form — a Frame with a title + description header and a raised FramePanel, replacing the plain Card. The package's channel-list panel is a Frame too, and the redundant "← Packages" back-link is gone (the breadcrumb covers it).

## [0.6.5] - 2026-07-21

### Changed

- **Admin: the channel page is rebuilt on coss's Frame components — much cleaner.** The Edit/New channel form is now a **Frame** (muted container) with a proper **FrameTitle + FrameDescription** header and no redundant wrapping Card. Its sections are **collapsible** (base-ui Collapsible): each toggle is a standard inline-width ghost button with a **section icon**, the title, and a chevron just to its right; the section's content lives in its own raised **FramePanel**. Independent open state (several open at once). The **Preview** and **Schedule** blocks became Frames too, each with a title + description and its action in the header — **Refresh preview** in Preview's header, Extend/Generate in Schedule's (Watch stays in the top header).
- **Frame styling tuned once, for all frames.** The `Frame` component now defaults to `p-2` with a uniform gap between header and panels (instead of stock `p-1`), so every frame gets the same breathing room. Fixed two rough edges on the collapsible triggers: an **open** section no longer keeps a faint background (the ghost button's `aria-expanded:bg-muted` is cancelled), and the triggers are inset to line up with the header/panel content above and below them.

### Added

- **`Frame`, `Field`, `Form` components** added to `@ChannelGuide/ui` from the `@coss` (base-lyra) registry; `Collapsible` was already present. Base-ui underneath, matching the rest of the kit.

## [0.6.4] - 2026-07-21

### Changed

- **Admin: the channel page's chrome is tidied up.**
  - The **preview** moved to its own card (it's the resolved output of the filter, not a form field).
  - **Active** moved out of the form body into the sub-header's right side — it's a channel-status toggle, not a field. (Portaled from the form, still wired to the same state.)
  - **Watch** and **Refresh preview** moved up into the **top** header (left of the AI Assistant button).
  - **Save** is now a normal outline button like Watch/Refresh (no primary-blue emphasis); **Delete** is a plain ghost button (the red was heavier than warranted — it confirms first anyway).
  - The redundant **"← Channels"** back-link above the form is gone; the breadcrumb already covers it.

## [0.6.3] - 2026-07-21

### Changed

- **Admin: the channel form's section headings are larger and sit on a subtle background.** Each collapsible heading is now `text-base` semibold on a muted `bg-muted/50` bar (hover-darkened), so the sections read as distinct blocks instead of thin divider lines.

## [0.6.2] - 2026-07-21

### Changed

- **Admin: the channel form is now grouped into collapsible sections, with content + filter last.** Instead of one long scroll, the fields are split into three **independent** collapsibles (several can be open at once; it's not an accordion): **Details** (name / callsign / number / description / active), **Options** (package, ordering + sort, bumpers, appearance), and **Content & filter** — the Movies/TV type checkboxes joined with the predicate builder. Content & filter is deliberately last: the two jointly define what plays, and the resolved preview tiles render right below the form, so it reads top-to-bottom.

## [0.6.1] - 2026-07-21

### Added

- **Admin: channel identity in the sub-header on the channel page.** The channel detail page's sub-header (left) now shows **tinted icon tile · callsign · CH NN**, dot-separated and sized to match the breadcrumb tile above it — so which channel you're editing is clear at a glance. The tile inherits the package's icon/tint when the channel has none of its own (the `channels.get` payload now carries `packageIcon`/`packageTint` for that).

## [0.6.0] - 2026-07-21

Opens the 0.6.x line.

### Changed

- **Admin: the filter builder is on the design-system `Select` too.** Following v0.5.57, the nested predicate builder still had five native `<select>`s — the group combinator (all/any), and per condition the field, operator, boolean value, and tag value. All are now the base-lyra `Select`, so the whole channel form is consistent. The tag-value picker being a popup is also a real improvement — a native `<select>` of hundreds of genre/studio values was unwieldy.
- **The filter-builder selects now match the input height.** They were `size="sm"` (28px) sitting next to `h-8` (32px) value inputs in the same row, which looked off; they're default height now, so selects and inputs line up.

## [0.5.57] - 2026-07-21

### Changed

- **Admin: the channel create/edit form now uses the design-system components throughout, and the top row lines up.** An audit turned up several raw HTML controls: the Name/Callsign/Number row is fixed so the three inputs align on one baseline (explicit side-column widths + `items-end` instead of `auto` columns with hardcoded widths); the **Active** checkbox is now a **Switch**; the Movies / TV Shows checkboxes use the `Checkbox` component; and the five native `<select>`s (Ordering, Package, Sort by, Direction, Bumpers) are now the base-lyra `Select`. Shared by both the New and Edit channel pages.

### Added

- **`Switch` component** added to `@ChannelGuide/ui` from the `@coss` (base-lyra) registry — base-ui underneath, matching the existing checkbox.

## [0.5.56] - 2026-07-21

### Changed

- **Admin: "New package" and "Add source" moved to the top header too.** Same treatment as v0.5.55 — both now sit in the top-right header slot, left of the AI Assistant button, in the `outline` style. Packages' "Refresh styling" stays in the sub-header; the Sources page's heading no longer needs its inline button row.

## [0.5.55] - 2026-07-21

### Changed

- **Admin: the Channels page's "New channel" button moved to the top header.** It now sits in the top-right header slot, just left of the AI Assistant button, instead of in the sub-header, and uses the same `outline` style as Auto-generate (no longer the primary blue). "Auto-generate" stays in the sub-header.

## [0.5.54] - 2026-07-21

### Changed

- **Admin: the AI Assistant header button now shows its label.** It was an icon-only Sparkles button (with just an `aria-label`); it's now a full button — Sparkles + "AI Assistant" — so the entry point to the assistant panel is obvious rather than a bare icon.

## [0.5.53] - 2026-07-21

### Added

- **Dev: React Grab in the admin frontend.** `grab init` wired **react-grab** into `apps/web` — a dev tool for selecting page context to hand to a coding agent. It's a **DEV-only dynamic import** in `main.tsx` (`if (import.meta.env.DEV) import("react-grab")`), so it never ships in the production bundle. Added as a devDependency via pnpm (init was run with `--skip-install` to keep the workspace lockfile clean).

## [0.5.52] - 2026-07-21

### Changed

- **Admin: connection roles are now a clear dropdown per use, not toggle buttons on every card.** Settings → AI Assistant used to put up to three role buttons on each connection card, which was genuinely confusing — three buttons × N cards, each toggling a role. There's now a single **"How connections are used"** section with one dropdown each for **Chat**, **AI lineup — planner**, and **AI lineup — worker**; you just pick the connection for each job. Planner and worker offer a **"Same as chat"** option (they fall back to the chat connection when unassigned); chat is required. The connection cards keep their role **badges** so you can still see at a glance what each one is used for.

## [0.5.51] - 2026-07-21

### Changed

- **Admin: the AI lineup observability moved under Settings.** It was a standalone top-level section at `/workflows/ai-lineup`; it now lives at **Settings → Workflows**, matching Jobs & Cache. A new **Workflows** tab lists the durable workflows (just the AI lineup builder today), `/settings/workflows/ai-lineup` is its runs list, and `/settings/workflows/ai-lineup/:runId` is the per-run detail. The "Build Lineup with AI" job's link and all internal navigation were repointed. No behaviour change — same pages, better home.

## [0.5.50] - 2026-07-20

### Changed

- **TV: an unfocused channel's number is now muted.** Every row's number rendered at full brightness, so nothing distinguished the highlighted channel. The number is now bright only on the focused row and muted (`mutedFg`) on the rest, so the current channel stands out down the rail.

## [0.5.49] - 2026-07-20

### Changed

- **TV: the favorite indicator on the guide rail icon is bigger and loses its dark disc.** The small corner heart that marks a favorited (unfocused) channel now sits directly on the tinted circle — no backing disc — and is roughly doubled in size, with a soft drop-shadow so it stays legible where it overlaps the circle's edge.

## [0.5.48] - 2026-07-20

### Added

- **TV: a "Show All" button at the top of the guide sidebar's filter list when a filter is applied.** Clearing a filter previously meant scrolling the whole package list back to the currently-lit lens and selecting it again to toggle it off. Now, whenever a lens other than "all" is active, a **Show All** circle appears first in the filter group — above Favorites and Recents — so one press clears back to every channel. It's hidden when nothing is filtered (the Guide action already covers that, and a permanent "Show All" over an unfiltered grid is just noise). Safe to add and remove on the fly: the item list only changes while focus is in the grid — selecting a lens returns focus there, and re-entering the sidebar resets selection to the top — so the index shift never lands mid-navigation.

### Changed

- **TV: the guide channel rail's tinted icon now matches the featured panel's tile, and absorbs the favorite affordance.** The rail's little accent circle was too small to read — it's now the **exact** size, tint, and accent-ring treatment as the featured now-playing tile (same `vw(64 × FEATURE_SCALE)` dimensions and `1px` accent border, expressed the same way so the two stay locked together). It also became the single favorite control: the separate heart button beside it is gone. Focus the rail and the circle gains the blue focus ring and its glyph turns into a **heart** — filled red if the channel is favorited, a white outline if not — and OK toggles it. A favorited channel that *isn't* focused shows a small red heart badge tucked into the circle's bottom-right, so favorites are still spottable while scanning. The channel number is top-aligned so it stays put regardless of the circle's height.

### Notes

- _(TV client — first `apps/tv-web` source change since v0.5.2; needs a rebuild + `ares-install` to the C2.)_

## [0.5.47] - 2026-07-20

### Fixed

- **A run's entire build spend showed as “unpriced”.** The cost table keys on undated model ids (`claude-haiku-4-5`), but a connection stores whatever the provider's API expects — which for Anthropic is usually the dated variant, `claude-haiku-4-5-20251001`. Exact-match lookup missed it, so 8 calls and 352k input tokens sat outside the total. Rates now resolve by **longest prefix**, so dated ids price correctly while a genuinely unknown model (say `gpt-5`) still reports `unpriced` rather than being guessed at. Verified against the last run: builds price at **$0.257**, which with the Opus plan puts it at **~$0.61** — against the **$0.16** the old build-only estimate claimed.

## [0.5.46] - 2026-07-20

### Fixed

- **Channels were being built twice, and both copies paid full price.** On a 5-channel run, three channels ran their entire agent loop a second time — about a third of all build spend, wasted. The event log showed **16 `step_started` against 12 `step_created` and zero `step_retrying`**: nothing had failed, so these were never retries. The cause is documented behaviour — the workflow body **replays whenever a step completes**, and the SDK is **at-least-once**. When the first build finished at 9.2s the body replayed, and the four builds still in flight were dispatched again. Pre-assigned channel numbers (v0.5.42) don't help: both copies agree on the number, they just both do the work.
- **The guard now RESERVES instead of checking.** It previously looked for an existing channel at the top of the step and created it at the bottom — so every duplicate passed the check while the original was still mid-loop. The builder now creates the channel row as its **first** action, `enabled: false`, which is an atomic claim because `Channel.number` is `@unique`. A duplicate finds the row (or loses the insert race) and returns in milliseconds. Commit writes the verified filter over the planner's proposal and enables the channel, so nothing reaches the guide or `schedule-backfill` until its filter has actually been checked; `give_up`, a throw, or exhausting the step cap releases the reservation.
- **Previous AI packages are no longer offered for reuse.** `createPackages` wipes every `aiGenerated` package *before* resolving reuse, so offering one guaranteed the lookup would miss and fall back to creating a new package. The first run with reuse enabled "reused" 15 of 15 packages — but 7 targeted the previous run's own AI packages and were silently recreated, reproducing exactly the duplicate-package sprawl reuse exists to prevent. Only preset and hand-made packages are offered now.

### Notes

- Root-caused by reading the SDK's `/foundations/` docs: replay re-runs the body from the top with completed steps served from the event log, in-flight steps are undocumented in that path, and idempotency is explicitly the caller's responsibility. Also worth knowing: **runs are pinned to the deployment that started them**, so rebuilding mid-run doesn't affect an in-flight run and recovering a broken one means cancel-and-restart.
- A duplicate now costs one indexed read. It's still worth watching `step_started` vs `step_created` on a big run.

## [0.5.45] - 2026-07-20

### Fixed

- **The run detail page never rendered — `/workflows/ai-lineup/:runId` kept showing the runs list.** Adding `ai-lineup.$runId.tsx` beside `ai-lineup.tsx` silently promoted `ai-lineup.tsx` into a **layout** route for it, and a layout only renders its child through an `<Outlet />`. It had none — it rendered the list — so the URL matched, the child route existed in the generated tree, and nothing appeared. No error, in the router or the typecheck.
- Restructured to the convention the rest of the app already uses (`channels/`, `packages/`, `sources/`): a directory with **`route.tsx`** (layout holding the `<Outlet />` and the section breadcrumb), **`index.tsx`** (the list), and **`$runId.tsx`** (the detail). The breadcrumb moved to the layout so it isn't repeated per child.

## [0.5.44] - 2026-07-20

### Added

- **A dedicated page per run — `/workflows/ai-lineup/:runId`.** Clicking a run now opens it properly instead of expanding a cramped panel in the list. It shows **the full plan** (every package, channel and filter — including the ones a build cap meant were never constructed, which used to be discarded unread), **every channel build** as an expandable row with the model's own reasoning, its brief and proposed filter, its **tool calls** — what it previewed, what came back, how it revised — and its outcome, plus the SDK's step timeline with durations and retries.
- **The cost panel here is the honest one.** Grouped by model *and* phase, counting retries and the planner call. The list page's old figure was build-steps-only priced at worker rates, which is how a run whose planner ran twice on Opus reported **$0.16**. A model with no known price shows as `unpriced` and is excluded from the total rather than being silently guessed at — an obvious gap beats a confidently wrong number, which is the mistake being corrected.
- Builds are **expandable rows, not tabs**, so two channels' reasoning can be read side by side — comparing them is how a prompt problem becomes obvious.

### Changed

- The runs list is now a pure index: status, step counts, duration, and a link. All detail moved to the run page.

### Notes

- Runs from before v0.5.43 have no trace rows and will say so rather than rendering empty panels.
- **`TS2589: Type instantiation is excessively deep`** — `Prisma.JsonValue` is a deeply recursive union, and inferring it through tRPC tips the *client* compiler over. Fixed properly at the source: `listRunTraces` returns an explicit DTO with the three JSON columns widened to `unknown`, which keeps the inferred router type shallow. Worth remembering for any future procedure returning a Prisma row with `Json` fields.

## [0.5.43] - 2026-07-20

### Added

- **Every AI lineup run now records what the model actually did** — new `AiLineupTrace` table. The Workflow SDK already stores each step's input and output, so this deliberately isn't a copy of that; it captures the two things WDK structurally *cannot* see. First, **the inside of a step**: a channel build is one step wrapping a whole `generateText` tool loop, so its previews, filter revisions and reasoning were invisible from outside and lived only in the server's stdout. Second, **the plan itself** — only channels that got *built* left a row anywhere, so the last capped run designed 33 channels and threw 28 of them away unread. Plan quality can now be judged for the price of a single call instead of a full build.
- **Honest cost accounting.** The run report only ever summed usage from per-channel builds that succeeded, which understated a run three ways: the planner call (on a pricier model) wasn't counted at all, **retries were free**, and everything was priced at worker rates. That's how a run showed **$0.16** when the planner alone — which ran twice — was several times that. A trace row is written **per attempt** and carries its own model, so `summarizeRunUsage` can group by model and phase and the real figure falls out.

### Fixed

- **A failing plan step is now legible.** `AI_NoObjectGeneratedError: response did not match schema` is emitted for two completely different problems, and we couldn't tell them apart — the only evidence was a CBOR blob in the SDK's event log that had to be decoded by hand. The error carries the raw `text` and a `finishReason`: truncation ends mid-token with `finishReason: "length"`, a genuine schema violation is well-formed JSON in the wrong shape. Both are now logged, along with a trace row. Each retry is a full call on the planner model, so paying twice and *still* not knowing why was the worst case.
- **`maxOutputTokens` is pinned at 32k for the plan call.** It was unset, so the cap was whatever the provider defaulted to. The last successful plan emitted **10,393 output tokens** for 26 channels and the field catalog invites bigger ones, which makes silent truncation a live risk — and truncation is one of the two candidate causes of the retry above.

### Changed

- **Package reuse is now stated as mandatory, not encouraged.** First run with it offered reused 4 of 13 packages but still produced "Kids Corner" beside the existing "Kids & Family" and "Blockbuster Movies" beside "Action & Sci-Fi". The prompt now requires walking the existing list before inventing anything, names those exact cases as failures, and says a near-synonym *is* a duplicate.

### Notes

- _(Schema change — requires `pnpm db:push` + `pnpm db:generate`; backend needs a restart, then `pnpm workflow:build`.)_
- Trace writes are best-effort and never throw into a run: losing a row is a nuisance, failing a completed channel build because we couldn't log it is not.
- Tool *results* are summarized (match count + a short sample), not stored whole — one `preview_filter` result can be tens of thousands of tokens.

## [0.5.42] - 2026-07-20

### Added

- **The planner can now file channels into packages that already exist.** It previously minted every package from scratch — it had never been shown that any others existed — so a run could produce a "Family Fun" alongside your existing "Kids & Family", which is worse for the viewer than one good package. It's now given the current package list with each one's **provenance** (`preset` / `manual` / `ai`) and channel count, and can set `existingKey` on a planned package to file its channels into that one instead. Reuse is the default when a reasonable home exists; a new package is for a genuinely new idea. It's told to prefer `preset` and `manual` packages, since those are your own organisation, whereas an `ai` package is from a previous run and about to be replaced anyway.
- **Every package gets its own hundred-block at 1000+, existing or not.** A package whose channels live at 1–999 — a preset or hand-made one — gets a fresh block carved out for its AI channels, so those stay contiguous in the guide even though the package's originals sit elsewhere. A package that already owns a 1000+ block keeps it and fills the gaps. Blocks are allocated by scanning what's actually free, and a package with more channels than a block holds spills into the next free one rather than colliding.
- **`scripts/sim-lineup-numbering.ts`** — exercises the allocator against the real database (read-only; it only reads channel numbers) and checks the properties that matter: no collision with existing channels, no duplicates within the run, nothing below 1000, one distinct block per package.

### Changed

- **Numbering moved out of the plan step into its own durable step, after the wipe.** It used to be derived at plan time from the package's index, which no longer works: a reused package's block depends on live database state, and reading that *before* `clearAiGenerated` would allocate against numbers about to be freed. Keeping it a durable step preserves the property the original plan-time assignment existed for — a resumed run replays the identical numbering instead of re-deriving it against a database that has since moved.
- `planLineup` now returns a `LineupPlanDraft` (no numbers); `assignChannelNumbers` turns it into a `LineupPlan`.

### Notes

- No schema change. Package reuse is resolved **after** the wipe, so a planner that picked a previous run's `ai` package falls back to creating a new one rather than pointing at a deleted row.
- Verified: typecheck uncached, `workflow build` clean (25 steps), numbering harness green against the live library.

## [0.5.41] - 2026-07-20

### Fixed

- **`main` didn't build — unescaped backticks in the planner prompt, shipped in v0.5.39.** The line about `targetPoolSize` used plain backticks inside a template literal, which closes and reopens the string; Bun rejects it with `Expected ";" but found "targetPoolSize"`. Since `lineup-plan.ts` is inlined into the workflow bundle, `workflow build` could not have succeeded — meaning **v0.5.39's three prompt fixes were never actually exercised by a run**, and neither was v0.5.40. This is the second time this exact bug has shipped (v0.5.36 was the first).
- **A green `pnpm check-types` hid it.** The v0.5.40 run reported "4 successful, 4 total" with "1 cached" — the server task came from turbo's cache and never re-parsed the changed file. The task count was honest; the cache made it meaningless. **Treat a cached typecheck as no typecheck when the point is to validate an edit.**

### Added

- **The planner now gets the full field catalog, not just the tag vocabulary.** These were conflated, and only tag fields have listable values — so `audienceRating`, `criticRating`, `duration`, `decade`, `addedWithin`, `unwatched`, `hdr` and `userRating` were invisible to it, leaving the AI route with a *narrower* filter vocabulary than the static generator it's meant to beat (which builds its most distinctive channels out of exactly those axes). The catalog is static, costs a few hundred tokens, and rides in the same cached prefix that every fan-out shares, so it's paid once per run. Library-hygiene fields (`trash`, `duplicate`, `unmatched`, `location`, `editionTitle`) are deliberately left out as noise, and the heavy tag fields (`actor`, `director`, `writer`, `producer`) are named but still **not** preloaded — they run to thousands of values, which is why the vocabulary was trimmed in the first place.
- **Numeric spreads in the library profile.** A threshold is meaningless without knowing where the library's mass sits: `audienceRating gte 7` is either a tight prestige channel or a third of the library. The profile now carries p10/p25/median/p75/p90 for audience score, critic score, and **movie** runtime, plus HDR and 4K counts split by movies and episodes. This is what makes a *score window* ("7.0–8.0") an expressible idea rather than a guess that resolves to 4 items or 4,000. Runtime is movies-only because `duration` is declared `appliesTo: ["movie"]`, so pooling episode lengths would describe a population the field can't filter.
- **A deterministic sanitize pass over the planner's filters, before the build fans out.** A wider catalog means more ways to be wrong, and the likeliest mistake is a type-restricted field on a channel carrying both media types — `duration` is movies-only, `network` is shows-only, and channels now default to `["movie","show"]`. Unknown fields, operators that don't belong to a field's kind, and type-mismatched conditions are dropped and logged. A group emptied by sanitizing is dropped with it, since an empty AND/OR resolves to *everything* — the opposite of what the removed condition intended. The worker would eventually catch a bad filter via preview, but only after spending agent steps, and a silently-ignored condition can resolve to a plausible pool nobody questions.

### Changed

- The prompt now teaches the numeric axes: prefer a **window** to a bare floor, treat runtime as programming intent (quick-bite / matinee / event), and respect the catalog's type restrictions.

### Notes

- No schema change. Run `pnpm workflow:build` before the next lineup run (verified building — 21 steps, 4 workflows).

## [0.5.40] - 2026-07-20

### Fixed

- **The planner was being told not to write filters — in the same prompt that requires them.** A leftover line from the original design read *"Do NOT write Plex filter syntax. Describe the intent in `theme` — a later agent builds and verifies the actual filter."* That stopped being true in v0.5.29, when the planner took over authoring filters so workers could verify rather than explore, but the instruction was never removed. Forty lines later the same prompt says *"BUILDING THE FILTER — this is what the whole job is judged on"*, and the schema makes `filter` required. Faced with both, the cheapest way to satisfy the prohibition *and* the schema is to emit the thinnest filter that validates and put the real thinking in `theme` — which is exactly the lazy, mechanical filters we've been getting. It now says plainly that a channel needs both, and what each is for.
- **"Build from the FILTER VOCABULARY only" was silently banning most of the filter engine.** The vocabulary is built from eight *tag* fields (genre, studio, network, contentRating, collection, country, resolution, label), because those are the ones with value lists worth caching. But the instruction read as a restriction on **fields**, not values — so the planner never proposed `audienceRating`, `criticRating`, `duration`, `decade`, `addedWithin`, `unwatched`, `hdr` or `userRating`, none of which have tag values to be listed in the first place. The result was a planner working from a *smaller* filter vocabulary than the static preset generator it's meant to improve on: the generator builds its most distinctive channels out of score windows and duration bands, and the AI route couldn't express either. The rule now constrains tag *values* and says so explicitly.

### Changed

- **`collection` is demoted to a last resort.** It was advertised alongside `studio` as one of the "sharpest fields available", but this library's collections were assembled years ago and haven't been maintained — a collection that reads perfectly for a channel is likely missing most of what belongs in it. The prompt now says so outright and steers toward studio, title sets, and the numeric fields instead.

### Notes

- Prompt-only; no schema or API change. The planner is bundled into the workflow handlers, so **`pnpm workflow:build`** before the next run (`pnpm dev` rebuilds when stale).
- This is the first of three: the full field catalog + rating/duration distributions land next, then existing-package reuse.

## [0.5.39] - 2026-07-20

### Fixed

- **The builder gave up on channels it had already worked out how to fix.** On a 26-channel run it skipped 4, and in two cases its own explanation contained the correct filter — for "Star Wars Galaxy" it wrote *"the correct approach requires adding a title constraint: (Lucasfilm Ltd. OR Lucasfilm Animation) AND (title contains 'Star Wars') — this yields 177 items"* and then abandoned the channel instead of trying it. The prompt framed the planner's filter as a proposal to **accept or reject**; it now frames it as a **starting point to refine**, and states outright that diagnosing a problem isn't finishing the job: if you can describe a better filter you must build and preview it, and `give_up` is only for a library that genuinely can't support the channel.
- **It distrusted hand-applied labels.** It refused an anime channel because your `Anime` label "includes many Western animated series" — but those labels were applied **by hand by the library's owner**, which makes them the most authoritative signal available, not a mistake to correct. Both prompts now say to trust user-curated `label` values absolutely.
- **It judged channels by title count instead of runtime.** It skipped a classic-sitcom channel for matching "only 3 shows" — those three carry 635 episodes between them, which is weeks of programming. Both prompts now judge pools by runtime and treat `targetPoolSize` as a loose hint (overshooting is fine); `MIN_POOL_SIZE` drops 5 → 3, since the pool is counted in items and a handful of long-running shows is a strength.

### Added

- **Per-step breakdown on the AI Lineup page.** Opening a run now lists every step — name, status, retry attempts, duration — so the fan-out is visible while it happens, alongside each skipped/failed channel with the model's full reasoning for that outcome. The cost figure is now labelled as build-steps-only, since the planning call runs on a different model and isn't part of the per-channel totals.

## [0.5.38] - 2026-07-20

### Changed

- **"Build Lineup with AI" now builds the whole planned lineup by default.** The 5-channel cap existed while a per-channel build cost ~215k input tokens; once the planner started authoring filters (so workers verify rather than explore) that fell to ~43k over ~4 steps, putting a full lineup around a dollar instead of twenty. Set `AI_LINEUP_BUILD_LIMIT` to a small number to go back to sampling while iterating on prompts. Note the binding constraint is now wall-clock rather than tokens: each channel resolves its filter against Plex (~35s for a large one) twice — once to verify, once to build its schedule.
- **Jobs can carry a `detailHref`,** rendered as a "View runs & cost" link. Jobs that only *dispatch* long-running work finish instantly and their real output lives elsewhere, so the Jobs row was a dead end; the AI build now links straight to `/workflows/ai-lineup`.

## [0.5.37] - 2026-07-20

### Fixed

- **The channel page blocked on `channels.preview` despite the preview being "lazy".** tRPC's `httpBatchLink` collapses concurrent queries into one request, and a batch resolves as a unit — so the preview (which resolves the whole filter against Plex) was landing in the same batch as `get` / `nowNext` / `schedule` and holding up first paint. Firing it independently in React Query didn't help: the transport re-coupled them. The v0.5.18 note that "the preview query runs async so it never blocks the page" was wrong — only the poster *images* were lazy, never the data.
- Added a `splitLink` so a query can opt out of batching with `trpc: { context: { skipBatch: true } }`, and applied it to `channels.preview`. The page's fast queries now return on their own schedule while the preview loads alongside them. Use the same escape hatch for any procedure that can be slow and isn't needed for first paint.

## [0.5.36] - 2026-07-20

### Fixed

- A comment inside the raw-SQL template literal used backticks, which closed the template string and produced `TS1005: ',' expected`. The previous commit shipped with the web package failing to typecheck — I misread turbo's "2 successful, 4 total" as a pass.

## [0.5.35] - 2026-07-20

### Fixed

- **The AI Lineup runs list returned 500.** The query counted `workflow_steps.id`, but that table is keyed by `(run_id, step_id)` and has no `id` column at all. Counts `step_id` now. The failure was confined to the observability page — in-flight runs were completely unaffected, since the workflow engine reads those tables itself.

## [0.5.34] - 2026-07-20

### Fixed

- **The "Build Lineup with AI" job ran uncapped.** It dispatched a run with no build limit, so a single click on a library this size would have designed a full lineup and then built *every* channel — each one an agent loop costing ~215k input tokens. It now builds **5 channels by default**, overridable with `AI_LINEUP_BUILD_LIMIT` (0 removes the cap). The planner still designs the complete lineup either way, so you see everything it would build and only pay to construct a sample; the run report and the AI Lineup page show planned-versus-built.

## [0.5.33] - 2026-07-20

### Changed

- **The planner always designs the FULL lineup; a testing cap now limits only the build fan-out.** The interesting artifact is the plan — it's one call, and it's where the curation happens — while the per-channel builds are what actually cost money. So a capped run now shows you the entire lineup it would build and only pays to construct a sample of it. The sample is taken **round-robin across packages** rather than off the top of the list, so it spans different kinds of channel instead of exercising one package's worth of the easiest cases. The run report carries `channelsPlanned` alongside `channelsCreated`, and the observability page shows both so a capped run doesn't read as a shortfall.
- **`pnpm dev` no longer rebuilds the workflow handlers every time.** It compares mtimes across `workflows/` and `packages/api/src` (both are inlined into the bundle) and rebuilds only when something actually changed. The unconditional ~13s build was delaying server startup enough that the admin frontend's first fetch timed out.
- **The observability UI is no longer started by `pnpm dev`.** It's a separate long-lived process and doesn't belong coupled to the server. Both it and the handler build are now proper turbo tasks: **`pnpm workflow:ui`** and **`pnpm workflow:build`**.

## [0.5.32] - 2026-07-20

### Changed

- **The planner is no longer told how many channels to build.** It was being handed `Propose exactly 50 channels across 8 packages` — a number with no relationship to the library, derived by arithmetic. A quota is the wrong instruction for the actual goal: too high and the model pads with near-duplicates, too low and whole sections of the library are left with nowhere to live. It now sizes the lineup to what's actually there, with the brief being **coverage**: could someone find a decent home for the vast majority of this server by browsing the lineup? It's told to walk the profile — genres, studios, decades, biggest shows — and make sure each meaningful block is served; to build several distinct channels where there's real depth (a genre with 300 titles, a show with 500 episodes) rather than one catch-all; and not to pad, since two channels resolving to nearly the same pool should be one channel.
- `--limit` is now explicitly a **testing** control (generate exactly N as a representative sample, keeping trial runs cheap) rather than a truncation of a fixed-size plan.

### Notes

- **This makes a full run potentially much more expensive.** Per-channel build cost is still ~215k input tokens and ~10 agent steps — unchanged and unsolved — so a lineup that sizes itself to a large library scales that linearly. Until the worker loop is fixed, use `--limit` (or the testing cap) rather than an uncapped run.

## [0.5.31] - 2026-07-20

### Fixed

- **Every AI-generated `OR` group was silently being treated as `AND`.** A filter group combines with **`combinator`**, but the two schemas added for the lineup workflow emitted **`op`** instead. The resolver switches on `node.combinator` and falls through to intersect when it's missing, so nothing errored — `Blockbuster Night`'s `(genre = Action OR genre = Adventure)` actually resolved to films tagged *both* Action *and* Adventure. The chat assistant was never affected (it always used `combinator`); this only hit channels built by the lineup workflow.

### Changed

- **The planner is now taught what a curated channel actually looks like.** It was reaching for the laziest expressible filter — `genre = Animation` for an "All-Day Toons" channel, matching ~7,900 items whose only shared trait is a tag. That's precisely what the existing rule-based generator already produces, so it added nothing. The prompt now states outright that a bare single-genre filter is a failure, and shows the real shape to aim for: **a general predicate, then curated exceptions** — the pattern behind a hand-built channel that pairs `contentRating` + `genre`, subtracts the specific titles that break the mood, and adds back the one show the rule misses. It's also told to combine at least two dimensions, to use exclusions, to reach for `collection`/`studio` over `genre`, and that the biggest-shows list is raw material for nostalgia and daypart channels.
- **Channels now default to carrying both movies and TV**, like real channels do. `mediaTypes` defaults to `["movie","show"]` and narrows only when the concept demands it (a full-series marathon, a film festival).

## [0.5.30] - 2026-07-20

### Added

- **Two manual jobs on Settings → Jobs.** **Clear AI Lineup** deletes every AI-generated channel and package in one click — scoped strictly to `aiGenerated` rows, so preset-generated and hand-made channels are untouched. **Build Lineup with AI** kicks off a full run without touching a terminal. The build job is a **dispatcher**: the real work is a durable workflow that outlives the request and survives restarts, so the job returns as soon as the run is started and its status means "kicked off", not "finished" — the Job table can't represent a multi-hour run.
- **An AI lineup observability page at `/workflows/ai-lineup`.** Its own section rather than living under Channels, because it's about the workflow rather than the channels it happens to produce. Lists every run with live status and per-step progress (polling while anything is in flight), and opens a run to show what it built and **what it cost**: input/output tokens, cache reads (~0.1×) and writes (~1.25×), agent steps, **steps per channel**, and a dollar estimate. Every cost lesson in this arc so far was learned after the fact from terminal logs; this makes spend visible while a run is happening.

### Notes

- Run metadata is read straight out of the Workflow SDK's `workflow` schema with raw SQL — Prisma's describer deliberately can't see that schema (which is what keeps `db push` away from those tables), but plain SQL over the same connection reads it fine.
- A run's report is stored as CBOR in `output_cbor`, so it's decoded through the SDK (`getRun().returnValue`) rather than read as JSON.

## [0.5.29] - 2026-07-19

### Changed

- **The planner now writes the actual filters, and the builders just verify them — the fix for a runaway token bill.** Previously the planner emitted only a *theme* ("Martial arts and Golden Harvest action") and each of the ~50 per-channel workers had to rediscover how to express that as a Plex filter, taking 3–4 preview round-trips. Because an agent loop re-sends its whole conversation on every step, those previews were re-billed repeatedly: **~117,000 input tokens per channel**, and one build exceeded Haiku's entire 200K context on its own preview results. The planner already holds the library's full tag vocabulary, so it now authors each channel's filter directly; the worker previews it once and commits, adjusting only if the result genuinely doesn't match. Verification still lives with the worker, so a bad proposal is corrected or abandoned rather than becoming a broken channel.
- **A `limit` now bounds plan GENERATION, not just the result.** `--limit 5` used to trim the plan *after* the model had written all ~50 channels — so every test run paid for a full 50-channel structured output on the planner model (the most expensive artifact in a run) and discarded 90% of it. It's now part of the prompt.
- **New `compact` preview projection for refinement passes.** Measured on a 316-item filter: `default` ≈ 72k tokens, `quick` ≈ 37k, **`compact` ≈ 10k** — with **no truncation**, every matched item still represented, carrying title / year / rating / genres / studio and episode-and-season counts. The first look at a new filter still uses full `quick` detail; the agent is told to pass `compact` on follow-up checks, which is where the same payload would otherwise be re-sent step after step.

### Added

- **Prompt-cache accounting.** Every build now records `cacheReadTokens` and `cacheWriteTokens` (from the SDK's `usage.inputTokenDetails`) alongside input/output, and the run report totals them. Cache reads cost ~0.1× and writes ~1.25×, so this is what makes the shared-prefix work verifiable instead of assumed — it had been asserted twice without evidence.

## [0.5.28] - 2026-07-19

### Added

- **`pnpm dev` now starts the workflow observability UI alongside the server.** The Workflow SDK ships a web UI that reads our Postgres world directly — runs, steps, events and streams, live — so a lineup build can be watched from a browser instead of scraped out of terminal logs. It comes up automatically on **http://localhost:3199?resource=run**, or on its own via `pnpm --filter server workflow:ui`. `pnpm dev` also now runs `workflow build` first, so the flow/step handlers are always current.

### Notes

- **The UI needs `NODE_OPTIONS=--experimental-sqlite`.** It imports `node:sqlite`, which Node keeps behind that flag until Node 23 (we run 22.12). Without it the server logs "started" and then returns **500 on every request** with `ERR_UNKNOWN_BUILTIN_MODULE` buried in its own output — it looks up but serves nothing. The flag is set in `scripts/dev.ts` / `scripts/workflow-ui.ts` rather than the npm script, because env-var prefixes in package.json aren't portable across Windows and POSIX.
- The UI is taken down with the dev server, so a restart doesn't leave port 3199 held (an orphan makes the next start fail with `EADDRINUSE`).
- Also bounded the engine's Postgres footprint (`WORKFLOW_POSTGRES_MAX_POOL_SIZE`, `WORKFLOW_POSTGRES_WORKER_CONCURRENCY` in `.env`): each engine instance opens a WDK pool **and** a graphile-worker pool, so a dev server plus a CLI run could exhaust `max_connections=100` and fail with `FATAL 53300`.

## [0.5.27] - 2026-07-19

### Added

- **AI connections can now be assigned roles, so different work can run on different models.** Each saved connection can hold any combination of three roles: **Chat** (the admin assistant), **Planner** (heavy reasoning — designs the lineup), and **Worker** (high volume — builds each channel). This exists because an AI lineup build has two wildly different halves: **one** planning call where judgment matters, and **~50** mechanical per-channel build loops that dominate the bill. Pointing the worker at a cheaper model is the single biggest cost lever in the run — and it also makes an A/B trivial: assign Worker to one model, run a few channels, reassign, re-run, compare the filters.
  - **A single connection needs no configuration** — the first one you add claims all three roles automatically, and the role buttons stay hidden. They appear only once a second connection exists.
  - **Every role falls back to the Chat connection** when unassigned, so nothing breaks if a role is never set or its connection is deleted.
  - Roles are exclusive (one connection per role) but independent, so one connection can hold several. Settings → AI Assistant shows a badge per role and a button to reassign.

### Notes

- _(Schema change — requires `pnpm db:push` + `pnpm db:generate`; backend needs a restart.)_

## [0.5.26] - 2026-07-19

### Fixed

- **The lineup build was wildly more expensive than it needed to be.** An agent loop re-sends its whole conversation on every step, so cost grows **quadratically** with step count — and the first full run had nothing cached, a fat static prefix, and the library's entire tag vocabulary arriving as a *tool result* (407 studios ≈ 2k tokens) that was then re-sent on every subsequent step of every channel. The same problem the chat solved in v0.5.13 wasn't carried over to the builder. Three changes, all about **where the prompt-cache breakpoint sits**:
  - **One shared cache prefix for the entire run.** The system prompt, tool definitions, library profile and filter vocabulary are now byte-identical across all 50 channel builds, with the cache breakpoint on the system message — so they cost **one cache entry for the whole run** instead of being re-billed per channel. (A request-level breakpoint, as first written, swallowed the per-channel brief and made every prefix unique — sharing nothing.)
  - **The filter vocabulary is hoisted into that cached prefix.** Previously each agent called `discover_field_values` itself, which lands *after* the breakpoint and is therefore re-sent uncached on every step. Now it's fetched **once per run** (its own durable step) and handed to every builder pre-loaded — so it's sent whole and untruncated, builds converge in fewer steps because discovery is already done, and the agent starts out unable to invent a tag value that doesn't exist.
  - **`preview_filter` stays pinned to the leanest projection.** It's the one genuinely per-channel, per-iteration payload — so it's hardcoded to `detail: "quick"` with **no way for the model to request `verbose`** (which measured ~270k chars on a large filter).

### Added

- **Token accounting.** Every channel build records its input/output tokens and step count, and the run report totals them — so a run's cost is visible immediately instead of arriving with the bill.
- **Live run inspection, documented.** The SDK's inspector reads our Postgres world directly: `bunx workflow inspect runs`, `… steps -r <runId>` for per-step status while a build is running, and `… runs --web` for a local dashboard. Note `bunx` doesn't load `.env`, so `WORKFLOW_TARGET_WORLD` / `WORKFLOW_POSTGRES_URL` must be exported first.

## [0.5.25] - 2026-07-19

### Added

- **The AI lineup workflow now actually builds channels (§7.3a Phase 4 — no more stubs).** Each planned channel gets its own **grounded agent** that turns a plain-language theme into a verified Plex filter: it lists the filterable fields, discovers the library's **real tag values** (never guessing one it hasn't seen), previews candidate filters to check what they actually match, and only then commits. If nothing sensible matches it calls `give_up` with a reason rather than creating an empty channel, and a pool under 5 items is refused outright. Every created channel is stamped `aiGenerated`, attached to its planned package, given its plan-assigned number — and immediately gets a **windowed initial schedule** (v0.5.20) so the lineup is watchable the moment the run finishes. Builds fan out **6 at a time**, each its own durable step, so a crash resumes only the unfinished channels. Verified against a real library: 10 packages and 9 channels created with working schedules (the rest of the run hit an API credit limit), **all 135 preset channels untouched**.
- **The planner now picks icons, and packages get palette accents.** Channel and package concepts include an `icon` from the **lucide** or **phosphor** sets (`lucide:Rocket`, `phosphor:FilmSlate`) chosen to actually evoke the channel, plus an optional broadcast-style **callsign**. Package accents come from the model out of the **16-swatch palette**; **channel** accents come from the existing `channelAccentAt` variance cycle — the same 1–3-channel run-length mechanism the preset generator uses — so the guide gets organic colour banding instead of a rigid rotation, and the counter runs across the whole lineup rather than resetting per package.
- **Re-runs wipe the previous AI lineup first**, scoped strictly to `aiGenerated` rows — manual channels and the preset generator's `generated` rows are never touched.

### Fixed

- **Channel builds are now idempotent.** A durable step that fails anywhere is retried **from the top**, so a step that had already created its channel hit `Unique constraint failed on the fields: (number)` on the retry and reported the channel as skipped even though it existed. The builder now checks for an existing channel at its plan-assigned number before doing any work (and treats a unique-violation on commit as success), so a retry is a no-op instead of a failure. It also refuses to touch a channel at that number that isn't AI-generated.

### Notes

- A full 50-channel run is a real number of LLM calls — it will exhaust a low API credit balance partway through. Failed channels are reported individually in the run report; re-running rebuilds cleanly.
- Running `scripts/run-lineup.ts` while the dev server is up means **two workers share one queue**, so steps may execute in either process. Harmless now that steps are idempotent, but the logs will be split.

## [0.5.24] - 2026-07-19

### Added

- **The AI now proposes a real lineup (§7.3a Phase 3 — the plan step).** One structured-output call over the ~630-token library profile returns a full, Zod-validated lineup: themed **packages**, each holding **channel concepts** with a name, a viewer-facing description, an ordering strategy, and a plain-language `theme` written specifically for the agent that will build the filter. On a real 584-movie / 275-show library it produced **10 packages and 50 channels** — and it's grounded, not generic: it noticed `EON Productions (22)` and proposed a **007 Marathon**; it combined `Toho Pictures` and `Orange Sky Golden Harvest` into **Kaiju & Kung Fu Theater**; it turned the biggest shows into a **Marathon Vault** of in-order complete-series channels; and it split the kids content by era and age band (**Preschool Storytime** / **Bluey & Modern Kids** / **Adventure Time Zone**) rather than lumping it into one "Kids" channel. That's the whole point of the arc: channels nobody would have written a preset for.
- **Channel numbers are assigned at plan time, in the 1000+ block.** AI channels start at **1001**, leaving 1–999 to preset and manual channels, and each package gets its own hundred-block (1001–1099, 1101–1199, …) so its channels stay contiguous with room to grow. Numbers are assigned by us **after** generation rather than by the model — `Channel.number` is `@unique` and the build step fans out concurrently, so letting each agent pick one would race. It also makes a resumed run idempotent.

### Notes

- The planner deliberately **does not write Plex filters**. It proposes intent; Phase 4's per-channel agent grounds that into a real filter with `discover_field_values` + `preview_filter` and verifies the pool before creating anything — so a concept that can't be filled is discarded at build time instead of becoming a broken channel.
- The prompt is explicit that Plex's genre/studio tags are a real-world vocabulary, not a clean taxonomy (`Science Fiction` vs `Sci-Fi & Fantasy`, anime usually tagged only `Animation`), and that a channel's episode count determines whether it can sustain a loop.
- Uses the **active AI connection** (Settings → AI Assistant). Still creates nothing — the build step lands in Phase 4. _(Server — needs a restart; `bunx workflow build` after any change under `workflows/`.)_

## [0.5.23] - 2026-07-19

### Added

- **The AI lineup workflow can now see your library (§7.3a Phase 2 — the analyze step).** The planning model can't be shown 15,000 items, so the workflow distills the whole library into a compact **profile**: totals, the **genre distribution**, the **studios/networks** that dominate, the **content-rating** mix, the **decade spread**, and the **shows big enough to carry a channel** (by episode count). That's what will let the planner propose channels grounded in what's actually on the server instead of generic guesses. Measured on a real library — 584 movies / 275 shows / 14,793 episodes → **~630 tokens in 90ms**, small enough to sit in the cached prompt prefix every per-channel agent shares.
- **`scripts/show-library-profile.ts`** — prints the profile as the model will see it, with its size in characters/tokens, for sanity-checking a plan's inputs.

### Notes

- Genres live inside the `guide` JSONB bundle rather than a column, so the counts are done with **one `jsonb_array_elements_text` aggregate** instead of pulling every row into memory.
- The dimension counts deliberately cover **movies and shows only, never episodes**: episode guides don't carry genre/studio/rating (those live on the parent show), and counting episodes would let one 583-episode show drown out the entire distribution. Episode counts surface separately as "biggest shows".
- _(Server — needs a restart, and `bunx workflow build` after any change under `workflows/`.)_

## [0.5.22] - 2026-07-19

### Added

- **The AI lineup workflow is wired into the server (§7.3a Phase 1 — skeleton).** The durable engine proven in 0.5.21 now starts with the app: `startWorkflowEngine()` boots alongside `startJobs()`, runs the queue poller, and registers a runner the admin API can drive. The workflow itself (`apps/server/workflows/lineup.ts`) lays out the real shape — **analyze → plan → build → report** — as four independently checkpointed steps, each with its final signature (`LibraryProfile`, `LineupPlan`, `PlannedChannel`, `LineupReport`); the bodies are stubs that Phases 2–4 fill in. Verified end-to-end: a run starts, every step executes in order, the status poll goes `running` → `completed`, and the report comes back as the workflow's return value.
- **Admin API for the workflow** — `ai.buildLineup` (start a run, returns a `runId` immediately), `ai.lineupRun` (poll status + report), `ai.cancelLineupRun`, and `ai.lineupAvailable` so the UI can hide the action when the engine is off. The workflow must live in `apps/server` (the SDK's CLI scans `./workflows`) while the tRPC surface lives in `packages/api`, which can't import from an app — so the server **registers** a runner at startup and the router looks it up (`services/agent/lineup-runner.ts`). Dependency direction stays correct and `packages/api` never has to know the workflow SDK exists.
- **`scripts/run-lineup.ts`** — drives a full run from the CLI on its own ports (so it won't collide with a dev server), for developing Phases 2–4 without the admin UI.

### Changed

- **`pnpm dev` and `pnpm build` now run `workflow build` first**, since the `"use workflow"` directives are a build-time transform. Turbo's `build` outputs gained `.well-known/**` — otherwise a cache hit would restore a build with no handlers and every run would 404 on dispatch. Note `bun --hot` will **not** re-run the transform: after editing anything in `workflows/`, re-run `bunx workflow build`.

### Security

- **The workflow handlers are bound to `127.0.0.1` on their own listener** (`WORKFLOW_LOCAL_PORT`, default 3152) and are deliberately **not** mounted on the public Hono app. They execute workflow steps and have no auth — on Vercel they'd ride queue-consumer security, which self-hosting doesn't provide. They're machine-to-machine (our own worker calling back over loopback), so there's no user or session to authenticate and better-auth doesn't apply; the control is that they're unreachable off-box, the same posture as Postgres on :5433. This needs revisiting if the worker ever runs on a different host or the port is published in Docker.

### Notes

- Engine is **opt-in**: set `WORKFLOW_ENABLED=1` (plus `WORKFLOW_TARGET_WORLD` / `WORKFLOW_POSTGRES_URL`). Without it the server boots exactly as before and the API reports the runner as unavailable. Handler bundles are imported lazily, so a fresh checkout that hasn't run `workflow build` still starts.
- Still a skeleton — running it creates **no channels or packages**. _(Server — needs a restart.)_

## [0.5.21] - 2026-07-19

### Added

- **Durable workflow engine proven on our stack (§7.3a Phase 0 — the go/no-go spike).** Groundwork for the "analyze the whole library and build every channel with real understanding" arc: Vercel's **Workflow SDK** (`workflow` + `@workflow/world-postgres`, both pinned at `4.3.0`) now runs on **Bun + Hono** against our own Postgres, with **no Nitro and no framework adapter** — `bunx workflow build` emits standalone handlers we host ourselves. The headline result: a workflow ran its first step, the **process was killed mid-flight**, and a brand-new process **resumed and finished it** — replaying the completed step's result from the event log instead of re-running it. That resumability is the whole reason for the dependency: a "build 150 channels" run takes hours and has to survive a restart. Durable state lives in **its own Postgres schemas** (`workflow`, `workflow_drizzle`, `graphile_worker`) with **zero tables in `public`**, and `prisma db push` was verified to leave all 13 of them untouched — so the workflow engine and Prisma share one database safely. Includes `workflows/spike.ts` + `scripts/spike-workflow.ts` (the harness that proves it), and `workflow-plugin.ts` + `bunfig.toml` (the required build-time transform).

### Notes

- **New env vars** (`apps/server/.env`, not committed): `WORKFLOW_TARGET_WORLD=@workflow/world-postgres` and `WORKFLOW_POSTGRES_URL=<DATABASE_URL without the ?schema= query string>` — the query param is forwarded as a Postgres server setting and errors with `unrecognized configuration parameter "schema"`.
- **One-time setup:** `bunx --package @workflow/world-postgres bootstrap` creates the workflow schemas (idempotent).
- **A build step now exists:** `bunx workflow build` must run before the server boots and again whenever `workflows/` changes — `bun --hot` will not re-run it. Not yet wired into the dev/build scripts or turbo; that lands with Phase 1.
- Generated handler bundles (`apps/server/.well-known/`) are ~20MB and gitignored.
- **Nothing is wired into the running server yet** — this release only proves the engine works and adds the dependencies. No behaviour change.

## [0.5.20] - 2026-07-19

### Added

- **Windowed schedule builds — a new channel becomes watchable in seconds instead of waiting on a full pass.** `buildSchedule` gained an optional **window cap** (`maxDurationSeconds`): instead of always laying one *complete* pass of the pool — for a 2,800-episode channel that's a ~300-day timeline and far too slow to run inline — a windowed build stops at roughly the requested duration, **breaking mid-pass** to do it. Because that leaves a pass half-finished, a build now also returns a **`ScheduleCursor`** (`passSeed` / `passIndex` / `pos`) persisted on the channel, and `extendChannelSchedule` **resumes from it** — so a capped channel walks *through* its pool rather than replaying the top of it. That mattered most for `IN_ORDER` / `BY_AIR_DATE` channels, where every pass is the same order: without the cursor they'd have looped their first N hours forever and never reached episode 50. Running off the end of a pass rolls cleanly into a brand-new pass from 0 (reshuffled for `SHUFFLE`), and a stale cursor — the pool shrank because the filter was edited — rolls to a fresh pass rather than wedging. `schedulePassSeed` is stored **signed** (`| 0`), since Postgres `Int` is signed 32-bit and the seed is an unsigned hash.
- **`scripts/sim-schedule-window.ts`** — harness covering the tricky cases (mid-pass truncation, resume without repeats or gaps, pass rollover, stale cursor) against synthetic pools, so the engine can be checked without Plex or the DB.

### Changed

- **Schedule Backfill builds windowed (~12h) and in bigger batches (10 → 25).** A cheap windowed build means the whole lineup gets a timeline in a run or two instead of ten channels every ten minutes; the hourly Schedule Refresh grows each one from its stored cursor. **A full build is still the default everywhere else** — editing a filter and hitting *Generate schedule* rebuilds the entire timeline exactly as before.

_(Schema change — requires `pnpm db:push` + `pnpm db:generate`; backend needs a restart.)_

## [0.5.19] - 2026-07-19

### Changed

- **Channel preview grid caps at ~2 rows** (`max-h-[30rem]`, tuned for the wide desktop layout) and scrolls beyond that, so a big channel's poster grid stays compact instead of pushing the schedule far down the page.

## [0.5.18] - 2026-07-19

### Added

- **Artwork preview tiles on the channel page (auto-loading).** The channel builder's preview is no longer a plain "N items · title, title…" string — it now shows a **poster grid** of what the channel resolves to, loaded automatically when you open an existing channel. A show's episodes coalesce into one tile with an **episode-count badge** + season line; movies show their year; each tile pulls real Plex art through the existing `/img/:channelId` proxy. The grid is a **scroll-capped** container (handles hundreds of tiles), posters **lazy-load** as you scroll with a **per-tile skeleton** that fades into the image, and the preview query runs async so it never blocks the page. Backed by a new `channels.preview` procedure (full `PlexItem`s via the shared coalescing service). The channel page was also **widened** (`max-w-2xl` → `max-w-6xl`) to give the grid room. _(New tRPC procedure — needs a backend restart.)_

## [0.5.17] - 2026-07-19

### Added

- **Live "Thinking…" indicator in the AI chat.** While the model reasons, the chat now shows an auto-expanding **"Thinking… Ns"** ticker (with the reasoning streaming in) instead of a bare spinner, then collapses to **"Thought for Ns"** when it's done; reasoning loaded from history stays a quiet collapsed "Reasoning". There's also a standalone "Thinking…" bubble for the gap right after you send, before the first token streams back — so a long turn always reads as working, not stuck. Built by upgrading our base-lyra Reasoning AI-Elements component (no upstream registry).

## [0.5.16] - 2026-07-19

### Fixed

- **The AI chat "hang" — the actual root cause: Bun's 10s server idle timeout.** The server exported the Hono app directly, so Bun served it with its **default `idleTimeout` of 10 seconds**. An AI turn (extended thinking + a large context + several tool calls) routinely goes longer than 10s before the first byte or between chunks, so Bun closed the socket mid-stream (`request timed out after 10 seconds`) and the reply never landed — which then persisted a half-finished turn. The server now exports `{ port, idleTimeout: 255, fetch }`, raising the idle timeout to Bun's maximum; each streamed byte resets the clock, so only a genuinely stalled connection is cut. The v0.5.13–0.5.15 caching + lean-preview work still matters (it keeps turns fast and cheap), but this is what was actually severing the stream. _(Server — needs a restart.)_

## [0.5.15] - 2026-07-19

### Changed

- **Preview now returns full `PlexItem`s with episodes coalesced up into the show — on the canonical schema, with 3 detail levels.** The v0.5.14 pass stripped episodes correctly but reshaped each entry into a bespoke `{ show, seasons, episodes }` stub that deviated from `PlexItem` (the type everything else speaks). Now `preview_filter` / `search_titles` return real `PlexItem`s: a show's many episodes **coalesce into a single show item** — pulled from the `MediaItem` cache so it carries the true parent-show metadata (genres, cast, studio, art) — annotated with `episodes` + `seasons` counts; movies pass through as their own item. A new **`detail`** param picks the depth: **`quick`** (guide trimmed of summary/cast/art for a fast glance), **`default`** (full item metadata, episodes coalesced), or **`verbose`** (every matched episode as a full item). Verified on a 2,816-episode filter: 16 shows at ~7k chars (quick) / ~13k (default) vs 400 episode items / ~270k (verbose). The agent gets the real metadata picture without the episode flood, and the same shape will feed the coming admin preview tiles.

## [0.5.14] - 2026-07-19

### Changed

- **`preview_filter` / `search_titles` return a lean summary to the model — big previews no longer bloat the chat.** A preview can match thousands of episodes; the agent was being handed the full rich payload (poster paths, genres, ratings for up to 60 entries) on every call, which is what grew a conversation to 100k+ tokens. The tools now return just what the model needs to reason: **totals + which shows match (each with its season & episode counts) + which movies** — e.g. `{ show: "Pokémon", seasons: 11, episodes: 583 }`. Measured **~85% smaller** per call. Actual episode titles are available on demand via a new **`verbose: true`** tool param. The **rich shape is unchanged** for the (coming) admin preview tiles — the grouping now also computes a **season count** per show, and the lean projection happens only at the agent boundary.

## [0.5.13] - 2026-07-19

### Fixed

- **Long AI chats no longer feel "hung" — prompt caching.** A channel-building conversation grows fast (each `preview_filter` returns dozens of show/movie entries) and was hitting **120k+ tokens re-sent to Anthropic *uncached* on every turn** — tens of seconds of reprocessing latency per reply, which read as the assistant hanging (and gave a slow turn more room to abort mid-reasoning). The chat now sets an Anthropic **`cacheControl: ephemeral`** breakpoint on the conversation prefix (system + tools + prior turns), so each turn reuses the cached prefix and only the new delta is processed fresh. Measured on a real 120k-token chat: a follow-up turn went from ~120k uncached input tokens to **~30k fresh + ~220k served from cache** — much faster and ~10× cheaper on the cached tokens. Namespaced to Anthropic, so it's a no-op for other providers. _(Backend — needs a restart.)_

## [0.5.12] - 2026-07-18

### Fixed

- **The AI assistant now survives real conversations — tool approvals, resume, and persistence hardened.** Approving a write (create/update/delete channel or package) was **stuck on "Working" forever and never hit the server**: `useChat` needs `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` to actually POST the approval-resume — without it `addToolApprovalResponse` only records the decision locally. Added it, so an approved tool now runs, streams its result, and the card completes. Also fixed three ways a chat could **silently stop responding**: (1) a crashed/abandoned tool approval left a dangling tool call that bricked every later turn with `MissingToolResultsError` — a new `healDanglingToolCalls` guard closes out any resultless tool call the user has moved past (injecting a "not applied" result) while leaving a live approval alone; (2) interrupted turns persisted broken `streaming`/unsigned reasoning blocks that Anthropic rejected as "unsupported reasoning metadata" and that poisoned subsequent requests — reasoning fed back to the model is now sanitized to keep only complete, **signed** thinking blocks (which the approval-resume genuinely needs) and drop the rest; (3) the tool-call card crashed the whole panel (`Cannot read properties of undefined (reading 'icon')`) on the `approval-responded` state, now mapped with a catch-all fallback. Raised the per-turn tool-step cap 16 → 40 so long discovery/build loops don't end without a reply, and the **Approve / Deny** buttons now show on the collapsed tool card (persistent footer) instead of only when expanded.

## [0.5.11] - 2026-07-18

### Fixed

- **AI chat multi-step turns now persist.** A turn that ran tool calls (multiple steps) was lost from history — the assistant's response vanished on reload. Persistence now upserts the **whole conversation by each message's own id** (both up front and on finish), so multi-step / tool turns are captured and the reloaded ids round-trip without duplicating. Added `onError` logging + a `show-ai-history.ts` debug script.

### Changed

- **`preview_filter` / `search_titles` return grouped, artwork-ready results** instead of a flat title list: **shows aggregated with episode counts** + movies, each with a poster path — far more useful for the agent (and the shared shape the admin channel-builder preview will use). The agent's system prompt also now knows the **`title` "is" operator is a Plex substring/contains match** (`title is "Bear"` matches anything containing "Bear").

## [0.5.10] - 2026-07-18

### Added

- **The AI assistant can now build channels — the tool layer (increment C).** The chat has a full, grounded toolbox over your real services: **discovery** (`list_media_sources`, `library_overview`, `list_filter_fields`, `discover_field_values`, `search_titles`) and **`preview_filter`** (resolve an unsaved filter → count + sample), so it builds filter trees ONLY from real library data and verifies before creating; **inspection** (`list`/`get` channels + packages); and **writes** — `create_channel`, `update_channel` (any subset — even just a number or package), `delete_channel`, bulk `update_channels` / `renumber_channels`, `create`/`update`/`delete_package`, and `clear_ai_generated`. **Writes require the admin's approval**: the chat pauses and shows an **Approve / Deny** card (AI SDK native tool-approval) before anything touches the DB. AI-made rows are flagged with a new **`aiGenerated`** provenance field (on Channel + ChannelPackage), so they're cleanly reversible. The tools are plain reusable services — the coming **workflow-SDK** "analyze the whole library and build everything" job will call the exact same functions. _(Requires `pnpm db:push` + a backend restart.)_

## [0.5.9] - 2026-07-18

### Added

- **Tool-call + reasoning rendering in the chat.** New base-lyra **Tool** and **Reasoning** AI Elements components, and the assistant thread now renders the model's tool calls (collapsible cards showing the tool name, status, input, and output/error) and its reasoning inline — the UI groundwork for the channel-building tool layer.

## [0.5.8] - 2026-07-18

### Added

- **The chat's input footer shows the active model** as a badge (Sparkles + model name) — clicking it opens a dropdown to **switch the active connection** right from the chat, like AI Elements' model selector.
- **Empty state when no model is connected.** If there are no AI connections yet, the whole assistant panel shows a "No model connected" state with a **Set up a model** button that jumps to Settings → AI Assistant, instead of a broken chat.

## [0.5.7] - 2026-07-18

### Changed

- **Removed the divider line between the chat textarea and its footer** — the input card now reads as one continuous surface.

## [0.5.6] - 2026-07-18

### Changed

- **The AI chat's input is now a single unified card** (matching AI Elements' PromptInput): a taller, auto-growing textarea with a divider and a footer row (tools on the left, send on the right), and the **focus ring wraps the whole control** — textarea + footer + send button — via `focus-within`, instead of just the textarea. Enter sends / Shift+Enter makes a newline; it clears on submit. Bumped the default textarea height so the footer no longer crowds it.

## [0.5.5] - 2026-07-18

### Added

- **The AI assistant chat is live (increment B).** The reserved global side panel (0.5.3) is now a working **streaming chat** against your active AI connection (0.5.4) via the Vercel AI SDK (`streamText` → `useChat`, a new cookie-authed admin-only `POST /api/ai/chat` route). **Chat history persists** — every exchange saves to the `AiConversation` / `AiMessage` tables, and the panel lets you start a **New chat** or resume any past one from **History** (with delete).
- **Base-lyra "AI Elements" components.** The upstream AI Elements registry assumes stock (Radix) shadcn and tries to overwrite base-lyra's own components, so we built our own equivalents on base-lyra: **Conversation** (auto-stick-to-bottom via `use-stick-to-bottom` + a scroll-to-bottom button), **Message** / **MessageContent** (user/assistant bubbles), **Response** (streaming markdown via `streamdown`), and **PromptInput** (textarea + submit, Enter-to-send). More (tool-call cards, reasoning) will come with the tool layer.

> No tools yet — it's a grounded conversational assistant that helps you think through channels. The channel-building **tool layer + propose-then-approve** is increment C. Requires a backend restart.

## [0.5.4] - 2026-07-18

### Added

- **AI provider connections (Settings → AI Assistant).** Configure one or more AI model connections for the channel-building assistant and pick which is **active** (what the chat uses). Each is a provider (Anthropic / OpenAI / Google / **OpenAI-compatible / local**) + a **model dropdown** (curated per provider, with a custom option) + optional base URL (for local endpoints — Ollama, LM Studio, vLLM, OpenRouter) + an API key **encrypted at rest** (AES-256-GCM keyed off `BETTER_AUTH_SECRET`). Each connection can be **tested** (a cheap round-trip that proves the model actually responds) and **set active**. Built on the **Vercel AI SDK** provider factory (`getModel`) so the rest of the agent stays provider-agnostic. New `AiConnection` table (+ `AiConversation` / `AiMessage` tables ready for the chat's history persistence) and an `ai` tRPC router; added the base-lyra `select` + `badge` components. _(Requires `pnpm db:push` + a backend restart.)_

## [0.5.3] - 2026-07-18

### Added

- **Slide-in side-panel system in the admin (ported from BasicTimeTracker).** The authenticated layout now hosts a right-side panel that slides in beside the inset content card, with BTT's two modes: **global panels** (local state, persist across navigation — for always-available surfaces like the AI assistant) and **URL-param route panels** (`?panel=<type>`, shareable / refresh-survivable, content declared by the matched route's context). Global wins when both are set. Panel content publishes its own title / meta / footer up to the chrome via **portals** (matching the use-portals-not-slots convention). An **AI Assistant** button (Sparkles) in the top header toggles the reserved `chat` global panel — a placeholder for now; the next arc fills it with the Vercel AI SDK chat, the channel-building tool layer, and the provider/model config. New: `@ChannelGuide/ui` `side-panel` primitives, `details-panel-provider`, `panel-header-provider`, `DetailsPanel`.

## [0.5.2] - 2026-07-17

### Added

- **Device settings: per-codec capability overrides.** The Device page now lists this TV's video / audio / container support (in two columns), each with a toggle, showing what the diagnostic **measured**, any **known-issue** default (VP9, DTS/TrueHD — now defaults you can override rather than hardcoded), and an **Override** badge when a toggle diverges from what the diagnostic found. You can **force a codec on or off** — forcing on something the panel can't actually decode is flagged with a "Forced" warning — and **Reset to diagnostic** clears all overrides. The device's recent playback errors are listed for context, alongside its info (model / webOS / resolution / HDR). Backed by a new `capabilityOverrides` JSON column on `TvDevice`; `getDeviceNativeCaps` now layers **measured → known-issue quirks → overrides**, so playback honors your toggles. New endpoints `GET`/`POST /api/v1/device/caps` + `POST /api/v1/device/caps/reset`. _(Requires `pnpm db:push` + a backend restart.)_
- **About page** — the app is now **Airwave**; the subpage shows the version (tracked from `appinfo.json`) and a short description.

### Changed

- The settings sidebar gains an **About** category, and the focused settings row now **scrolls into view** as D-pad focus moves down a long page.

## [0.5.1] - 2026-07-17

### Changed

- **Settings is now a master-detail shell with a sliver sidebar.** `/settings` gains a left sidebar reusing the guide's glass-circle treatment — a quiet sliver of circles (Guide · General · User · Device) that expands to labels when focused — over nested subpage routes (`/settings`, `/settings/user`, `/settings/device`) that all share one consistent layout. D-pad: on the rail ▲/▼ move between categories, OK opens one (Guide returns to live TV), ► enters the page's content, Back returns to the guide; in the content ▲/▼ move between options, OK activates, ◄/Back returns to the rail. The old flat settings list is replaced by **General** (app prefs + back to guide), **User** (sign out), and **Device** (Run capability diagnostic + Remote key probe). The device capability toggles + reset land next (0.5.2).

## [0.5.0] - 2026-07-17

Opens the 0.5.x line.

### Changed

- **The capability diagnostic is now a polished onboarding screen.** The setup flow (auto-run on first sign-in, or Settings → Run capability diagnostic) is centered and clean: the clip being tested plays inside a framed "screen," and the format under test — its label plus container/codec chips — **slides in and out with Framer Motion** as the run advances, over a single filling progress bar with a live "N native · M transcode" tally beneath. On completion a check-mark pops into the frame and a Continue button fades up. The **measurement logic is unchanged** (same per-clip native-decode test + post-run audio-track verdict, same `DeviceCapability` writes) — only the presentation changed; the old dense debug results grid is gone (per-clip detail still lives in the DB / PlaybackLog and the remote/probe tooling).

## [0.4.33] - 2026-07-17

### Changed

- **The full-screen "Channel Surf" control now opens the surf carousel.** It previously dropped the player to the mini feed (a leftover from before channel surf existed) — pressing it now closes the feature panel and slides up the channel-surf carousel, which is what the button says it does.

## [0.4.32] - 2026-07-17

### Fixed

- **Channel surf now auto-hides, and opens on the current channel.** Two fixes to the new carousel: (1) the ~12s auto-hide never fired — the player status ticks ~twice a second, re-rendering the chrome and handing surf a fresh `onClose` that restarted the countdown every time; the timer now lives in its own mount-scoped effect (reading `onClose` through a ref), so it actually reaches 12s. (2) Opening surf pre-stepped one channel in the pressed direction; it now opens **centered on the channel you're already watching**, marked with a subtle "Watching" flag above that tile, and ◄/► move from there.

## [0.4.31] - 2026-07-17

### Added

- **Channel surf — ◄/► brings up a channel carousel while watching (§7.2, Arc 3; completes the remote-navigation arc).** With the full-screen chrome closed, pressing left/right slides a horizontal carousel of channel tiles up from the bottom (same slide as the feature panel), opening one step in the pressed direction. Each tile shows the channel (icon / number / name in its accent), its **cover art**, a **progress bar** for how far into the current program it is, and the **title / episode** on now. ◄/► move — **wrapping**, so channel 1 → the last channel is a single press — **OK tunes** the highlighted channel, **Back closes** without changing, and ~12s of no input auto-hides it back to the video. The row is **virtualized horizontally** (`@tanstack/react-virtual`, like the guide grid) so 100+ tiles and their cover images stay cheap — only the visible window loads. While it's up it owns ◄/►/OK/Back via a shared `surfActiveRef`, so number entry, CH▲/▼, and the player chrome all defer to it.

## [0.4.30] - 2026-07-17

### Added

- **CH▲/▼ changes the channel while watching (§7.2, Arc 1).** The remote's channel up/down — **PageUp/PageDown, keyCode 33/34** on the C2 — steps one channel through the ordered lineup (up = the next-higher number), clamped at the first/last channel (no wrap). It's a while-watching gesture (full-screen or mini); on the guide with nothing playing it's a no-op. No banner — a tune already opens the feature panel showing the new channel. Behind an **in-flight lock** (per spec, *not* a debounce): a press fires immediately and any further CH press is ignored until the new channel has actually loaded — the persistent player remounts on a channel change, so this prevents rapid-press reload thrash — with a timeout backstop if a channel errors and never plays. Also testable in a desktop browser (PageUp/PageDown). Stepping lives in the provider (`channelStep`) since it shares the lock with the player's load lifecycle.

## [0.4.29] - 2026-07-17

### Added

- **Channel number entry — type a number on the remote to tune it (§7.2).** From the guide, the full-screen player, or the mini feed, typing digits drops a glass overlay from the top-center (same treatment as the channel pill) showing the number with placeholder slots. **OK — and only OK — commits**, tuning that channel full-screen if it exists or flashing red briefly if it doesn't; there's deliberately no commit-on-timeout and no auto-commit as soon as digits resolve (a toddler mashing numbers never jumps channels on its own). An arrow breaks out and passes through to normal navigation, Back cancels the entry, and a stretch of inactivity quietly dismisses it *without* tuning. Number→channel lookup is client-side against the already-loaded lineup (no server round-trip), via a new shared `use-channel-nav` foundation (ordered lineup + `byNumber`, plus next/prev ready for the upcoming CH▲/▼ arc). While entry is active it's **zoned** so OK/Back reach only it — the guide and player chrome defer via a shared context ref (`numberEntryActiveRef`) paired with `stopImmediatePropagation`, so there's no stray tune, app-exit, or pop-to-mini underneath. (Internally, the player context was split into `player-ctx` to break a Fast-Refresh import cycle.)

## [0.4.28] - 2026-07-17

### Added

- **Remote key probe (Settings → Remote key probe).** A dedicated diagnostic route (alongside the capability diagnostic) that shows the raw key event for every remote button press — `keyCode` front and center, plus `key`/`code`/`which`/`location`/`repeat` and keydown-vs-keyup — newest first. webOS surfaces its special keys only via `keyCode` (Back is 461; the CH▲/▼, color, and other buttons are otherwise unknown, and the desktop simulator won't reveal them), so this reads them straight off the panel. It swallows every key so probing never navigates away; **double-press Back** (or click **Exit** with the magic-remote pointer) to leave. This unblocks the remote channel-navigation arc (§7.2) — we can now capture the real CH keycodes on the C2.

## [0.4.27] - 2026-07-17

### Changed

- **The favorite heart shows a clear focus ring when its channel rail is focused.** Focusing a channel's rail in the guide is the affordance to favorite/unfavorite it (OK toggles), but the heart didn't read as the interactive target. It now gets a circular outline in the same blue the program focus uses. The heart's own size, color, and position are unchanged — the padding that reserves the ring's space is constant (an outline takes no layout space), so the icon never shifts when focus lands on it.

## [0.4.26] - 2026-07-17

### Changed

- **The bumper countdown is now a draining donut.** The between-programs "Coming up next" card used to pop/enlarge the number on every tick; it now shows an accent ring that **empties like a pie/loader** as the countdown runs, with the seconds held steady in the middle. The ring drains off a local clock (smoothed with a CSS `stroke-dashoffset` transition) and represents the whole bumper length, so it winds cleanly from full to empty.
- **The bumper's cover art is a touch more visible.** The blurred backdrop was dimmed a little too far — eased the image opacity up (0.5 → 0.62), the blur down (48 → 40px), and the dark overlay lighter, so the upcoming program's art reads without hurting text contrast.

### Added

- **A bumper now shows something in the mini feed too.** When a bumper hit while the player was docked as a mini feed in the guide, the video area just went blank (the full bumper card only draws in full-screen). The mini feed now shows a **compact** version — the donut countdown + an "Up next · {title}" blurb (no art) — so the interstitial is visible there as well.

## [0.4.25] - 2026-07-17

### Changed

- **Guide featured-panel badges now carry a subtle left→right gradient.** The 4K/HD, HDR/DV, audio-channel (Stereo/5.1/7.1), and ATMOS/DTS:X badges keep their existing base colors, but each now fills with a `linear-gradient(90deg, …)` that starts at that color and deepens slightly toward the right — a soft sheen rather than a flat block (identical at the left edge). Text colors are untouched; plain gradients render fine on the C2's Chrome 108.

### Added

- **The watch player's Info view now shows how the current program is being delivered.** Pressing **Info** in the full-screen chrome tucks a small **Playback** readout under the details: the delivery mode (**Direct Play** / **HLS Transcode** / **Progressive Transcode**) as an accent pill, then the container, video codec, and audio codec as chips — each codec chip annotating Plex's copy-vs-transcode call (amber when it's re-encoding). When a direct-play uses a client-side audio-track switch (the Avatar / Gladiator II case), the audio chip shows the selected track's label instead. Backed by a new `delivery` field on the player status, captured from the resolved media at each program load — so it's a from-the-couch diagnostic without digging into PlaybackLog.

## [0.4.24] - 2026-07-17

### Fixed

- **VP9 video now transcodes instead of tanking the app.** VP9 decodes in isolation (the capability diagnostic passes it — it's what YouTube uses) but fails every real path on the LG C2: raw-file `<video>` direct-play of `mkv/vp9` errors (code 4, `SRC_NOT_SUPPORTED`), and VP9 *copied* into fMP4/MSE **software-decodes**, pegging the CPU so the whole app goes unresponsive (Back / channel-change took ~30s until the stream was killed). VP9 is now a device-quirk exclusion (`UNRELIABLE_VIDEO` in `codecs.ts`, the video analog of `UNDECODABLE_AUDIO`): it's dropped from the panel's credited video set, so `getPlaybackInfo` won't direct-play it and the HLS profile won't advertise it as a copy target → Plex re-encodes the video to H.264, which hits the hardware decoder. Confirmed on the C2 (Ms. Rachel, `mkv/vp9/aac`). Server-side only.

### Added

- **A proper channel/package accent palette + per-channel colour variance.** Channels and packages now choose from a fixed **16-swatch palette** (a stored swatch **key** like `orange`, not a hex — each app computes the colour from the key). Every swatch has a **vivid** value (shown small: the picker swatch, the sidebar package dot) and a hand-tuned **muted** value (large surfaces: the guide's rail/cell fill + channel icon) — "store vivid, present muted", so saturated tones never glow against the dark grid. Palette lives once in `@ChannelGuide/ui/lib/accent-palette` (both apps) with a server-side key mirror in `packages/api/services/accents.ts`.
- **The generator now gives channels colour variance.** Previously every channel inherited its package's single colour, so the guide read as long same-colour bands down each package's contiguous channel numbers. The generator now assigns each channel a **cycled accent** (a running index through the palette) so adjacent channels contrast — restoring the lively per-row variance while staying a fixed, overridable palette choice. Packages keep their own colour for the sidebar.
- **`backfill-accents.ts`** — migrates the existing DB in place (no regeneration needed): remaps package tint tokens to keys (`gray`→`slate`; the rest already matched), and assigns the variance accent to all generated channels. Idempotent, with a dry-run default.

### Changed

- **Admin accent picker + tiles use the palette.** The channel/package appearance picker now shows the 16 vivid swatches; channel/package/guide tiles render the palette's exact muted hexes via a new `AccentIconTile` (so the admin matches the TV). The app's own nav/breadcrumb chrome is untouched (it keeps `TintedIconTile`). Channel/package `tint` inputs are coerced to a valid accent key server-side.
- **The TV now colors everything from the channel's real accent** (its own key, else its package's), replacing the index-derived accents: the guide rail/cell fill + channel icon, the featured panel's icon tile + muted-tinted channel number/name + progress fill (all **muted**, for large surfaces over the slate grid), and the full-screen player chrome — channel chip, scrubber/progress fill, control buttons, bumper card, mini-feed buttons (all **vivid**, since they sit over black video where the muted tint reads washed out). "Store vivid, present muted" applied per context.

### Changed

- **The featured now-playing card gets more height.** Retiring the top Guide/Settings segmented control into the sidebar freed the vertical space it occupied; the featured panel's scale is bumped (0.72 → 0.80) to take it back. The grid keeps the remaining height and stays comfortably scrollable.

## [0.4.21] - 2026-07-16

### Added

- **Guide sidebar (step 1) — filter the channel grid by package.** A collapsed **sliver** of glassmorphism circle buttons sits at the left of the guide; D-pad **left** off the leftmost program lands on the **channel rail**, and left again focuses the sidebar, which **expands to reveal a label beside each circle**. The layout reserves only the sliver's width and the expansion is a pure **overlay**, so the guide never shifts, reflows, or smooshes the program blocks / time axis (and the expand animation costs no re-renders). Collapsed it stays quiet — just the **actions** (Guide / Settings / Account) and a single **Filters** circle standing in for the whole filter group (lit in the active filter's accent when one is applied). On focus the real lenses — Favorites, Recents, then each channel **package in its own stored tint + icon** — **fade in, staggered**, in a scrolling list that keeps the focused circle in view. Selecting a package filters the grid to it and stays lit; selecting the **already-applied** filter toggles it back off to all channels; **Guide** clears to all channels; **Settings**/**Account** navigate / sign out.
- **Favorite channels (per user, synced across devices).** Focus a channel's **rail** and a **heart** appears beside its icon — filled when favorited; **OK** (or a click) toggles it. Backed by the long-dormant `Favorite` table via `GET /api/v1/favorites` + `PUT`/`DELETE /api/v1/favorites/:channelId` — the method carries the **desired state** rather than toggling server-side, so it's idempotent (a retry or double-press can't flip it back), and the TV flips its cached set **optimistically** so the heart responds instantly. The **Favorites** lens filters the grid to them.
- **Recently-watched channels.** The **Recents** lens shows the channels you've actually watched, **deduped** and **most-recent-first** (the one lens not in channel-number order). `WatchSession` couldn't serve this — it's `userId @unique`, i.e. only the *current* session — so the heartbeat now also upserts **`ChannelWatchState`** (previously declared but never written): its `@@unique([userId, channelId])` dedupes to one row per channel for free and `updatedAt` is the recency order. Exposed as `GET /api/v1/recents`. This also seeds the cross-device resume that table was designed for.
- **`GET /api/v1/packages`** — the channel packages that have at least one **enabled** channel (the sidebar's canonical filter list, ordered by the admin `sortIndex`), via a new `listActivePackages` service. The guide's channel payload now also carries `package.id`/`key`, so the grid filters by package **id**.
- **Shared `GlassCircleButton`** — the player chrome's glass circle treatment (blur + translucent + accent focus ring) extracted for reuse by the sidebar, with a per-item accent so packages glow in their own tint. Tint **tokens** (`blue`, `rose`, …) now resolve to hex on the TV via `lib/tint.ts`.

### Fixed

- **The channel rail is now a D-pad focus stop** between the grid and the sidebar (OK on it is inert for now — the Favorites step will make it toggle favorite/unfavorite).

### Removed

- **The top Guide/Settings segmented control is gone** — the sidebar owns that navigation now (Guide / Settings / Account), and the reclaimed vertical space goes to the guide. Up from the top channel row still docks into the mini feed.

## [0.4.20] - 2026-07-16

### Fixed

- **Off-window and sliver guide programs are dropped from navigation *and* render.** The guide API returns a small back-buffer past the rail start, and a program clamped tight to the rail could compute to a near-zero/negative width (which is invalid CSS, so the block auto-expanded to fit its content — a mis-sized stub). Such programs — ones that ended before the rail start, or that would render narrower than a small pixel threshold (`MIN_VISIBLE_PX`) — are now filtered out of each channel's `programs` at the source, so they're **neither shown nor D-pad-navigable** (you can no longer left-arrow onto a program that isn't on screen). The currently-airing program is never affected (always well within the window and full-width). Filtering stays client-side because "too tiny to show" is a pixel judgment tied to the panel's lane width.

### Changed

- **Channel up/down in the guide now snaps to the currently-airing program.** Moving between channels previously preserved a horizontal *time cursor* — it matched whatever program aired at the same time position on the next channel (cable-guide time-column alignment). It now always highlights the next channel's **"on now"** program instead; left/right still browses that channel's past/future programs as before. The time-alignment logic is retained behind a `TIME_ALIGN_CHANNEL_NAV` flag (default `false`) via a `pickAtLive` wrapper mirroring `pickAtCursor`, so the old behavior can be flipped back on.
- **Live program's progress-fill direction is now a flag.** The two-tone tint on the currently-airing card (stronger for elapsed, weaker for the remainder) can be reversed via `PROGRESS_FILL_ELAPSED_STRONGER` (default `true` keeps the current look).

### Fixed

- **A narrow clamped guide program no longer overflows into its neighbor.** A program that started before the grid's left edge is clamped to the rail with a shrunk width; when that width was smaller than the block's horizontal padding, `box-sizing: border-box` couldn't shrink the element below its padding, so it floored to ~42px (padding + borders) instead of its real ~19px and overlapped the next program. The padding now lives on an inner wrapper that the block clips, so the block always renders at its exact geometric width.

### Removed

- **The leftover D-pad legend** ("◄► programs · ▲▼ channels · OK to watch") pinned to the bottom-left of the guide — it overlapped the program grid and is no longer needed.

## [0.4.18] - 2026-07-16

### Added

- **HDR / Dolby Vision / Atmos captured during metadata sync + badged in the guide.** The featured panel now shows an **HDR** badge (or **DV** for Dolby Vision) beside the 4K/HD badge, and an **ATMOS**/**DTS:X** badge beside the audio badge. These live on the video/audio *streams*, which the section listing omits by default — so the sync now requests them inline with **`includeElements=Stream`** (the same bulk call, no per-item fetches; verified it doesn't strip the genre/cast tags) and `getPlaybackInfo`-style parsing derives HDR from the video stream's `colorTrc` (`smpte2084`→HDR10, `arib-std-b67`→HLG) or the Dolby-Vision flag, and object-audio from the audio stream titles. Stored on the cached `GuideMeta` (a JSON column — no migration), so the guide reads them straight from the `MediaItem` table.
- **A few other useful fields now captured in the same sync call** for future use: `videoCodec` (hevc/h264/av1), `dynamicAudio` (Atmos/DTS:X), and `addedAt` (library add date, for recency / "New" cues).

> Run **Sync Metadata** once to backfill these onto existing library items.

## [0.4.17] - 2026-07-16

### Changed

- **Guide mini-feed fills the featured panel's height.** The docked mini player was sized by a fixed width with a 16:9 aspect ratio, so its height was width-derived and, with the row top-aligned, it sat short against the top of the featured panel leaving a gap below. It now stretches to fill the panel's available height (bottom-flush — the panel has no bottom padding) while keeping a fixed, bounded width (the video's `objectFit: cover` fills the taller slot), so the feed spans the featured section top-to-bottom and stays on-screen on the webOS simulator (deriving width from a stretched height via `aspect-ratio` overflowed off-screen there).
- **Featured description uses the full available width.** The now-playing summary had a fixed `maxWidth` that capped it well short of the column, leaving empty horizontal space beside it. The cap is removed so it fills the room left beside the mini feed (still clamped to two lines).

## [0.4.16] - 2026-07-16

### Added

- **Direct-play with a client-side audio-track switch — the real fix for TrueHD/DTS-default 4K HDR (e.g. Avatar).** When a file's container + video are natively decodable but its *default* audio isn't (TrueHD/DTS/ALAC), yet it carries a **decodable companion track** (Avatar's TrueHD 7.1 default alongside an AC3 5.1), playback no longer drops to an HLS transcode (where the copied ~50 Mbps HDR video blew past the MSE SourceBuffer quota and buffered endlessly). Instead the raw file **direct-plays** — no transcode, HDR/HEVC untouched, entirely off the MSE path — and the server tells the client **which audio track to select** on load. A new `getPlaybackInfo` middle case picks the best decodable audio track — preferring a real program track over a **commentary**, then most channels — and returns `directAudio` with its **index among the decodable tracks** (which is exactly what the panel exposes, since it hides tracks it can't decode); the TV player switches to it via `video.audioTracks` after `loadedmetadata`. No Plex-side PUT is involved: a raw-file direct-play serves the file as-is, so Plex's selected-stream state wouldn't ride along — and since the browser's `AudioTrack` API exposes no codec, the **server** names the track and the **client** enables it. The panel's exposed audio-track list + the selected index are recorded to `PlaybackLog` (`caps.audio`).
- **Client falls through same-language audio tracks before dropping to HLS.** Measured on the C2, `video.audioTracks` does **not** match Plex's file order — the panel reorders and even hides tracks (Avatar's 2 audio streams surfaced as 1). So the server's `audioIndex` is a first guess, not a certainty: the player now enables that candidate, and on a `<video>` decode error tries the **next same-language track**, exhausting them before it falls back to the (buffering) HLS transcode. This turns files where the panel exposes multiple tracks (which previously errored straight to HLS) into native direct-plays when any exposed same-language track is decodable.
- `sim-audio-directplay.ts` — server-side test of the flow (PUT-select a decodable track, re-read metadata, and diff Plex's `/decision` before/after — proving the file's embedded `default` flag is immutable and `Media.audioCodec` doesn't follow the selection, which is *why* the switch must happen client-side). `sim-title.ts` now prints `directAudio`.

## [0.4.15] - 2026-07-16

### Changed

- **Aggressive HLS buffering for high-bitrate 4K HDR.** When a very high-bitrate 4K HDR HEVC video is *copied* into the HLS transcode (e.g. ~50 Mbps Avatar, forced there only because its TrueHD audio must transcode), hls.js's default 60 MB buffer (≈ a few seconds) thrashed over Wi-Fi — `bufferFull ↔ bufferStalled ↔ bufferSeekOverHole`. The player now buffers as aggressively as the browser allows: `maxBufferSize` raised so hls.js's own cap never binds before the MSE quota (~150 MB, the hard ceiling), a long forward `maxBufferLength`, a tiny `backBufferLength` so the whole quota goes to the *forward* buffer, and `maxBufferHole` tolerance so it doesn't stall re-seeking small gaps. Video is still copied (untouched); this only changes how much is buffered ahead.

### Added

- `probe-title-streams.ts` — read-only inspector for a title's bitrate + every audio track (codec/channels/default), for deciding delivery (e.g. spotting a decodable secondary audio track on a TrueHD-default UHD rip).



### Added

- **Idle mini-feed auto-expands to full-screen** (default 60s of no input). With only the small mini feed playing over the guide, the TV's screensaver would eventually blank everything but the tiny video; a fullscreen video keeps the panel awake, so after an idle stretch the mini feed goes full. Any remote/pointer activity resets the timer.



### Fixed

- **Grid fully deselects when focus moves to the nav pill / mini feed.** The row highlight already dimmed, but the focused program *block* kept its outline (its `focusedProgramId` wasn't gated on the zone), so a channel still looked selected while you were on Guide/Settings. Now nothing in the grid is highlighted when focus isn't on the grid.
- **Snappy fast-scroll.** The wheel handler read `fc` from the render closure, so a burst of ~15 ticks all saw the same stale value and advanced one-per-render (the lag before it caught up). It now accumulates through a synchronous `fcRef`, so a fast scroll jumps straight to the target channel.



### Fixed

- **No stray tune when activating the nav pill.** The magic-remote OK button also fires a *click* on whatever the pointer is hovering, so pressing OK on the Guide/Settings pill was clicking the (still-highlighted) channel underneath and tuning it. A channel-row click now only tunes when the **grid** is the focused zone; on the pill or mini feed a click just returns to the grid. The channel highlight also **dims when focus is on the pill or mini feed**, so it's clear where focus is.
- **Wheel / scroll-ring now moves the selection like a D-pad**, one channel per tick (fast), instead of slowly free-scrolling the grid. (Non-passive wheel listener that drives `fc` up/down and lets the virtualizer scroll to it.)

### Added

- **The channel overlay opens automatically when you tune a channel** (and auto-hides after the normal timeout, or on Back) — so you see the channel/program info + controls on open without pressing OK first.



### Added

- **D-pad up reaches the Guide/Settings nav pill.** From the top channel row, Up now leaves the grid — into the mini feed if one's playing, then Up again (or directly, if no feed) to the **Guide/Settings segmented control**. Left/Right move between the tabs, OK activates (Settings navigates; Guide returns to the grid), Down returns to the grid. The focused tab shows a ring (inset outline, no layout shift).
- **Magic-remote pointer + scroll-wheel support on the guide.** Clicking a channel row with the motion pointer tunes it (same as OK). Scrolling with the wheel keeps the D-pad focus following the view (the highlighted/tuned channel stays on-screen), so pointer-scrolling and D-pad navigation stay in sync — guarded so it doesn't fight the D-pad's own scroll.



### Changed

- **Guide grid is virtualized — fixes the painfully slow scrolling on the C2.** With 100+ channels × several program blocks each, rendering every row up front made scrolling crawl on the TV browser (and bloated the DOM compositing behind the full player). The channel rows now use `@tanstack/react-virtual`: only the visible rows plus an **overscan of 10 above/below** render (so nothing pops in mid-scroll), sized from the dynamic viewport-derived row height (remeasured on resize). D-pad focus scrolls via the virtualizer's `scrollToIndex`. The now-line/marker overlay and per-row time-lane math are unchanged.
- **Hid the grid scrollbar** — it never showed on the C2 but appeared in the desktop browser sim. `scrollbar-width: none` + `::-webkit-scrollbar { display: none }` on the grid's scroll container.



### Fixed

- **HLS transcode audio is now AAC (was Opus) — fixes the mid-stream audio cutout.** The HLS transcode target advertised `{aac, opus}` (measured caps ∩ MSE-safe), and Plex picked **Opus** — which cut out mid-stream on the C2 while the video kept playing (confirmed on the HDR + DTS test channel). Opus removed from the MSE-safe set (`{aac, mp3}`), so the target advertises only AAC and Plex transcodes audio to AAC — the bulletproof MSE codec. No quality tradeoff (the audio is transcoded either way); direct-play keeps the full native audio set.

### Added

- **hls.js audio/buffer errors are logged to PlaybackLog.** Non-fatal audio/buffer/append/stall errors now record a row (with the hls.js detail), so a future mid-stream cutout is captured with its real cause instead of guesswork.

### Verified

- **HDR survives the HLS transcode path on the C2.** 4K HEVC HDR + DTS-HD MA (The Bourne Legacy) played via HLS with the video **copied** (`→hevc`, 3840×1600) and HDR intact for 12+ minutes — the last open question on the playback arc.



### Fixed

- **Audio track switching now actually works, and shows every track.** Two bugs: (1) audio tracks were **coalesced by language**, so a title with multiple English tracks (main 5.1, stereo, **director commentary**) collapsed to a single "English" — you couldn't see or pick the others (e.g. Back to the Future defaulting to commentary with no way off it); (2) the switch selected by *language* and applied it via the URL `audioStreamID` transcode param, which Plex honors **inconsistently** — so it re-resolved the stream but never changed the track. Now each track is exposed individually with its **stream id** and a rich label (from `extendedDisplayTitle` — e.g. "English (DTS 5.1)" / "Commentary"), the client selects by **id**, and selection is applied via Plex's **"Set stream selection" PUT** (`PUT /library/parts/{id}?audioStreamID=&subtitleStreamID=&allParts=1`) — the same proven path subtitles already use. Fixed in **both** the TV app and the admin preview. (Switching still forces a transcode to HLS; a future Phase 2 will switch supported codecs natively via `video.audioTracks` without transcoding.)



### Added

- **Buffering spinner on the player.** The player now shows a spinner while the `<video>` is waiting on data — both the **initial channel load** (nothing to look at while a 4K HDR / transcoded stream spins up) and any **mid-stream rebuffer** (e.g. scrubbing a transcoded channel re-spins the transcode). Driven by real `waiting`/`stalled` → `playing`/`canplay` events (plus the initial resolve), a new `PlayerStatus.buffering`. Centered, animated (no burn-in), shown in both full and mini layouts; hidden during the bumper card and while paused.

## [0.4.6] - 2026-07-15

### Changed

- **Transcode delivery is now HLS, not progressive MKV.** The must-transcode tail (DTS/TrueHD/ALAC audio, Hi10P, quality caps) was delivered as a progressive-HTTP stream to the native `<video>` — which the PlaybackLog proved **does not play on the C2**: `mode=http` either returned nothing (`0x0`) or reported dimensions but rendered a black screen, while the *identical* content via `mode=hls` played cleanly (e.g. `hevc/dca-ma → hevc/opus`, 3840×1632). The progressive rung is removed; transcodes now always deliver **HLS (fMP4)** via hls.js/MSE. **Direct-play (native `<video>`) is unchanged and remains the primary path** for everything the panel decodes — HLS only carries the transcode tail. The HLS profile advertises the full native video set (so Plex **copies** HEVC/AV1, HDR metadata preserved) with MSE-safe audio (aac/opus/mp3). `getPlaybackInfo` no longer emits `mode: "http"`.
- **Sim tooling:** `sim-channel.ts <n> hls` forces the HLS transcode path for inspection; added `show-play-log.ts` to dump recent PlaybackLog rows.

### Notes

- Open item: verify **HDR survives the HLS/MSE path** on the C2 for HDR content that *also* has undecodable audio (DTS/TrueHD) — the only case forced to transcode a copied HEVC-HDR video. HDR content with decodable audio still direct-plays untouched.



### Added

- **Playback logging restored in the TV player.** The player refactor had left `api.logPlayback` uncalled, so `PlaybackLog` stopped recording. `use-tv-player` now records each program load's real on-device outcome — mode (direct/http/hls), Plex's decision, source codecs, and whether the panel actually decoded (`decodedWidth`/`readyState`/`error`) — ~6s after load, and immediately on a `<video>` error. This is the ground truth for diagnosing bad channels (e.g. a black-screen `mode=http` transcode with `decodedWidth=0`) instead of guessing.



### Changed

- **Diagnostic audio detector switched to `audioTracks`.** `webkitAudioDecodedByteCount` turned out to be stubbed to `0` on the C2's Chrome 108 (measured on-device — it never climbed), so it can't detect audio decode. The working signal is `HTMLMediaElement.audioTracks`: the panel lists a decodable audio track for codecs it can decode and drops/disables it for ones it can't. `audioOk` is derived from that, with the same safe cross-clip control (only a panel that produced a usable track for *some* clip can mark another clip's audio unsupported) so it's never a false negative. Grid shows the raw `tracks=/en=/bc=` readout. DTS remains excluded via the `UNDECODABLE_AUDIO` quirk regardless.



### Added

- **The diagnostic now verifies audio decode, not just video.** Each clip's decoded-audio bytes (`webkitAudioDecodedByteCount`) are sampled over playback; the result fills the existing `DeviceCapability.audioOk` column (previously always null — the hands-off onboarding had dropped the manual audio verdict). It's derived safely, never a false negative: a clip whose audio bytes climb → `audioOk = true`; and **only if some clip proves audio decodes on this panel** (a control) does a clip that played its video but decoded ~0 audio bytes get `audioOk = false`. If nothing climbs or the counter isn't exposed, verdicts stay null (unknown). The results grid shows 🔊/🔇 per clip. Fully silent (muted — audio still decodes) and needs no re-onboarding gesture.
- **`native-caps` credits audio from the measured verdict.** An audio codec is credited when `audioOk = true`; a measured `audioOk = false` blocks it and **supersedes** the old video-only inference; codecs with no verdict (`null`) fall back to inference minus the `UNDECODABLE_AUDIO` quirk. So on a re-run panel, DTS is blocked because the C2 demonstrably decodes no DTS audio — not because of a hardcoded list. Re-run "Run diagnostic" from Settings to populate `audioOk` on an existing device (upsert by `deviceId+testId`).



### Fixed

- **DTS audio no longer cuts out dead (Anastasia).** The onboarding diagnostic verifies only that a clip's **video** decodes (`videoWidth×videoHeight`) — it never checks audio — so a DTS clip whose video decoded made us wrongly credit DTS *audio* support. The LG C2 has no DTS decoder (licensing), so DTS video plays but the audio is silent then stalls dead. DTS is now excluded from the credited native audio set, so DTS/`dca` content takes the transcode path — the **video still copies** (no re-encode) and only the **audio** transcodes to Opus over the (working) MKV progressive stream. `mkv/h264/dca` now resolves to `MODE=http` with a real matroska stream.

### Changed

- **Codec naming consolidated into one module** (`services/capabilities/codecs.ts`). The codec-name canonicalization (DTS `dca`/`dca-ma`/`dca-hra` → `dts`, `ec-3` → `eac3`, `h265`/`hvc1` → `hevc`, `matroska` → `mkv`, …) was duplicated between the capability side (`native-caps.ts`) and the source-matching side (`plex/client.ts`); it now lives once and both import it. The DTS exclusion is a documented **device-quirk table** (`UNDECODABLE_AUDIO`) rather than a magic set — a stopgap until the diagnostic verifies audio directly.



### Added

- **Persistent player with a live mini-feed in the guide.** Playback no longer stops when you leave a channel. The `<video>` and the effectiveTime state machine now live in a root-level `PlayerProvider` (above the router), so:
  - Tuning a channel plays it **full-screen**; **Back** drops it to a **mini feed** docked in the guide's featured panel (top-right) that **keeps playing** (audio too), instead of ending the session.
  - Focus returns to the channel you were watching (its live program) when you land back in the guide.
  - **D-pad Up** from the top of the grid docks focus into the mini feed, showing two buttons — **Full screen** and **Close**. **Back** while a mini feed plays stops the feed + session; a second Back exits the app.
  - The featured **right slot only appears while a feed is playing** — with nothing playing, the featured info spans the full width (no empty gap).
  - One `<video>` element is repositioned between full and the featured slot (Framer-animated), so same-channel navigation never reloads the stream; a channel *change* is a clean remount.
- `/watch/$channelId` is now a deep-link entry that tunes and bounces to the guide (the player is a persistent overlay, not a route).

## [0.4.0] - 2026-07-15

Opens the 0.4.x line. Fixes the black-screen channels — DTS content now direct-plays, and the progressive transcode path actually produces a playable stream.

### Fixed

- **DTS content now direct-plays instead of black-screening.** Plex reports DTS streams as `dca` / `dca-ma` (DTS-HD MA) / `dca-hra`, but our measured capability token is `dts`, so the names never matched and every DTS title was pushed to transcode. Added codec-name normalization in the direct-play check (`dca*`/`dts*` → `dts`, plus `ec-3`→`eac3`, `hvc1`/`h265`→`hevc`, `matroska`→`mkv`, etc.). DTS-HD MA/HRA embed a DTS core any DTS-core decoder falls back to, so the measured `dts` legitimately covers them. Verified via simulation: `mkv/hevc/dca-ma` → `direct` with a real matroska stream.
- **The progressive-HTTP transcode rung produced an unplayable stub (the black screen).** For a TV, content that must transcode was served as a **progressive MP4**, which a native `<video>` can't play while it's still transcoding (no front `moov` atom) — Plex returned an ~89-byte stub and the screen stayed black, only recovering to hls.js if at all. The progressive transcode now uses a **streamable container the panel natively decodes** — `progressiveContainer()` picks `mkv` (preferred) or `mpegts` from the device's measured containers; if it has neither, we skip straight to hls instead of a doomed attempt. Verified via simulation: a must-transcode title went from `container=mp4` / 89-byte stub → `container=mkv` / a real 165 KB matroska stream. hls.js is now a genuine last resort.

### Added

- **Playback simulation scripts** (`apps/server/scripts/sim-playback.ts`, `sim-channel.ts`) — resolve playback for a panel's *measured* capabilities and fetch the resulting stream to confirm Plex serves a real body, reproducing the TV playback path server-side. Lets codec/transcode issues be diagnosed without a TV. `sim-playback.ts` sweeps every channel's "now"; `sim-channel.ts <n>` scans one channel's timeline.

## [0.3.57] - 2026-07-15

### Changed

- **Guide now-line is just the triangle marker (vertical line hidden).** The big red vertical now-line is hidden for now; the downward triangle at the top marks the current time. Behind a `SHOW_NOW_LINE` toggle so the full line can be restored.

## [0.3.56] - 2026-07-15

### Fixed

- **Highlighting a program no longer nudges the layout.** The focus indicator was a border-width change (1px → 2px), which reflowed the card's contents by a pixel or two. The card border is now a constant 1px and focus is drawn as an **inset outline** (`outline-offset: -2px`) — no layout participation, stays within the rounded card, so highlighting is a pure visual change.

## [0.3.55] - 2026-07-15

### Changed

- **Cleaner focus states in the guide.** Highlighting a channel row now tints only the **rail** (the redundant row-wide highlight background is gone). And focusing a program that isn't the currently-airing one now shows just the **outline** — it no longer changes the block's background, so only the live program ever carries a filled color.

## [0.3.54] - 2026-07-15

### Added

- **The live program card fills like a progress bar.** The currently-airing program now shows a two-tone channel-tint background: a stronger, more vibrant tint from the left up to the live point (how far into the show we are), and a weaker tint of the same color for the not-yet-aired remainder. The fill is computed against the card's *rendered* width, so it stays correct even when the card is clamped to the rail (a program that started before the visible window). The live tint takes precedence over the selection highlight; D-pad focus still reads via the ring.

## [0.3.53] - 2026-07-15

### Changed

- **Channel tint is now reserved for the live program and the focused channel rail.** Previously every program block wore a faint channel-tint background. Now only the currently-airing program carries the channel tint; all other blocks get a standard neutral fill. The focused channel's rail/row highlight (background + inset bar) also switches from the generic blue to that channel's tint, so the selected channel reads in its own color. The D-pad selection/focus highlight on a program block is unchanged.

## [0.3.52] - 2026-07-15

### Changed

- **Live "on air" accent line hugs the card edge and is a touch slimmer.** Moved the accent line right up against the left edge of the program card (`left: 3`) and reduced its width (`4 → 3`px), keeping the top/bottom inset that clears the corner radius.

## [0.3.51] - 2026-07-15

### Changed

- **Featured now-playing card gets more of the screen.** Bumped the featured panel's scale so it has more room to breathe; the guide grid keeps the remaining height and stays comfortably scrollable.

## [0.3.50] - 2026-07-15

### Changed

- **Smaller top Guide/Settings control; bigger feature card.** The segmented Guide/Settings control at the top was oversized; shrank its font, padding, and top margin considerably and handed that vertical room to the featured now-playing card (bumped the feature panel scale up).
- **Featured description holds a fixed two-line height.** The summary reserves two lines (its max) at all times, so the featured panel no longer grows/shrinks as the description varies between one line, two lines, or none.

## [0.3.49] - 2026-07-15

### Changed

- **The guide opens focused on what's on now.** On first load the focus sat on the first program of the first channel — the recently-aired lead that fills the grid's left edge — rather than the program actually airing. It now initializes focus (and the featured panel) to the currently-airing program for the selected channel once the guide data loads.

## [0.3.48] - 2026-07-15

### Changed

- **The now-line's top marker is now a downward triangle, correctly centered.** The red circle that capped the live now-line was centered on the line's left edge rather than its 3px center, so it looked slightly off. Replaced it with a subtle downward-pointing triangle whose bottom point sits at the very top of the line, centered on the line (with a soft red glow). Added a buffer between the time-increment axis and the top of the grid so the triangle has clearance and doesn't crowd the time labels.

## [0.3.47] - 2026-07-15

### Changed

- **The live "on air" accent is now a separate inset line, not a border.** It was drawn as the block's left border, which meant it read as the blue focus ring while focused and dropped to a thin, radius-curved edge once you moved away — so it looked like moving focus lost the accent. It's now a dedicated element: a rounded accent line inset slightly from the left edge and clear of the top/bottom corner radius, driven purely by whether the program is airing — so it stays put on the live program regardless of focus and never gets clipped by the block's rounded corners.

## [0.3.46] - 2026-07-15

### Fixed

- **Guide up/down navigation no longer lands on off-screen programs.** When focused on a long, already-airing program clamped to the rail, the vertical-nav time cursor sat at that program's midpoint — often left of the grid's visible start — so moving to the next channel matched an equally off-screen program and put the focus ring on something you couldn't see. The cursor is now clamped to the visible window before matching, so up/down selects the next channel's clamped/left-most in-view program instead.

## [0.3.45] - 2026-07-15

### Changed

- **Rail-clamped guide programs keep a tiny gap from the rail.** Following 0.3.44, an in-progress program pinned to the rail sat flush against it; it now leaves the same small 6px gap the program blocks have between each other, so it's inset consistently rather than butted right up against the channel rail.

## [0.3.44] - 2026-07-15

### Changed

- **Guide grid: in-progress programs now pin to the rail instead of overflowing off-screen.** A program that started before the grid's left edge (the recently-aired lead, or a long movie already underway) was positioned with a negative offset, so its rectangle — and the left-aligned title inside it — ran off the left of the lane, leaving a blank block against the rail. Such blocks are now **clamped to the rail** (left pinned to the lane start, width shrunk by the clipped amount), so the program and its title always butt flush against the channel rail. Blocks fully inside the window are unchanged.

## [0.3.43] - 2026-07-15

### Changed

- **Guide grid: the channel-accent left bar now marks only the live program.** Every program block previously carried a left border in the channel's accent color; now that "on air" cue is reserved for the program **actually airing right now** (server-time within its slot), so scanning the grid you can instantly see what's live per channel. Other blocks keep the plain hairline border; the D-pad focus ring is unchanged.

## [0.3.42] - 2026-07-15

### Changed

- **Guide rail polish.** The left channel cell now shows the **real channel icon** (resolved from the stored `lucide:Name` id — presets are lucide-only, so no phosphor catalog needed) in a tinted tile top-left with the **channel number pushed to the top-right** (same height, centered), and the **full channel name** pinned to the bottom, left-aligned, clamped to **2 lines**. Tighter cell padding and a slightly smaller name. (Genre-accurate tint from each channel's real `tint`/`icon` inheritance is a follow-up; the accent is still index-derived for now.)

## [0.3.41] - 2026-07-15

### Added

- **Redesigned bumper interstitial.** The between-programs card is no longer a plain black "Up next" — it's a full-screen **blurred cover art** of the upcoming program with a heavy dark overlay (always dark), a "**Coming up next**" label, the show/movie title + episode + **SxxEyy**, and a big **countdown** whose seconds **pop-grow** (Framer Motion spring). The countdown runs on a **local clock** (captured end-time), reconciling against the server-derived remaining only on real drift — so ticks stay smooth regardless of polling. `features/watch/bumper-card.tsx`.
- **Public artwork proxy** (`GET /img/:channelId?path=…&w=…`) — streams Plex cover art through the channel's media source with the admin token injected (a CSS/`<img>` background can't send a bearer token). Only proxies Plex image paths; optional `w`/`h` resize via Plex's photo transcoder. Also usable for guide thumbnails later.

### Changed

- **Scrubber eases instead of snapping** — CSS transitions on the segment left/width, thumb, live marker, and time label, so expanding/contracting when you scrub across a boundary glides.

## [0.3.40] - 2026-07-15

### Changed

- **Scrubber reworked to an anchored, expanded-focus layout.** The program you're in is now the **expanded middle** of the bar (fixed `[start…end]` mapping, so scrubbing moves the thumb through the wide middle — real motion, not a panning background), flanked by a **fixed left peek** (previous-program tail + bumper — always visible, even at live) and a **fixed right peek** (upcoming bumper + next-program head — so at live near a program's end the thumb never collides with the LIVE indicator). Rewind into a previous program and *it* becomes the expanded focus. Segment percentages are computed in the hook; the panel just renders them.

## [0.3.39] - 2026-07-15

The effectiveTime DVR machine — rewind across programs, like real TV.

### Added

- **Net-new `use-tv-player.ts`** — a REST + native-first channel-player state machine (a sibling of the admin's `use-channel-player.ts`, which is **untouched**). It drives the `<video>` off one clock (`effectiveTime`) on the **whole channel timeline** instead of the single current file, so you can **rewind out of the current program, through the bumper, into the previous program** — the timeline maps any instant to `(ratingKey, offset)`. Timeline-driven rollover (program → bumper card → next program), resume-on-reload, watch-session heartbeat, and the native-first delivery ladder (direct → progressive-http → hls.js last-resort + safety-catch) are all preserved. `watch.tsx` is now a thin shell over the hook.
- **Multi-segment sliding scrubber.** At/near live it's the **full current program** with the thumb at its relative position (as before). Rewind before the program start and it collapses to a **sliding ~13-min window** that pans with you and trims the right edge, rendering **one rounded segment per slot** (capped prev-program tail · bumper · current), the current slot filled to the thumb in the channel accent. **Restart** restarts the slot you're *in* (so rewound into Program A, it restarts Program A); in a live bumper it dims and acts as Jump-to-Live (no unaired program to restart).

## [0.3.38] - 2026-07-15

### Added

- **Back at the guide root now exits the app.** Bundled LG's **`webOSTV.js`** runtime (vendored into `public/`, loaded from `index.html`) so `window.webOS.platformBack()` is available — pressing Back on the guide triggers the platform exit (webOS 9 shows the "exit app?" prompt). Previously it was a no-op (you had to press Home). `@procot/webostv` is TS typings that still expect this runtime, so vendoring the actual library is what enables `platformBack`.

## [0.3.37] - 2026-07-15

### Fixed

- **The LG remote's Back button now closes overlays instead of jumping to the guide.** By default webOS routes the remote Back through the browser History API (the app gets a `popstate`, not a keydown) — so our router navigated away while a keyboard Backspace (a real keydown) worked. Set **`"disableBackHistoryAPI": true`** in `appinfo.json` (per LG's guide), so Back now arrives as **keyCode 461** and our handlers catch it: on the player it closes the open dropdown → info view → panel → then the guide; Settings returns to the guide; the guide root best-effort-exits the app. **Keyboard Backspace still works everywhere** (both `keyCode 461` and the `Backspace`/`GoBack`/`XF86Back` key names are handled).

## [0.3.36] - 2026-07-14

Player UI to match the reference design + **lucide icons everywhere** (no more tofu boxes on the C2).

### Changed

- **All icons are now lucide components** instead of unicode glyphs — the C2's system font has no glyphs for `☰ ⚙ ◄ ► ▲ ▼ ★ ⏸ ⟲` etc., so they rendered as empty boxes. Swapped across the player and the guide grid (nav, hints, rating star, all controls).
- **Redesigned the watch player** to match the reference: a **glass channel chip** top-right (tinted genre accent + number + name), just the **program title** bottom-left, a **minimal borderless scrubber** (accent-filled bar, white thumb, time centered under the thumb, LIVE far-right), a row of **glassmorphism control pills** (Pause · Restart · Channel Surf · Info · Continue Watching/Jump to Live), and **circular glass icon buttons** for Audio / Subtitles / Quality (base-lyra dropdowns). Removed the redundant focus outline (the thumb + button highlight show focus).
- **Info mode:** the **Info** button swaps the scrubber + controls for a full **details view** (summary, year/rating/★, genres, cast, director, studio); Back returns. The `now` payload already carries the full metadata.

## [0.3.35] - 2026-07-14

### Added

- **Glass DVR scrubber in the feature panel.** The panel now leads with a frosted (`backdrop-blur`) scrubber: a timeline bar with a **thumb** at the current position, the **elapsed / duration** time, a red **live marker** on the bar, and a **LIVE indicator** below-right that shows how far behind live you are (`-2:30 · LIVE`) or a bright **LIVE** when caught up. Focus model is two rows — **row 0 = scrubber** (◄ seek back, ► seek forward toward live but never past it, **OK pause/play**, ▼ to the controls), **row 1 = Restart + the audio/subtitle/quality dropdowns** (◄► move, ▲ back to the scrubber). Program **position is derived from a playback baseline** (offset + currentTime delta) so it's accurate across direct/http/hls — the first piece of the effectiveTime machine. Selecting the LIVE indicator jumps to live.

### Notes

- Seeking is reliable for direct-play (full-file); on a live transcode it's bounded by the buffer. Pausing correctly falls behind live (the gap grows), matching DVR intuition. The full machine (cross-program rewind, rollover-into-bumper, resume, position-preserving option changes) still follows.

## [0.3.34] - 2026-07-14

Burn-in-safe player with a Framer Motion feature panel.

### Changed

- **Nothing is drawn on the live video anymore** (OLED burn-in) — the always-on top bar, debug overlay, and hints are gone. Pressing **OK** now reveals transient chrome via **Framer Motion**: a **feature panel slides up** from the bottom (fade + slide) with the program details, **DVR controls** (Restart · −15s · Play/Pause · +15s · Jump to Live), and the audio / subtitle / quality selectors as **base-lyra (shadcn) dropdowns** that open upward; and a **slim top header slides in** (channel + back hint). Both **auto-hide after ~8s** of inactivity and on Back, so nothing sits burned on screen. D-pad ◄► moves across controls, OK activates, Back closes the open menu then the panel.

### Notes

- DVR controls are native seeks for now (pause / ±15s / restart / jump-to-live) — great for direct-play; the full effectiveTime/delaySeconds machine (cross-program rewind, rollover-into-bumper, resume, and position-preserving option changes) is the next arc. Added `framer-motion`.

## [0.3.33] - 2026-07-14

Parity player controls + watch sessions on the TV.

### Added

- **Audio-track / subtitle / quality controls on the watch screen** — matching the admin preview. Press **OK** while watching to open a D-pad control panel with three columns: **Audio** (switch track by language), **Subtitles** (Off + burn a language), **Quality** (the full Plex ladder). Selecting an option re-resolves the current program with it (the server forces the matching transcode); the native-first ladder + hls fallback are unchanged. `api.media` now takes an options object and `api.qualities()` was added.
- **Watch-session heartbeat** — the TV now drives the same `WatchSession` machinery as the admin preview: it heartbeats (`POST /api/v1/sessions/heartbeat`) ~every 10s with channel / state / ratingKey / transcode-session, and **ends the session** (`/sessions/end`) on leaving the player. This populates "Now Watching" and lets `watch-session-reap` stop orphaned transcodes.

### Notes

- Options re-resolve at the live edge for now (the minimal player has no DVR position yet — that lands with the effectiveTime state machine), so a change snaps to live. Subtitle burn follows the verified PUT-select recipe server-side.

## [0.3.32] - 2026-07-14

### Changed

- **Guide grid runs edge-to-edge — no gaps for bumpers.** Bumper interstitials (omitted from the grid) left an empty gap between a program's real end and the next program's start. `getGuideGrid` now **absorbs that trailing gap into the preceding program's shown duration** (broadcast-style: an inter-program break belongs to the program before it, like a commercial), so program blocks butt right up against each other. Channels with no bumpers are unaffected.

## [0.3.31] - 2026-07-14

### Changed

- **Featured panel leads with the show name for episodes** — renders `{Show Name} S1, E2 · {Episode Title}` (show name bold, SxxEyy + episode title in the lighter suffix) instead of using the episode title as the heading. Movies are unchanged.

## [0.3.30] - 2026-07-14

### Fixed

- **The guide grid's lead area is no longer blank.** `getGuideGrid` only returned currently-airing + upcoming programs, so the space to the left of "now" (recently-aired programs) rendered empty. It now takes a `backMinutes` window (default 60, exposed as `/api/v1/guide?backMinutes=`) and keeps programs that **ended within the recent past** — filling the grid's lead with the just-aired items (which are still rewindable via the DVR timeshift window). The broad 6h query still catches a long program that started before the window but is still airing.

## [0.3.29] - 2026-07-14

The **Aurora guide grid** — the 10-foot live-TV guide UI (from the Claude Design handoff).

### Added

- **`apps/tv-web` now opens on a real guide grid** instead of a plain channel list: a featured now-playing panel (channel, title + SxxEyy, year/rating/★, HD·5.1 badges, summary, progress + "Xm left") over a scrolling **time grid** — per-channel rows with program blocks positioned by air-time, a pulsing red **now-line**, and blue focus. D-pad: ◄► move program, ▲▼ move channel (preserving the horizontal time cursor), **OK tunes**. New `/settings` route (sign out + re-run diagnostic). Data via a `useGuide` Query hook over `/api/v1/guide`. Design tokens/spec captured in `.docs/tv-design-spec.md`.
- **Fluid, not fixed:** the layout is a flex column that fills the viewport (the grid expands into leftover height), the time-lane's px-per-minute is derived from the *measured* width, and text/spacing are `vw`-based — so it fits any screen. The featured panel is uniformly scaled down so the grid gets the majority of the vertical space.

### Notes

- Program still-art is a placeholder box (Plex images need a server-side proxy — a follow-up). Channel accent colors are index-based for now (mapping to genre/tint is next). Parity player controls (subtitles / audio / quality) are the next sub-arc.

## [0.3.28] - 2026-07-14

TV app foundation refactor — the webOS app now uses the admin's frontend paradigms.

### Changed

- **`apps/tv-web` is now on TanStack Router + TanStack Query + base-lyra shadcn**, instead of the slapped-together `useState` screen-switcher and raw `fetch`. File-based routes (`login` / `_auth/` guide / `_auth/watch/$channelId` / `_auth/diagnostic`) with a bearer-token auth gate (`_auth/route.tsx`), **in-memory history** (a packaged webOS app has no URL bar), and the `QueryClient` mounted via the router's `Wrap` — mirroring `apps/web`. Reads go through thin Query hooks (`useChannels`) over the existing REST chokepoint (`lib/api.ts`); the TV app stays on the **bearer `/api/v1` surface, not tRPC** (an installed app's unknown origin only the permissive bearer surface accepts). The **login flow is unchanged** (it works well) — just moved onto the `/login` route.
- **shadcn/base-lyra wired up** (`components.json` + `@ChannelGuide/ui` dependency + `lib/utils` `cn` re-export), so tv-web shares the admin's design system and `pnpm dlx shadcn add <component>` works. Chrome-108 CSS lowering (Lightning CSS) already covers the base-lyra oklch/color-mix tokens.

### Notes

- Behavior is preserved (login, guide list, tune-and-play, capability onboarding). The 10-foot **Aurora** guide-grid UI (`.docs/tv-design-spec.md`, from the Claude Design handoff — blue accent, channel rail, now-line) is the next step; this refactor is the foundation it builds on.

## [0.3.27] - 2026-07-14

Native-first playback, step 2 — the self-healing delivery ladder (hls.js is now a true last resort).

### Added

- **Progressive-HTTP transcode for TVs.** When a source *can't* be native raw-file direct-played (Hi10P, MPEG-2, AVI/FLV, or a forced transcode from a quality cap / audio switch), a capable panel now gets a **progressive HTTP transcode** (`protocol=http`, `start`, `container=mp4`) it plays with the **native `<video>` element** — not HLS/hls.js. Because native `<video>` isn't MSE, the transcode target can keep the **full native audio set** (Plex copies E-AC3/DTS/TrueHD instead of forcing it → aac). New `mode: "http"`; `clientProfileExtra(caps, protocol)` builds the per-protocol target.
- **Runtime native→hls safety-catch.** If a native attempt (`direct` or `http`) throws a `<video>` error at runtime, the client re-resolves the same program **once** with `forceHls`, and Plex serves an hls.js/MSE stream. So the full ladder is **raw-file direct → progressive-HTTP transcode → hls.js**, each rung native until the last — and even if progressive-HTTP misbehaves on a given panel, playback self-heals to hls.

### Notes

- The admin browser preview is unaffected — it passes no capability profile, so it always resolves to `direct`/`hls` (hls.js in the browser, by design). `mode: "http"` only ever occurs for a capability-reporting TV client.

## [0.3.26] - 2026-07-14

Native-first playback, step 1 — the measured capability map drives Plex's decision.

### Added

- **The onboarding diagnostic's measured results now build the Plex profile.** New `capabilities/native-caps.ts` (`getDeviceNativeCaps`) turns a device's `DeviceCapability` rows into its real native-decode set — a codec/container counts as supported only if a clip that *actually decoded* on the panel contains it. `resolveMedia` prefers this **measured** map over the client's `canPlayType` self-report (which lies on TVs); the report is now just a fallback until a device has onboarded. The media response carries `capsSource` (`measured` / `reported` / `default`), surfaced in the TV debug overlay.

### Why it matters

- On the real C2 the measured set is `video: h264/hevc/av1/vp9`, `audio: aac/ac3/eac3/dts/truehd/flac/alac/opus/pcm`, `containers: mp4/mkv/mov/ts/webm`. Because the profile now declares exactly that, Plex **direct-plays the raw file** (native `<video src>`, HDR preserved) for essentially the whole real-world library — including the **MKV + E-AC3/DTS/TrueHD** content that used to fail with `bufferAddCodecError` when it was wrongly routed through hls.js/MSE. hls.js drops toward a true last resort. The progressive-HTTP transcode fallback for the genuinely-native-incompatible tail (Hi10P / MPEG-2 / AVI / FLV) is step 2.

## [0.3.25] - 2026-07-14

Make the webOS app render on the LG C2's browser (Chromium 108).

### Fixed

- **Tailwind v4 styling silently dropped on the C2.** Tailwind v4 emits bleeding-edge CSS — `oklch()` theme variables and `color-mix()` — that landed in **Chrome 111**; the C2 is **Chrome 108**, so every `var(--color-*)` (defined in oklch) resolved to an invalid value and the UI lost its colors, while the desktop Simulator (Chrome 132) looked fine. Rather than downgrade to Tailwind v3, `apps/tv-web` now runs **Lightning CSS with a Chrome-108 target** (`css.transformer: "lightningcss"` + `browserslist("chrome >= 108")`): it lowers `oklch()` to hex fallbacks in `:root` (guarding the modern value behind `@supports`) and the `color-mix()` opacity utilities already ship an `@supports` hex fallback — so the shipped CSS has **zero unguarded modern color functions**. Verified on the C2: full styling. Build target also pinned to `chrome108` for JS. This is the pattern the future `packages/tv-ui` kit will follow.

## [0.3.24] - 2026-07-14

Fix the capability-probe test media — the diagnostic was giving false negatives on a real TV.

### Fixed

- **H.264 clips were accidental Hi10P/HDR, which real TV hardware rejects.** The master is a 10-bit HDR HEVC file, and the ffmpeg recipes never pinned a pixel format, so libx264/libx265 inherited 10-bit + BT.2020/PQ — emitting **H.264 High 10 (Hi10P)** tagged HDR. LG's *hardware* H.264 decoder refuses that (`error 4`), while desktop *software* decoders (the Simulator) accept it — so the panel failed the H.264 control clip and, because every audio/subtitle/edge clip rides on an H.264 carrier, all of those too (a real LG C2 scored 14/49). The matrix now pins `yuv420p` on the 8-bit codecs (10-bit stays only where intended), and the generator **tonemaps HDR→SDR BT.709** for every non-HDR clip while leaving the HDR10 clips untouched. Re-measured on the C2: **33/39 generatable clips**, and the six remaining failures are all genuine (Hi10P, MPEG-2, AVI/FLV containers, 8K) — including a clean pass of the full native audio set (E-AC3/DTS/TrueHD/FLAC).

## [0.3.23] - 2026-07-14

Capability diagnostic reworked into hands-off **onboarding**.

### Changed

- **Fully automatic diagnostic.** Plays each clip **muted** (so autoplay never blocks — the old run's "only HDR played" was largely an unmuted-autoplay artifact), and judges **only whether the video decodes** (`videoWidth×videoHeight`) — audio is switchable/transcodable, so it's no longer a manual verdict. No more thumbs-up/down, no confusing corner UI. Auto-advances through the whole matrix with a clean progress bar + results grid.
- **Runs as onboarding** — auto-fires once on first sign-in per device (localStorage flag; also set on skip/error so it never nags), establishing the baseline capability map. Still re-runnable from "Run diagnostic".

### Fixed

- Generated `.ts` MPEG-TS test clips no longer break `tsc` (excluded `capability-media` from the server build); the media dir is gitignored (large, regeneratable).

## [0.3.22] - 2026-07-14

**Capability diagnostic** — a self-test that *measures* exactly what a TV's native decoder handles, so playback can go native-first with hls.js as a true last resort.

### Added

- **Capability matrix** (`packages/api/.../capabilities/matrix.ts`) — the single source of truth: an axis-comprehensive set (every container, video codec, audio codec, HDR feature, a bitrate/fps ladder, subtitle types, edge cases; ~45 tests). `realSample` flags the few ffmpeg can't fabricate (Dolby Vision / Atmos / DTS-HD MA / HDR10+ / PGS).
- **Media generator** (`apps/server/scripts/gen-capability-media.ts`) — ffmpeg fabricates a 5s clip per entry from one master source, driven by the matrix.
- **Server-hosted probe** — the backend serves the clips as public static files at `/caps/media/*` (played via `<video src>`, which can't carry a token), plus `GET /api/v1/caps/manifest` and `POST /api/v1/caps/result`. New `DeviceCapability` table (upsert per device+test) stores the measured map.
- **Visual Diagnostic screen** (tv-web, "Run diagnostic" on Home) — plays each clip **full-screen**, auto-detects decode (`videoWidth×videoHeight`) + dropped frames (`getVideoPlaybackQuality`), and prompts a remote **👍/👎** for the subjective axes JS can't see (audio present? HDR triggered? subs shown?). Live results list down the side; everything saved to the device's capability map.

### Notes

- To run it: generate clips into the server's `CAP_MEDIA_DIR` (default `./capability-media`) with the generator + a master, drop the real-sample files, restart the server. Then "Run diagnostic" on the TV grinds the matrix and records the true, measured capability set. Native-first playback off that map is the next step.

## [0.3.21] - 2026-07-14

Playback logging (tests record themselves) + remote Back fix. Confirmed 4K HDR HEVC direct-stream on the real C2.

### Added

- **Playback log** — a `PlaybackLog` table + `POST /api/v1/playback/log`. Every tune records its full diagnostics to the DB (channel, source container/codec, Plex decision, advertised caps, **outcome** = playing / not_decoding / error, decoded `videoWidth×videoHeight`, `readyState`, error) ~6s after it settles, or immediately on error. Test results are now reviewable in the DB instead of squinting at the overlay.
- **Real device facts captured** — the webOS Luna probe now records the true panel: the C2 shows `OLED77C2AUA` / webOS `9.2.2` / `3840×2160` / UHD (vs the old bogus 1080p canvas).

### Fixed

- **Remote Back** now returns to the guide from a playing channel instead of triggering webOS's "close app?" prompt — `preventDefault` on the Back key (keyCode 461) in the capture phase.

## [0.3.20] - 2026-07-14

TV-client instrumentation & navigation — so we can *see* what's playing and drive it with the remote.

### Added

- **Rich playback debug overlay** (Watch view) — shows whether frames are actually decoding (`video.videoWidth×videoHeight`; **0×0 = not decoding**), Plex's real decision (video/audio `copy` vs `transcode` + output container), the source codec, `readyState`, `currentTime`, buffered seconds, and any error. **OK** toggles it, **Back** exits to the guide.
- **webOS Luna device probe** — via `PalmServiceBridge` (`com.webos.service.tv.systemproperty/getSystemInfo`) we now read the **real model / 4K (UHD) / firmware** and merge them into the device report, so `TvDevice` reflects the actual panel instead of the 1080p web canvas.
- **D-pad navigation** for the channel grid — arrow keys move a focus ring (with scroll-into-view), **OK** tunes. The channel list is finally usable with the remote instead of the Wii pointer.
- **Plex decision surfaced** — `getPlaybackInfo` parses `/decision` and returns `{ videoDecision, audioDecision, output codec/container }` through `/api/v1` media, feeding the debug overlay.

### Notes

- Confirms via the profile dump (`.docs/plex-profiles/`) that Plex's built-in TV profiles (e.g. **HTML TV App**) cap at **1080p/8-bit/h264-only** — inheriting them would cripple the C2, so our custom `-Extra` (HEVC copy → fMP4, HDR preserved) is the right path. Full spatial-nav (norigin) for the whole app is still a follow-up.

## [0.3.19] - 2026-07-14

**TV playback on real hardware (H2)** + **device-aware Plex profiles** — the app runs on a real LG C2 and direct-streams 4K HDR HEVC with no re-encode.

### Added

- **webOS TV app playback** — tune a channel → resolve what's on now at the live offset → play (hls.js / native) with an on-screen diagnostics readout; clickable channel list. `apps/tv-web/src/features/watch`.
- **Device capability reporting** — a `TvDevice` table + `POST /api/v1/devices/report`. On sign-in the TV probes its real `<video>.canPlayType` + `MediaSource.isTypeSupported` matrix (plus HDR / color-gamut / screen / UA / webOS version) and persists it (upsert by a stable `deviceId`). This is the data behind the codec probe — e.g. the real C2 reports HEVC-10/AV1/Dolby-Vision/AC3/E-AC3 while the desktop/Simulator don't.
- **Device-aware playback** — the TV sends its real codec caps with each media resolve; `getPlaybackInfo` uses those (not the hardcoded browser assumption) to choose direct-play / direct-stream / transcode and builds a matching `X-Plex-Client-Profile-Extra` with `X-Plex-Platform=Generic`. Crucially it packages HLS as **fMP4** (not MPEG-TS), so HEVC is **copied** rather than re-encoded — verified live: 4K HEVC + E-AC3 → `copy`, fMP4, **HDR (HLG) preserved**, zero transcode.
- **webOS packaging** — `appinfo.json` + icon, `base: "./"` relative assets; build → `ares-package --no-minify` → `ares-install`. Confirmed running on a real LG C2 (Chromium 108).

### Changed

- **CORS split for installed apps** — the **bearer** surface (`/api/v1`, `/api/tv/auth`) is now permissive (any origin, credentials off — safe, no cookies), so an installed webOS app (unknown / `file://` / null origin) can reach the API; the **cookie** surface (`/trpc`, web `/api/auth`) stays locked to the allowlist. New optional `TV_APP_ORIGIN` env for dev.

### Notes

- Caps are still a conservative `canPlayType` guess (misses DTS/TrueHD, and HDR/resolution come from the wrong web APIs) — real **webOS Luna `deviceInfo`** is next. **native vs hls.js** playback under evaluation. Plex has **no LG/webOS profile** and its generic TV profiles **re-encode HEVC**, so our custom `-Extra` is the better path — findings in `.docs/plex-profiles/`.

## [0.3.18] - 2026-07-13

The **second TV login flow** — ChannelGuide device-code — completing the auth story. Verified end-to-end.

### Added

- **"Log in with a code"** on the TV app — the ChannelGuide **device-code flow** (better-auth `deviceAuthorization`, RFC 8628) for **any** account (email/password, Google, GitHub, or Plex-linked), not just Plex-imported users. The TV shows a short **4-char code** + a **QR** (to the pre-filled approval page); the user approves on their phone; the TV polls and signs in with a bearer token. Parallel to the Plex `plex.tv/link` flow.
- **`/device` approval page** (`apps/web`) — a logged-in user confirms the TV's code. Does the two-step better-auth requires: **claim** the code (`GET /device?user_code=…`) then **approve**/deny.
- **QR codes** on the TV login (via `qrcode`) — to the device approval page (`verification_uri_complete`, code pre-filled) and to `plex.tv/link`.

### Changed

- `deviceAuthorization` now points `verificationUri` at the **web app's** `/device` (absolute, `${CORS_ORIGIN}/device`) so the QR/verification URL is reachable, and sets **`userCodeLength: 4`** for a Plex-style short code (default is 8).

### Notes

- **Verified end-to-end in-browser:** short code → approve at `/device` → TV polls → signed in → authenticated `/api/v1`.
- **Dev caveat:** the QR points at `CORS_ORIGIN` (`localhost:3001`), reachable only on the dev machine; set `CORS_ORIGIN` to the LAN IP to scan from a phone.

## [0.3.17] - 2026-07-13

The **webOS TV app is born** (`apps/tv-web`) — scaffold + working Plex login, verified in a browser.

### Added

- **`apps/tv-web`** — a plain Vite + React app (developed in-browser first, packaged for webOS later), auto-included in the monorepo `pnpm dev` (port **3002**). Bearer-token native (TV clients carry a token, not cookies): a better-auth client configured to capture the `set-auth-token` header → localStorage and send `Authorization: Bearer`, plus a thin `api.ts` for the custom REST/`/api/v1` + Plex-link endpoints.
- **TV login screen** with two paths: **"Log in with Plex"** (the `plex.tv/link` flow — shows a code, polls, signs in) and **"Log in with a code"** (ChannelGuide device-code, wired next once the `/device` approval page exists). After sign-in, a Home screen loads `/api/v1/channels` with the token to prove the authenticated API. **Verified end-to-end in a browser**: Plex login → bearer → 136 channels listed.
- **`TV_APP_ORIGIN`** (optional server env) — allowed through Hono CORS + better-auth `trustedOrigins` so the TV app's origin (dev `:3002`, later the webOS origin) can call `/api/auth`, `/api/tv/auth`, and `/api/v1`.

### Notes

- **CORS for installed webOS apps** (unknown/`file://` origin) will switch the **bearer** API surface to permissive CORS (safe — no cookies there); the per-origin allowlist is just for dev.
- **Next:** the login **QR code** (to the device page / plex.tv/link) + the ChannelGuide device-code flow, and the **`/device`** approval page on the admin web.

## [0.3.16] - 2026-07-13

**TV device-code login (H5)** — how the webOS app authenticates, reusing the existing Plex identity path.

### Added

- **TV login via Plex's `plex.tv/link` device flow.** New unauthenticated endpoints `POST /api/tv/auth/plex/start` (returns a short `code` + `verificationUrl` + `pinId`) and `POST /api/tv/auth/plex/poll` (`{ pinId }` → `pending` / `expired` / `unregistered` / `ok`). The TV shows the code, the user enters it at **plex.tv/link** against their logged-in Plex account, and the TV polls until approved. This reuses the **exact identity path** of the web "Sign in with Plex" (genericOAuth): Plex pin → user's Plex token → Plex account email → **match an existing ChannelGuide account by email** (login-only — an unregistered Plex email is rejected, provisioning stays "Import Plex Users"). The only difference from the web flow is acquisition (a typed code vs a browser redirect). On success we mint a better-auth session server-side (`auth.$context.internalAdapter.createSession`) and return its token; the TV carries it as `Authorization: Bearer <token>` on every `/api/v1` call. `services/auth/tv-plex-link.ts` + `apps/server/src/tv-auth.ts`.
- **`createLinkPin()`** (`packages/auth`) — creates a **non-strong** Plex pin (the plain 4-char code for plex.tv/link), distinct from the web login's strong pin (a long code for the `app.plex.tv/auth` redirect).

### Notes

- We do **not** use the RFC-8628 `deviceAuthorization` plugin for this — Plex's own device PIN replaces it (the plugin stays configured as a possible fallback for non-Plex accounts). The `bearer` plugin (v0.3.15) is what makes the minted session a token the TV sends.
- **Verified live end-to-end:** `start` → entered code at plex.tv/link → `poll` returned `ok` + a session token → that token authorized `/api/v1` (matched the admin by email; no-token requests 401). No TV UI drives it yet — that's H4.

## [0.3.15] - 2026-07-13

Opens the **TV-client arc (H1)** — a REST guide/playback API for the TV apps, sitting alongside the existing tRPC admin surface.

### Added

- **REST guide/playback API** at `/api/v1` (`apps/server/src/rest.ts`) for heterogeneous TV clients (webOS first) — the parallel to the admin tRPC surface. Endpoints: `GET /channels` (lineup), `GET /guide` (cross-channel grid), `GET /qualities`, `GET /channels/:id/timeline`, `GET /channels/:id/now`, `GET /channels/:id/media` (playable URL for a ratingKey+offset), `POST /channels/:id/stop` (transcode teardown), `POST /sessions/heartbeat`, `POST /sessions/end`, and `GET /sessions` (admin-only "Now Watching"). Auth is **viewer-level** (any authenticated user, not admin) via `Authorization: Bearer <token>` or a session cookie; playback still brokers the **admin's** media-source connection for everyone (architecture §10).
- **better-auth `bearer` plugin** — sessions can now be carried as a bearer token instead of a `sameSite:none` cookie, the auth model for native/TV clients. On sign-in the token comes back in the `set-auth-token` response header. This is also the missing half of the future TV device-code flow (the already-configured `deviceAuthorization` plugin mints the session; `bearer` makes it a token the TV app can send).

### Changed

- **Playback/guide logic extracted into shared services** (`services/errors.ts`, `services/playback/broker.ts`, `services/playback/sessions.ts`, `services/guide.ts`) so the tRPC admin router and the new REST API call **one** implementation — no duplication. The tRPC `playback.*` procedures and `channels.guide` are now thin wrappers over these services (behavior unchanged; the admin preview is unaffected). Services throw a transport-neutral `ApiError` that each transport maps (tRPC → `TRPCError`, REST → HTTP status).

### Notes

- **Transport decision:** the webOS client is a React app and *could* consume tRPC directly, but we keep tRPC for the in-monorepo admin and expose REST for the TV apps (and future non-JS / third-party clients / IPTV) — both over the shared services, so neither is gutted.
- **Verified live** (v0.3.16): `/channels`, `/guide`, `/qualities`, `/channels/:id/{now,timeline,media}`, and `/stop` all return correct data with a real bearer token minted via the TV Plex device-link flow; no-token requests 401; a resolved transcode was torn down cleanly via `/stop`.
- **Follow-up (H2/H4):** the global CORS still allows only the admin web origin; when the webOS/TV origin is known, add it to `CORS_ORIGIN` + auth `trustedOrigins` (bearer/native fetch isn't subject to CORS). Next arc is the **webOS capability probe (H2)** now that auth + API are proven.

## [0.3.14] - 2026-07-13

### Fixed

- **Subtitles now render for every subtitle format** — the 0.3.13 fix only covered text (SRT). Image subtitles (**PGS/VOBSUB**, common on Blu-ray rips) still showed nothing because Plex honors the URL `subtitleStreamID` param **inconsistently per codec** (text burns via `subtitles=burn`, image only via `subtitles=auto`, etc.), so the burn was silently dropped (`subtitleDecision: none`). The reliable, universal fix: **select the subtitle with a server-side PUT** (`PUT /library/parts/{partId}?subtitleStreamID={id}&allParts=1`) instead of the URL param, then `subtitles=burn` + `directStream=0`. Verified live that this yields `subtitleDecision: burn` for **both** text (SRT → Andor) and image (PGS → Fast X) subs; turning subtitles off clears the selection. NB: PUT-select is per-part *global* Plex state (shared across viewers of an item) — fine for the single-admin preview, to revisit for multi-user. Full matrix in `.docs/plex-subtitles-findings.md`.

## [0.3.13] - 2026-07-13

### Fixed

- **Subtitles now actually render when selected.** We set `subtitles=burn` but left `directStream=1`, so Plex **copied** the video and silently dropped the burn — nothing appeared. Burning requires the video to re-encode, so `directStream=0` is now set **only when a subtitle is selected** (normal, subtitle-off playback stays a video copy — no re-encode). Verified against the server: our request registers `subtitleDecision: "burn"` and decision→start returns 200. For **complex styled ASS** (anime karaoke/positioning) and **image subs** (PGS/VOBSUB), burning is exactly what **Plex Web itself does** — confirmed by a live Plex Web session on this content showing `subtitleDecision: "burn"`. Also prefers the full (non-forced) subtitle track for a language.

### Notes

- Simple text subs (SRT/VTT) *can* be delivered **soft** (no re-encode) via `subtitles=sidecar|segmented` + `advancedSubtitles=text` (per the Plex OpenAPI) — but that needs the exact Plex client-capability profile plus a client-side WebVTT renderer, so it's deferred to the real web/TV client. For complex ASS / image subs Plex burns regardless, so burn is the correct path there.

## [0.3.12] - 2026-07-13

### Added

- **Audio-track & subtitle selection + native player controls.** The player exposes each item's audio and subtitle **languages** (from Plex stream metadata) as dropdowns — switch the audio track (e.g. anime **Japanese → English dub**) or turn on **burned-in subtitles** in any language. Selection is **by language so it carries across episodes**, and prefers the full (non-forced) subtitle track. Changing it re-resolves the stream at your current spot — a brief reload, same as quality/rewind and exactly how Plex's own web player behaves (you can't hot-swap audio inside a running transcode). Verified against the server: audio switch and subtitle burn both return 200. Also added native **volume + mute** and **fullscreen** controls. All selections persist per-browser.

### Changed

- `getPlaybackInfo` now takes a `PlaybackOptions` object (`quality` / `audioLang` / `subtitleLang`) and returns the available `audioTracks` / `subtitleTracks`; `playback.media` passes them through. The player's `quality` param generalized to a single stream-params key, so a change to quality, audio, or subtitles re-resolves at the current position via the same mechanism.

## [0.3.11] - 2026-07-13

### Changed

- **Smoother player, fewer re-renders.** The 500ms player tick called `setState` unconditionally, re-rendering twice a second even when nothing visible changed — which, with dev-mode main-thread jitter, made the bumper countdown tick unevenly (a second would "stick" then jump). The tick now returns the same state object (React skips the re-render) unless a displayed value actually changed, so it re-renders ~once a second during a countdown instead of continuously. (All network calls — heartbeats, `media`/`timeline` resolves — were already non-blocking/async, and the bumper clock advances by real elapsed time, so the *timing* was always exact — only the on-screen number was jittery.)

## [0.3.10] - 2026-07-13

### Fixed

- **Quality dropdown did nothing.** Changing streaming quality re-resolves the current program at the same position, but the player's "already playing this here — skip the reload" guard only compared position, not quality, so it treated the quality change as a no-op and kept the old stream. The guard now also compares the resolved quality, so switching presets actually re-loads with the new cap. (Server-side capping was already correct — verified a preset drops the stream from ~10 Mbps/1080p to ~1.4 Mbps/720p.)

## [0.3.9] - 2026-07-13

### Added

- **Resume on reload.** The player remembers your exact spot on a channel — the **absolute timeline position** (not "seconds behind," since live keeps moving) — in `localStorage`, and resumes there on reload instead of snapping to live. So seeking back and reloading keeps your place (you just end up a little further behind live, DVR-style). Scoped to the **current channel** (switching channels overwrites it, so an old channel starts at live) and **capped**: if you were at the live edge, or walked away longer than ~6h, or the spot has aged out of the retained schedule window, a reload just goes live. The server `WatchSession` now also records `positionAt` (for the "Now Watching" view + future cross-device resume).

## [0.3.8] - 2026-07-13

### Fixed

- **Transcoded streams 400'd on reload / when starting at a large offset** (black player). We requested Plex's `transcode/universal/start.m3u8` directly, but for media that needs a real transcode decision (e.g. an mkv/DTS movie) Plex **400s `start` unless `…/transcode/universal/decision` is called first** to register the session — the documented two-step flow. `getPlaybackInfo` now calls `decision` (same session + params, `hasMDE=1`) before returning the `start` URL. Verified against the server: item 16151 at offset ≥600 went **400 → 200** with the decision step. This is why a channel played on first tune-in (small offset) but reloaded to black (fresh `start` at a large offset). Also added hls.js error surfacing (+ `[player] hls error` logging) so a failed stream shows an error instead of a silent black frame.

## [0.3.7] - 2026-07-13

### Fixed

- **Channel up/down now actually switches channels.** Navigating between `/watch/$channelId` values reused the same mounted component, so the player kept the previous channel's state and never re-bootstrapped. The player is now **keyed by `channelId`**, so each channel is a clean remount.
- **Reload / returning to a channel no longer leaves a black player.** A reload has no user gesture, so the browser blocked `video.play()` and we silently swallowed it. Autoplay-blocked is now surfaced as a **"Click to play"** overlay (and any user-gesture control clears it), so playback starts on the click instead of hanging black.

## [0.3.6] - 2026-07-13

### Added

- **Streaming quality selector** on the player — the same Plex-style ladder the Plex apps expose: **Original** plus standard presets (20/12/10/8 Mbps 1080p, 4/3/2 Mbps 720p, 1.5 Mbps 480p, 720/320 Kbps). "Original" keeps the existing path (direct-play when the file is browser-friendly, uncapped transcode otherwise); **selecting a preset forces a capped transcode** — `maxVideoBitrate` + `videoResolution` + `videoQuality` — and advertises a browser capability profile (`X-Plex-Client-Profile-Extra`), so we exercise the full Plex transcode-decision flow ahead of the TV app. Persisted per-browser; changing it re-resolves the current program in place. `plex/quality.ts` (`QUALITY_PRESETS`) + `playback.qualities` + `quality` on `playback.media`.

## [0.3.5] - 2026-07-13

The viewer half, proven in the browser — a full channel player, a cross-channel guide grid, and in-house watch-session tracking. **Verified live.**

### Added

- **Channel player** (`/watch/$channelId`): the `effectiveTime`/`delaySeconds` state machine from `.docs/playback-model.md` — plays what's on now at the live offset, **auto-rolls at boundaries** (program → interstitial "We'll be right back / Up Next" card with countdown → next program), controls (pause, −15s / −1m rewind, **Jump to Live**, Restart), a **no-future-seek** forward wall, a Live/behind-live badge, and **channel up/down** surfing. Direct-play for browser-friendly files (client seeks to the offset); `hls.js` for transcoded ones.
- **Cross-channel guide grid** (`/guide`): every enabled channel × a time window, program blocks sized by duration, a live "now" line, click-to-tune. Sidebar **Guide** entry.
- **In-house watch sessions** (`WatchSession`) — our own "Now Playing" since we don't report to Plex: heartbeat-based `playback.heartbeat` / `endSession` / `sessions`, a **Now Watching** strip on the guide, and a `watch-session-reap` job that clears stale sessions + stops their transcodes.
- **Playback brokering**: `playback.timeline` (window), `playback.media` (ratingKey + offset → playable URL), `playback.stop` (transcode teardown), `channels.guide` (one-query grid). `getPlaybackInfo` returns a **unique per-resolve session id** (+ `X-Plex-Session-Identifier`) so transcodes are stoppable; `stopTranscode`.

### Fixed

- **HLS playback position.** Plex timestamps HLS transcode segments at the *original media position*, so `video.currentTime` starts at the offset, not 0. The player now captures the true baseline from the first `playing` event and measures progress as a delta — fixing a rollover loop that re-resolved to live every ~1s on transcoded channels. Unique session ids also fixed a "stop the transcode we just started" collision.

## [0.3.4] - 2026-07-13

Playback spike — proves direct-play-from-Plex-at-offset in the browser (the go/no-go before the webOS client). **Verified live**: a channel started playing exactly at its live offset via Plex HLS transcode, no CORS issues.

### Added

- **`getPlaybackInfo`** (Plex client) — resolves a `ratingKey` + offset into a playable URL: `direct` (browser-friendly mp4/h264/aac → original file, client seeks to the offset) or `hls` (everything else → Plex's transcode-universal endpoint with the offset applied server-side).
- **`playback.resolve({channelId})`** tRPC — resolves `getNowNext` into `{ mode, url, offsetSeconds, guide, next }` for a program (or `bumper`/`off` state).
- **`/watch/$channelId`** admin preview page — a `<video>` that plays what's on now at the live offset (native + client-seek for direct, `hls.js` for transcode), with a now-playing/offset/codec readout and up-next. **Watch** button on the channel page. Added `hls.js`.

### Notes

- Playback does **not** report a Plex session/watch-state (intentional — no history pollution; all playback is via the admin connection). Transcode sessions currently linger until timeout; a clean stop-on-teardown lands with the real player. See `.docs/playback-model.md` §8a.

## [0.3.3] - 2026-07-13

### Added

- **Missing-media repair.** Removal detection already flagged vanished items `available = false`, but nothing acted on it — schedules built on now-gone media kept pointing at dead `ratingKey`s. New `repairChannelSchedule` + a `schedule-missing-media-repair` job (hourly) **splice-repair** the affected channels: find the earliest upcoming slot referencing unavailable media (a program pointing at gone media, or a bumper introducing one), then re-flow the timeline from that point with the current live pool — which no longer contains the removed items. What's on now and still-valid near-term slots are left untouched (a 5-min buffer), and a preceding intro bumper is spliced out so there's no "Up Next: <removed>" break. No-op when nothing's broken. Closes the missing-media reconciliation follow-up.

## [0.3.2] - 2026-07-13

### Added

- **Contextual break lengths.** Interstitial duration is now chosen per program transition instead of a single fixed value — a `breakSeconds(prev, next)` classifier (first match wins): same show continues → **quick**, after a movie → **afterMovie**, short episode up next → **quick**, after an episode → **afterEpisode**, else **default**. Every tier + the short-episode-minutes threshold is configurable on the Bumpers page. Verified: movie→movie 120s, same-show 10s, ep→short-ep 10s, ep→diff-show 30s, movie→short-ep still 120s (after-movie wins).
- **Immediate reconcile.** Changing a channel's bumper mode, or saving the Bumpers page, now fires the `schedule-bumper-sync` job right away (fire-and-forget) rather than waiting for its 10-min cron — it self-throttles and no-ops when nothing is stale.

### Changed

- **Bumper Sync now reconciles via a config-revision stamp** instead of comparing each slot to one length (which broke once break lengths legitimately vary). `BumperConfig.rev` bumps on every settings save; each schedule is stamped with the rev it was built under (full rebuild only, not `extend`), and the job rebuilds any channel whose stamp is behind — catching *any* settings change (tiers, threshold, style), not just length.

### Schema

- `BumperConfig`: `afterMovieSeconds` (120), `afterEpisodeSeconds` (30), `quickSeconds` (10), `shortEpisodeMinutes` (20), and `rev`. `Channel.bumperRev` — the config rev its schedule was last built under.

## [0.3.1] - 2026-07-13

### Changed

- **Bumper Sync now also reconciles break-length changes.** Previously the job only detected bumper *presence* mismatches (toggled on/off), so changing the interstitial length left already-built schedules on the old length until their next natural rebuild. It now also flags any channel whose existing interstitial slots' `durationSeconds` no longer match the configured length and rebuilds them. The duration check is restricted to `bumperKind: "interstitial"` slots so future commercial clips (which carry their own media durations) aren't falsely flagged.

## [0.3.0] - 2026-07-13

Opens the 0.3.x line. **Bumpers** — deterministic between-program interstitial breaks (the engine + admin half; the on-screen card lands with the viewer).

### Added

- **Interstitial breaks woven into the timeline.** `buildSchedule` now inserts a `BUMPER` slot before each program (never before the very first slot, so a mid-stream tune-in isn't preceded by a break). Each interstitial has no media of its own — it's a client-rendered *"We'll be right back → Up Next: {title}"* card with cover art + countdown — and references the **upcoming program's** `MediaItem` (`targetMediaItemId`) so the client has the title/art/start-time. Fully deterministic (fixed duration, target derived from the schedule) so every client stays aligned. Verified: 48 programs → 47 breaks, each targeting the next program, deterministic across builds.
- **Global bumper config (singleton) + thin per-channel override.** A new **Bumpers** page owns the content — `enabled` master switch, interstitial length (default 8s, "long enough to stretch"), and an optional music bed (wired for later). A channel only picks a **mode** (`INHERIT | OFF | INTERSTITIAL_ONLY | FULL`) on its edit page — never a source. `bumpers` tRPC router + `channels.bumperMode`.
- **Bumper Sync job** (`schedule-bumper-sync`, every 10 min): reconciles existing schedules when bumpers are toggled on/off (globally or per channel) — rebuilds the channels whose bumper presence is stale, a batch at a time, then idles.
- The channel Schedule card shows breaks inline (`▸ Break — Up Next: …`) and the generate summary reports programs + breaks separately.

### Schema

- `BumperConfig` is now a **global singleton** (`key = "global"`) with interstitial fields + future commercial/mid-program fields (nullable, unused). `Channel.bumperMode` enum. `ScheduleItem`: `ratingKey` nullable (interstitials play nothing), new `bumperKind` + `targetMediaItemId` (FK → `MediaItem`).

### Notes

- Between-programs only for now; the schema leaves room for **commercials-within-the-interstitial** and a **mid-program cadence** (both deferred). Rendering the card + playing media bumpers arrives with the viewer/playback half.

## [0.2.10] - 2026-07-13

### Fixed

- **Filter builder crashed when editing some auto-generated channels** (`Cannot read properties of undefined (reading 'map')`). Presets whose filter is a **single bare condition** (e.g. Quick Bites = `duration ≤ 45`, Movie Marquee, Just Added) store a `condition` node, but the builder's `GroupEditor` assumed a `group` root and read `.children`. Loaded filters are now normalized into a root group — a bare condition is wrapped in an AND group and missing `id`s are backfilled — before the builder renders. The resolver already accepted either shape, so resolution is unchanged; re-saving such a channel just upgrades its stored filter to the wrapped form.

## [0.2.9] - 2026-07-13

### Added

- **Job descriptions.** Every background job definition now carries a one-line `description`, threaded through `JobStatus` and shown on the **Settings → Jobs & Cache** page beneath the job name — so each job explains what it does at a glance. Descriptions live in code (`JOB_DEFINITIONS`) alongside `name`, not in the DB (the `Job` table stays editable-cron + last-run only).

### Docs

- `.docs/jobs.md` refreshed to document all **8** jobs (was 5): adds `schedule-backfill`, `schedule-prune`, and the manual `lineup-generate`, plus the new `description` field and the schedule-refresh/backfill interplay.

## [0.2.8] - 2026-07-12

### Added

- **Schedule Backfill** job (`schedule-backfill`, every 10 min): builds the **initial** schedule for enabled channels that don't have one yet — a small batch (10) per run, with progress — then idles when caught up. Fills the gap where the auto-generator creates channels but nothing built their schedules (Schedule Refresh only *extends* existing timelines; it no-ops on empty channels). Also picks up any newly-generated channels automatically.

## [0.2.7] - 2026-07-12

### Fixed

- **Schedule generation crashed** with "value out of range for type integer" — the shuffle-seed FNV-1a hash returned an *unsigned* 32-bit value (up to ~4.29B), overflowing Postgres `Int` (signed, max ~2.15B). `deriveSeed` now returns a **signed** 32-bit int; the PRNG re-normalizes with `>>> 0` at use, so shuffle output is unchanged.

## [0.2.6] - 2026-07-12

Channel **callsigns** (BunnyEars-style short codes, e.g. `EVRTV`).

### Added

- `Channel.callsign` — a short memorable code (uppercase, alphanumeric, ≤6). Every preset in the catalog now carries its BunnyEars callsign, and the generator writes it on created channels (de-duped against existing ones). A **Callsign** field on the channel form (auto-uppercases, capped at 6) and the code shown in the channel list.
- **`callsign.ts`** helpers (`normalizeCallsign`, `deriveCallsign`, `uniqueCallsign`) + a **backfill script** (`apps/server/scripts/backfill-callsigns.ts`): sets callsigns on generated channels missing one — by `presetKey` where possible, else derived — de-duped. Run with `bun --env-file=.env run scripts/backfill-callsigns.ts`.

### Verification

- All 184 preset callsigns are valid (≤6, uppercase) and unique. `pnpm check-types` passes.

## [0.2.5] - 2026-07-12

### Added

- **Progress bar on the Jobs page** — a running job (e.g. Auto-Generate Lineup, Metadata Sync) now shows its live progress (label + current/total bar), not just a spinner. The page also polls faster (1.5s) while any job is running.

## [0.2.4] - 2026-07-12

Grow the preset catalog (23 → 184 channels).

### Added

- The auto-lineup preset catalog now spans **15 packages / 184 channels** — every BunnyEars preset that maps to our real filter primitives: **Basic, Kids & Family, Comedy, Drama, Action & Sci-Fi, Crime, Horror, Documentary, International** (country-based), **Time Machine** (decades), **Director's Chair** (25 directors), **Star Power** (23 actors), **Studio Spotlight** (17 studios), **Curated & Mood**, **Special Purpose**. Rating/recency/"top" channels use the new **Sorted** ordering (e.g. Critics' Choice by critic rating desc, Just Added by date added desc). The analyzer auto-skips any preset your library can't fill.

### Notes

- Not yet included: the **keyword-driven** channels (heist, zombies, time-travel, franchises) — they need the deferred keyword/TMDB system — and the **68 music stations**, which need a music media-type + music filter fields.

## [0.2.3] - 2026-07-12

Granular lineup regeneration + a schedule-prune job.

### Added

- **Granular regen** — the generator now takes a **scope**: `all` (full rebuild, the Auto-generate button), `packages` (refresh only package styling/metadata), or a **single package** (rebuild just its channels). Packages upsert by key so ids stay stable across regens; empty generated packages are pruned. `generator.regeneratePackage` / `regeneratePackages` tRPC + buttons: **Regenerate channels** on a generated package's page, **Refresh styling** on the Packages list (with an "Auto" badge on generated packages).
- **Schedule Prune** job (`schedule-prune`, daily 02:00): deletes passed schedule slots (older than a 6h safety buffer, so a currently-playing long item is never cut).

### Verification

- `pnpm check-types` passes.

## [0.2.2] - 2026-07-12

Channel **sort ordering** — Plex's full sort set, not just shuffle.

### Added

- A channel is now **Shuffle** (seeded, as before) or **Sorted by…** a Plex sort field with a direction: **Title, Year, Release date, Critic rating, Audience rating, Personal rating, Content rating, Duration, Plays, Date added, Date viewed, Resolution, Bitrate**. `SORT_FIELDS` catalog + `channels.sortFields`; `Channel.sortField` + `sortDir` on the schema; sort controls on the channel form (shown when not shuffling).
- How it fits the engine: **Plex does the sort** (`resolveFilter` passes `sort=field:dir`), and the **schedule engine preserves that order** for non-shuffle channels (shuffle still reshuffles per pass, seeded). `resolveChannel` now shares `resolveFilter` and computes the sort via `channelSortParam`.

### Verified

- `year:desc` returns newest-first; sort-param building checked for all fields. `pnpm check-types` passes.

## [0.2.1] - 2026-07-12

**Auto-lineup generator** — foundation (BunnyEars' headline "machine-learned" feature, done as deterministic presets).

### Added

- **Provenance flags**: `Channel.generated` + `presetKey`, `ChannelPackage.generated`. Regeneration deletes + rebuilds only auto-generated content — manual channels/packages are never touched.
- **Preset catalog** (`services/generator/presets.ts`): packages of channel presets, each a filter tree + minimum-item threshold + icon/tint/number. Starter set = **Basic**, **Time Machine** (decades), and **Genres** (~23 channels); structured to grow toward the full 425.
- **Generator** (`services/generator/generate.ts`): for a source, evaluate every preset against the library (via the shared `resolveFilter`) and instantiate the ones with enough content — skipping presets your library can't fill (e.g. no 4K → no "Ultra HD Theater"). Channel numbers auto-avoid collisions with manual channels.
- Runs as a **manual background job** (`lineup-generate`) with live progress (reusing the sync-button pattern); an **Auto-generate** button on the Channels page (with confirm). Verified live: 3 packages / 23 channels in ~60s.
- Job scheduler gained a **`manual`** flag — such jobs are run-now only, never auto-scheduled.

### Notes

- Generated channels get schedules on the next Schedule Refresh (or manual generate). Granular regen (channels-only / one package) and the full 425-preset catalog are follow-ups.

## [0.2.0] - 2026-07-12

Opens the 0.2.x line. Channel **active/inactive** toggle.

### Added

- **Channel active flag** wired through (the `Channel.enabled` field already existed and the schedule-refresh job already skips disabled channels — it just had no UI): an **Active** checkbox on the channel form, a per-row **quick toggle** + dimmed "Inactive" state on the channels list, and `channels.setEnabled`. Inactive channels won't be selectable in the guide.

## [0.1.17] - 2026-07-12

Complete filter parity — every field Plex exposes in advanced filtering is now available.

### Added

- The remaining Plex advanced-filter fields, for completeness: **Personal rating**, **Play count**, **Last watched**, **Common Sense age**, **Edition**, **Folder location**, **Has unwatched episodes** (`unwatchedLeaves`, TV), **Episode year**, and the maintenance flags **Unmatched / Duplicate / In trash**. Each carries its level (`show.`/`episode.`) and applicable media types like the rest.

### Verification

- `pnpm check-types` passes.

## [0.1.16] - 2026-07-12

Filter catalog expanded to Plex parity (was a hardcoded subset).

### Added

- Filter fields now mirror Plex's advanced-filter set, each with the correct level + applicable media types:
  - **Show title vs Episode title** (the split Plex exposes for TV): `title` → movie title / `show.title`; new `episodeTitle` → `episode.title`.
  - **Network** (TV), **Writer**, **Producer**, **Audio language**, **Subtitle language**.
  - **Release / air date** (`originallyAvailableAt`, episode-level for TV) and **Added within N days** (`addedAt>=-Nd` — Plex relative-date recency, for "fresh/just added" channels).
  - **HDR**, **Dolby Vision**, **In progress** booleans (episode-level for TV).
- Fields carry an `appliesTo` so a filter that can't apply to a library type is skipped (e.g. Network on movies, Duration on TV — Plex has no TV duration filter). New `date` + `recency` field kinds (date-picker / days input in the builder).

### Verified

- Every new primitive checked live: `addedAt>=-30d` (3 movies / 379 eps), `originallyAvailableAt>=2020` (127 / 4304), `hdr` (228 / 619), `audienceRating`/`decade` on movies + TV, and dotted prefixing (`episode.hdr`, `show.network`, `episode.title`). `pnpm check-types` passes.

## [0.1.15] - 2026-07-12

**Fix TV filtering** (it was silently resolving to zero) + richer filter primitives.

### Fixed

- **TV filters now work.** Genre (and every show-level attribute) is stored on the *show* in Plex, but the resolver was querying *episodes* — so genre-filtered TV channels resolved to **0 items**. TV now resolves at `type=4` (episodes) using Plex's **dotted advanced-filter syntax** (`show.genre`, `episode.resolution`), which filters episodes by both show-level and episode-level fields in one query. Verified against the library (e.g. `Animation` TV → 7,276 episodes; `show.genre` + `episode.resolution` combine correctly). Each field carries a `tvScope` (`show` / `episode`); movies are self-contained and unprefixed.

### Added

- **String operators** — `contains` / `does not contain` on text fields, plus a **Title** field (Plex `title=value` is a substring match). Covers franchise/keyword-style channels the practical way.
- **Label** field — filter by your Plex labels (e.g. shows tagged `Anime` / `Kids`). `show.label` for TV.
- **Content rating** and **Resolution** are now **value-list dropdowns** (load the actual ratings/resolutions present, like genre/studio) instead of free-text — filtered by the value key (`contentRating=TV-G`, `resolution=1080`).
- Collection filtering already works as a tag field (`show.collection`), so collection-based channels need no extra machinery.

### Verification

- `pnpm check-types` passes; every primitive verified against the live Plex library via the filter-value + dotted-query diagnostics.

## [0.1.14] - 2026-07-12

### Added

- **Channel description** — the existing `Channel.description` field is now wired into the channel router (create / update / get) and a Description textarea on the channel form.

## [0.1.13] - 2026-07-12

Icon + tint system for channels and packages (virtualized picker over all of lucide + phosphor).

### Added

- **Icon picker** (`features/icons/`, adapted from GuideEngine): a virtualized (`@tanstack/react-virtual`) Base UI popover over the **full lucide + phosphor catalogs** with debounced search. Icons are stored as a single string id — **`lib:ExportName`** (`lucide:Sparkles`, `phosphor:Television`) — and resolved back via a lookup. **Phosphor renders solid** (`weight="fill"`).
- **`icon` + `tint` on `Channel` and `ChannelPackage`** (schema). A combined **`IconTintField`** (preview tile + tint swatches from the existing `TintedIconTile` tokens) on the channel and package forms.
- **Tint inheritance**: a channel's effective icon/tint follows override → its **package** → default, so tinting a package (e.g. "Kids & Family" violet) colors its channels automatically, with per-channel override + Reset.
- Tinted tiles now render in the channels and packages lists. Copied Base UI `popover` into `packages/ui`; exported `TINT_TOKENS`.

### Notes

- The lucide+phosphor catalog is a **code-split ~1.2 MB-gzip chunk** loaded only on icon pages (not in the main bundle). If that first-load cost matters, a follow-up can switch to per-icon dynamic imports.

### Verification

- `pnpm check-types` passes; schema pushed. Needs a live click-test of the picker popover.

## [0.1.12] - 2026-07-12

Channel **packages** — grouping channels into lineups (e.g. "Kids & Family").

### Added

- **`packages` tRPC router** (`list` / `get` / `create` / `update` / `remove`) over the existing `ChannelPackage` model. Create generates a unique slug `key` (so the future auto-lineup generator can upsert packages idempotently); delete leaves channels intact (unassigned) via `onDelete: SetNull`.
- **Packages UI**: `/packages` (list with channel counts) → `/packages/new` (create) → `/packages/$packageId` (rename / describe / see member channels / delete), with breadcrumbs + section icon.
- **Channel ↔ package assignment**: `channels.create`/`update`/`get` carry `packageId`; the channel form has a **Package** selector, and the channel list shows each channel's package tag.

### Verification

- `pnpm check-types` passes.

## [0.1.11] - 2026-07-12

Settings tabs + breadcrumbs (BasicTimeTracker parity).

### Added

- **Settings is now a tabbed section** (seerr-style): `/settings` redirects to **`/settings/main`** (General), with **Jobs & Cache** (`/settings/jobs`) and **About** (`/settings/about`). The tabs render into the SubHeader (HeaderLeft portal) from the settings layout route; the Jobs page moved under it.
- **Breadcrumbs** in the TopHeader (`TopHeaderLeft` portal), ported from BasicTimeTracker: `Breadcrumbs` component + `BreadcrumbProvider` / `useBreadcrumb`. Each route declares `staticData.breadcrumb` (+ section icon/tint matching the sidebar); detail pages publish a dynamic label (e.g. **Sources › _My Plex_**, **Channels › _90s Sitcoms_**, **Settings › Jobs & Cache**).

### Changed

- Sidebar "Settings" now links to `/settings/main`.

### Verification

- `pnpm check-types` passes (route tree regenerates clean).

## [0.1.10] - 2026-07-12

More jobs (incremental scan, removal detection, token check), job **progress**, and an async sync button.

### Added

- **Recently Added Scan** job (`recently-added-scan`, every 5 min): `syncRecentlyAdded` upserts just the most-recently-added items per library (movies, or episodes with their parent show backfilled via a per-item `getMetadata` call) — new content lands in the cache fast without a full scan.
- **Removal detection** folded into **Metadata Sync**: the full pass records a scan start time, and anything whose `lastSyncedAt` predates it is flagged `available = false` (not deleted) — so a schedule built on now-removed media still renders. `MediaItem.available` is now maintained.
- **Plex Token Check** job (`plex-token-check`, daily): verifies each source's owner token still works and logs if it's been revoked.
- **Job progress**: a job's `run(signal, ctx)` can call `ctx.progress({ current, total, label })`; the scheduler tracks it and `jobs.list` returns it. The sync services report per-library progress.
- Plex client: `getRecentlyAdded` (by `addedAt` desc) and `getMetadata` (single item, to backfill a missing parent show).

### Changed

- The **Sync metadata** button (source page) now **triggers the `metadata-sync` job** instead of running on the request thread — it polls `jobs.list` (2 s) to disable the button and show a **progress bar** while the job runs. Removed the synchronous `sources.syncMetadata` procedure.

### Verification

- `pnpm check-types` passes. Smoke-tested under Bun: all 5 jobs schedule with correct crons/next-run times.

## [0.1.9] - 2026-07-12

Background **job scheduler** — ported from seerr's pattern (`node-schedule`, in-process, single-instance).

### Added

- **Job scheduler** (`services/jobs/`): `node-schedule` in-process cron (no Redis / queue / external service — the right weight for a self-hosted single box). A **`Job` table** stores each job's editable cron + last-run bookkeeping; job *definitions* (name, cadence, the work) live in code. On boot, `startJobs()` registers each definition with node-schedule, seeding the default cron if absent. Runs guard against concurrency (skip if already running), record success/failure, and support cooperative **cancel** via an `AbortSignal`.
- **Three initial jobs**: **Metadata Sync** (daily 03:00 — full `syncMediaItems` across enabled sources), **Library Scan** (daily 04:00 — `syncLibraries`), **Schedule Refresh** (hourly — `extendChannelSchedule` tops up any channel running low). The registry is trivially extensible.
- **`jobs` tRPC router** (`list` / `run` / `cancel` / `setSchedule`) + a **Settings → Jobs** page (mirrors seerr's Jobs & Cache): each job with its human-readable frequency (`cronstrue`), next run, last run, **Run now** / **Cancel**, and an edit modal that builds the cron from an "every N minutes/hours/days" selector. Polls every 5s.

### Notes

- Single-instance by design (as is seerr) — on restart, jobs simply re-arm from their persisted cron. Next up: a cheap **recently-added incremental scan** (~5 min) and **removal detection** (full scan marks vanished items unavailable) — both slot into the registry.

### Verification

- `pnpm check-types` passes; schema pushed. Smoke-tested under Bun: 3 jobs schedule, next-run times compute, invalid cron rejected.

## [0.1.8] - 2026-07-12

Normalize the metadata cache into a **show → episode hierarchy** (instead of copying show data onto every episode).

### Changed

- **`MediaItem` is now self-referential** (`parentId`): a show is **one** record holding the show-level metadata (genres, cast, studio, art); each episode is its own record with only its episode-specific fields (title, summary, season/episode, badges) and a `parentId` pointing at its show. Movies stay standalone. The show's metadata is stored **once** and shared by all its episodes — not duplicated per episode (which is what 0.1.7 did).
- **Effective guide is computed at read** by joining the parent and **merging** (episode fields win; the show fills in genres/cast/studio, skipping undefined so nothing gets wiped). Enrich a show once and every episode reflects it.
- **Sync** upserts shows first (capturing their ids), then links each episode to its parent show; `syncMetadata` now reports shows synced too. **Generation gap-fill** links episodes to an already-cached show when present.

### Verification

- `pnpm check-types` (all packages) passes; schema pushed (`MediaItem.parentId` self-relation + index). Needs a live pass (Sync metadata → generate → an episode's guide shows its show's genres/cast via the join).

## [0.1.7] - 2026-07-12

Central **media-metadata cache** — schedule slots reference it instead of copying metadata.

### Added

- **`MediaItem` model** (`media_item`, unique per `mediaSource` + `ratingKey`): the canonical store of a movie/episode's metadata (the full `GuideMeta` bundle + duration/year/air-date, plus an `available` flag for the missing-media edge case). `ScheduleItem` now carries a nullable **`mediaItemId`** FK (`onDelete: SetNull`) and no longer stores `guideData` — the heavy metadata is stored **once** and joined in, not duplicated onto every repeated slot.
- **Metadata sync** (`services/media/sync-media.ts` + `sources.syncMetadata`): pages through every movie/episode in the enabled libraries and upserts the cache. **Episodes are enriched from their parent show** — genres, cast, studio, directors, content rating live on the show in Plex, so a TV slot ends up as rich as a movie slot. Upsert-only (never deletes), so a schedule built on now-removed media still renders. A **"Sync metadata"** button on the source page.
- `getAllSectionItems` (paginated full-library fetch) and `GuideMeta.showRatingKey` (links an episode to its show).

### Changed

- Schedule generation/extension now **upserts the resolved pool into `MediaItem`** (create-only gap-fill, so it never clobbers an enrichment sync) and **links each slot** to its cache row. `nowNext` / `schedule` join `MediaItem` for the guide bundle. Removed metadata from the timeline entries.

### Notes

- Fields the bulk listing still omits (full cast on some servers, HDR) and per-item refresh policy can be layered onto the cache later. The **missing-media reconciliation** (mark unavailable, replace slots) is recorded as a follow-up. Filtered pools over ~800 items are still capped in `resolveChannel` (pagination is a follow-up).

### Verification

- `pnpm check-types` (all packages) passes; schema pushed. Needs a live pass (Sync metadata → generate → check TV episodes now carry genres/cast).

## [0.1.6] - 2026-07-12

Schedule engine, take two — **whole-lineup scheduling** + **rich guide metadata**.

### Changed — scheduling model

- A channel's schedule now materializes its **entire lineup**, not a fixed window. `buildSchedule` lays the pool out back-to-back and always produces **at least one full pass** (every item scheduled), then keeps appending whole passes — reshuffled per pass for SHUFFLE channels — until it covers a **7-day floor**. So ~475 movies build their full ~20-day lineup in one pass; a short pool loops (fresh shuffle each pass) to fill a week. The stored `schedule_item` rows _are_ the lineup.
- **`extendChannelSchedule`** — the routine, non-disruptive path: append a fresh-shuffled block at the tail when the schedule is running low (default: within 2 days), leaving what's on now untouched. Prunes played-out history. `generateChannelSchedule` (full rebuild from now) is now only for after the filter/pool changes. `channels.extendSchedule` mutation + an "Extend" button.
- Dropped the epoch-anchored modulo model — concrete stored rows are simpler and every client still agrees on "what's on now" because the server is authoritative.

### Added — rich `guideData`

- Every slot now carries a full **denormalized guide bundle** (`GuideMeta`) instead of just a title: content rating, year, summary, tagline, studio, **directors**, **genres**, **cast**, audience/critic rating, thumb/art paths, **resolution + audio-channel badges**, and episode context (show title, season/episode). Parsed straight from the Plex section listing — no extra round-trips.
- `nowNext` / `schedule` return the bundle; the channel page's Schedule card shows title, a meta line (SxxEyy · year · rating · genres · director · ★score), 4K/5.1-style badges, and a summary; the lineup list shows titles + content ratings.

### Notes

- Fields the bulk Plex listing omits for some servers (e.g. full cast) just come back empty — a future per-item **MediaItem metadata cache** (also de-duplicating metadata across repeated rows) is the longer-term home. Clumping/interleaving rules for mixed movie+TV channels are noted for later.

### Verification

- `pnpm check-types` (all packages) passes. Needs a live pass against your library.

## [0.1.5] - 2026-07-10

The schedule engine — deterministic, server-authoritative timelines (the make-or-break piece).

### What ships

- **Deterministic timeline math** (`services/schedule/timeline.ts`): a channel's schedule is a pure function of `(ordered pool, item durations, epoch anchor = channel.createdAt, now)`. The ordered pool loops back-to-back forever; the item playing at any wall-clock `t` is `(t − anchor) mod loopDuration`, so every client agrees on "what's on now" (`now − startsAt`) and regeneration is idempotent for a stable pool. Ordering is owned by the engine: **seeded Fisher–Yates** (mulberry32 PRNG off `shuffleSeed`) for SHUFFLE, title order for IN_ORDER, air-date for BY_AIR_DATE.
- **Materialization** (`services/schedule/generate.ts`): `generateChannelSchedule` resolves the candidate pool, builds the timeline over a rolling horizon (default 7 days), and replaces the channel's `ScheduleItem` rows. `getNowNext` returns what's on now (+ the live offset to seek to) and what's next; `getChannelTimeline` returns the window for the guide grid.
- **tRPC**: `channels.generateSchedule` (mutation), `channels.schedule` (windowed timeline), `channels.nowNext` — thin wrappers over the service.
- **Channel page**: a **Schedule** card — "Generate schedule" + a live "on now / up next" readout and the next 12h of slots.
- **Determinism fixes**: ordering moved out of Plex into the engine (Plex `sort=random` was non-deterministic and, under the query cap, returned a different subset each call — resolve now uses a stable sort); `PlexItem` carries `year`/`originallyAvailableAt` for air-date ordering.

### Notes

- **Automated periodic regeneration is deferred** to the job/cron runner decision (trigger.dev vs BullMQ — still parked). For now the schedule is (re)generated on demand via the admin button/mutation. The deterministic core needs no runner to be correct or testable.

### Verification

- `pnpm check-types` (all packages) passes. Needs a live pass against your library.

## [0.1.4] - 2026-07-10

### Fixed

- Filter builder: capped grouping at **one level** to match Plex's actual filter UI — the top level ("Match all / any") holds conditions + groups, but a group holds conditions only (no groups-within-groups). The resolver still handles arbitrary depth; this only constrains the builder UI.

## [0.1.3] - 2026-07-10

Channel filters — true Plex-parity predicate builder (nested AND/OR).

### What ships

- **Recursive filter model** (`ChannelDefinition.plexFilter`): a predicate tree — groups combine children with **AND / OR** (arbitrarily nested); each condition is `{ field, op, value }`. Fields: genre, collection, studio, director, actor, country, contentRating, resolution, year, decade, audienceRating, criticRating, duration (min), unwatched. Operators by kind — tag/string: is / is-not; numeric: is / ≥ / ≤; bool: is.
- **Field + value discovery**: `channels.filterFields` (field catalog + valid operators) and `channels.filterValues` (a tag field's values, unioned across the enabled libraries, from Plex's filter endpoints) — the builder only offers valid fields/values.
- **Resolver via set algebra** (`resolve.ts`): each branch resolves as its own Plex query, combined in code — **intersect for AND, union for OR** — so arbitrary nesting works with only Plex's well-documented simple operators (`=`, `!=`, `>=`, `<=`), sidestepping Plex's fragile OR-URL syntax. AND-of-conditions fast-path ANDs params in one query. Tag titles resolve to per-library ids (cached); duration min→ms; bool→0/1.
- **Nested filter-builder UI** (`filter-builder.tsx`): add condition (field/operator/value dropdowns populated from discovery) + AND/OR + nested groups; replaces the single genre dropdown in the channel form (create + edit).

### Verification

- `pnpm check-types` (all packages) passes. Needs live testing against your library.

## [0.1.2] - 2026-07-10

Channel builder + candidate-pool resolver.

### What ships

- **Channels UX** matching Sources: `/channels` (list) → `/channels/new` (create) → `/channels/:id` (edit + preview + delete).
- A channel can **mix Movies + TV** (or either), filtered by **genre** (matched by title across libraries) + **unwatched**, with an **ordering** (shuffle / in-order / by-air-date). It draws from all *enabled* libraries of the chosen content type(s).
- **Candidate-pool resolver** (`resolveChannel`): translates the definition into Plex filter queries across the matching enabled libraries (resolving the genre title to each library's own id) and returns the item pool. The **Preview** button shows the resolved count + a title sample.
- `channels` tRPC router (list / get / contentGenres / create / update / resolve / remove); `getSectionGenres` / `getSectionItems` on the Plex client.
- **Route-header action portals**: New / Create / Save / Preview / Delete now render in the SubHeader's right slot (`HeaderRight`) — the intended use of the header-provider portals.

### Verification

- `pnpm check-types` (all packages) passes. Needs live testing against your library.

## [0.1.1] - 2026-07-10

Sources management + per-library enable/disable (Overseerr-style).

### What ships

- **Multi-source Sources UX**: `/sources` (list) → `/sources/new` (connect flow) → `/sources/$id` (manage). Each source is renamable.
- **`MediaLibrary`** model + sync: connecting a server (or Rescan) syncs its libraries from Plex; each library has an **`enabled`** toggle — the admin picks which libraries (Movies, TV, …) feed channels.
- **`sources` tRPC router**: `list` / `get` / `updateLabel` / `rescan` / `setLibraryEnabled` / `remove` (admin). `plex.saveConnection` now syncs libraries + returns the new source id; removed the single-source `currentSource` / `libraries` procedures.
- Detail page: rename label, connection info, per-library enable checkboxes + Rescan, remove source.

### Verification

- `pnpm check-types` (all packages) passes. Needs live testing against your libraries.

## [0.1.0] - 2026-07-10

Channel engine — foundation: Plex Media Server access.

### What ships

- **Plex PMS client** — `getLibraries(baseUrl, token)` queries the *connected server itself* (not just plex.tv) for its libraries (sections), confirming the ChannelGuide server can reach the PMS over the LAN.
- **`plex.libraries`** tRPC procedure (admin) reads the connected `MediaSource` and returns its libraries.
- **Sources page** lists the connected server's libraries under the connection status.

### Verification

- `pnpm check-types` (all packages) passes.

## [0.0.15] - 2026-07-10

### Fixed

- Plex login redirected to `/post-login` on the auth-server origin (`:3000`) → 404. Now passes an absolute web-app `callbackURL` (like the Google/GitHub buttons already do), so it lands on the web app after sign-in.

## [0.0.14] - 2026-07-10

### Fixed

- Plex login: added the `tokenUrl` + `userInfoUrl` that genericOAuth's config validation requires (both overridden at runtime by `getToken` / `getUserInfo`). Fixes the `INVALID_OAUTH_CONFIGURATION` (400) when clicking "Continue with Plex".

## [0.0.13] - 2026-07-10

Plex login (web) + all OAuth login-only.

### What ships

- **"Continue with Plex" now works** via better-auth's `genericOAuth` `plex` provider. Plex has no static authorize URL or callback `code`, so its `authorizationUrl` points at a new **`GET /api/plex/authorize`** proxy that creates a pin and bounces to `app.plex.tv/auth`, smuggling the pin id back as the OAuth `code`. `getToken` then fetches the real Plex token by pin id and `getUserInfo` reads the Plex account email — better-auth handles the session, email-linking, and login-only enforcement.
- **`disableSignUp: true`** on Google + GitHub (and Plex): all OAuth is login-only — it links to an existing account by email and never creates one.
- Stable `X-Plex-Client-Identifier` (env `PLEX_CLIENT_IDENTIFIER`); `genericOAuthClient` added to the auth client; `signIn.oauth2({ providerId: "plex" })` wired to the button.

### Notes

- Sign-in only succeeds for an existing account (admin-seeded or Import Plex Users) whose email matches the provider's.

### Verification

- `pnpm check-types` (all packages) passes. Needs live testing of the Plex login round-trip.

## [0.0.12] - 2026-07-10

Import Plex Users (Overseerr-style).

### What ships

- **`getSharedUsers`** (Plex client) — reads the connected server's shared users via `plex.tv/api/users` (XML, filtered by the server's `machineIdentifier`) using `fast-xml-parser`.
- **`plex.importUsers`** (admin) + the `importPlexUsers` service — creates a Viewer account for each shared Plex user (matched by email); idempotent (skips existing).
- **`users.list`** procedure + **Users page** — lists ChannelGuide users with their roles and an **"Import Plex Users"** button.

### Notes

- Provisioned users have no password; they sign in via Plex/Google/GitHub (matched by email) or magic link. Plex login itself is next (v0.0.13).

### Verification

- `pnpm check-types` (all packages) passes. Needs live testing against your shared users.

## [0.0.11] - 2026-07-10

### Fixed

- Sources: "Use SSL" no longer defaults on when a Plex server is selected. Plex reports local connections as `https` via its `*.plex.direct` certs, but a raw-IP LAN connection is plain http — so SSL now defaults off (Overseerr behavior); toggle it on if your server needs it.

## [0.0.10] - 2026-07-10

Admin Plex media-server connection (Overseerr-style).

### What ships

- **Plex API client** (`packages/api/src/services/plex/client.ts`): the "Sign in with Plex" handshake — `createPin` → hosted auth URL → `getPinToken` (poll) → `getPlexUser` (email) → `getServers` (owned + shared).
- **Plex tRPC router** (admin-only): `createAuthPin`, `checkAuthPin`, `listServers`, `saveConnection`, `currentSource` — thin procedures over the service. Added `adminProcedure` (role check) and `prisma` on the tRPC context.
- **Sources page** matching Overseerr: Sign in with Plex (popup) → **Load available servers** dropdown → **Hostname/IP · Port · Use SSL · Web App URL** → Save.
- Persists the chosen server as the owner **`MediaSource`** (added `clientIdentifier` + `webAppUrl` fields).

### Notes

- The admin's Plex token currently transits the browser during connect (self-hosted single-admin); harden to server-side later.
- "Import Plex Users" (provisioning) + Plex login are separate upcoming tasks.

### Verification

- `pnpm check-types` (all packages) passes. Needs live testing against a real Plex server.

## [0.0.9] - 2026-07-10

Google + GitHub OAuth (env-gated) on the login page.

### What ships

- `packages/auth`: env-gated social providers — Google and GitHub are enabled only when both `*_CLIENT_ID` + `*_CLIENT_SECRET` are set (BasicTimeTracker's conditional-enable pattern), with `account.accountLinking.trustedProviders`.
- `packages/env`: added `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (optional).
- Login page: "Continue with Google" / "Continue with GitHub" buttons with inline brand-SVG icons (lucide 1.x dropped brand icons).
- Fixed a strict-tsconfig error in the copied `string-to-tint` (`noUncheckedIndexedAccess`) so `packages/ui` typechecks cleanly.

### Notes

- Set a provider's `*_CLIENT_ID` / `*_CLIENT_SECRET` in `apps/server/.env` to enable its button. OAuth app callback URL: `http://localhost:3000/api/auth/callback/{google,github}`.
- Plex web sign-in (redirect flow) and the TV PIN/device flow are separate, upcoming.

### Verification

- `pnpm check-types` (all packages) passes.

## [0.0.8] - 2026-07-10

Authenticated layout now matches BasicTimeTracker's exactly.

### What ships

- Ported BTT's two-tier layout verbatim (single-tenant): a transparent **TopHeader** (`h-14`, `grid-cols-[1fr_auto_1fr]`, with the `SidebarTrigger`) over an **inset content card** (`bg-background m-2 rounded-md border shadow-sm`) containing a **SubHeader** route-header strip (`h-10`, `border-b`) and the scrollable content (`p-6`). The whole thing floats on the **`bg-noisy`** textured background that shows through the top header.
- Restored the full portal-based `header-provider` (TopHeader + SubHeader slots: `TopHeaderLeft/Center/Right` + `HeaderLeft/Center/Right`).
- Restored the `bg-noisy` utility + `--t-background-noisy` tokens and copied the noise texture assets (`noisy-light.png` / `noisy-dark.jpg`).
- Routes can opt out of the SubHeader (`hideSubHeader`) or content padding (`fullBleed`) via `staticData`, matching BTT.

### Verification

- `pnpm -F web check-types` passes.

## [0.0.7] - 2026-07-10

Env-based admin seeding (Overseerr-style).

### What ships

- On server startup, `seedAdmin()` (`packages/auth`) bootstraps the first admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`: creates the account (password hashed via better-auth `signUpEmail`) and sets the `admin` role, then verifies email. Idempotent — promotes an existing account to admin, and is a no-op if the env vars are unset (e.g. a pure Plex/OAuth deployment).
- Added `ADMIN_EMAIL` / `ADMIN_PASSWORD` to the server env schema; called from `apps/server` startup.

### Verification

- Server startup logs `✅ Seeded/Promoted <email> to admin`; the account signs in with email + password.

## [0.0.6] - 2026-07-10

Fixed the admin UI to actually match BasicTimeTracker.

### What ships

- Replaced the scaffold's **drifted** base-lyra components with BasicTimeTracker's committed versions verbatim (`button`, `card`, `input`, `label`, `checkbox`, `textarea`, `dropdown-menu`, `tooltip`, `skeleton`, `sonner`, `sidebar`, `sheet`, `separator`, `collapsible`, `avatar`, `tinted-icon-tile`, + `string-to-tint`). Fixes the missing button radius — the registry's current base-lyra `button` ships `rounded-none`; BTT's is `rounded-lg`. (Re-adding via `shadcn add` would have re-pulled the sharp version, so a verbatim copy was the only way to match exactly.)
- Theme now defaults to **system** (`enableSystem`), not forced dark.
- Sidebar rebuilt to match BTT exactly: the user dropdown sits in the **header (top)** where BTT's workspace menu is — a logged-in-user menu (name/email, theme submenu, sign out) — and nav items render **tinted icon tiles** inside a collapsible `NavGroup`.
- Removed the TanStack devtools overlays.

### Verification

- `pnpm -F web check-types` passes.

## [0.0.5] - 2026-07-10

Routing cleanup and login refinements.

### What ships

- `/` is now the guarded dashboard itself (`_auth/index.tsx`) — no more `/` → `/dashboard` → `/login` redirect chain.
- Added a `/post-login` route (BasicTimeTracker-style landing seam; the future hook for a "link Plex" gate). Password sign-in + magic-link callbacks point here.
- Login page restyled to match BasicTimeTracker's sign-in exactly: centered Card `max-w-sm`, `text-3xl` title, `text-base` description, outline `lg` provider button (`justify-start` + icon), the OR divider, bare `h-12 text-base` inputs, `lg` full-width submit, `mt-6` muted helper text — with the Plex CTA + email/password + a magic-link toggle.
- Removed self-service sign-up — accounts are admin-issued or via Plex (Overseerr-style).

### Verification

- `pnpm -F web check-types` passes.

## [0.0.4] - 2026-07-10

Ported BasicTimeTracker's authenticated app layout, de-workspaced to single-tenant.

### What ships

- Copied the base-lyra sidebar primitives verbatim into `packages/ui` (`sidebar`, `sheet`, `separator`, + the `use-mobile` hook; icons via `@phosphor-icons/react`).
- `apps/web` layout: `app-layout` (SidebarProvider + collapsible icon sidebar + sticky header + content), `app-sidebar` with the ChannelGuide nav (Channels, Packages, Sources, Bumpers, Users, Settings), and a `user-menu` (initials/avatar, theme submenu, sign out) replacing BTT's workspace menu.
- Portal-based `header-provider` (HeaderLeft/Center/Right slots) — no setState-slot loops.
- Stub routes for each nav item; `_auth` renders the layout.
- `/` now redirects into `/dashboard` (→ `/login` when unauthenticated) — fixes the scaffold's public home page not guarding.
- Removed the scaffold's global header, home page, old user-menu, and mode-toggle.

### Verification

- `pnpm -F web build` and `check-types` pass.

## [0.0.3] - 2026-07-10

Ported a de-workspaced login page in BasicTimeTracker's Card aesthetic.

### What ships

- `apps/web/src/features/auth/login-page.tsx`: centered Card login with a primary "Sign in with Plex" CTA (placeholder — wired in v0.0.5), email/password sign-in + sign-up, and a magic-link option with a "check your email" confirmation. Redirects to `/dashboard` on success — no workspace/org coupling.
- `apps/web/src/lib/auth-client.ts`: single-surface better-auth client with the `admin`, `deviceAuthorization`, and `magicLink` client plugins; re-exports `signIn` / `signUp` / `signOut` / `useSession` / `getSession`.
- `/login` redirects already-authenticated users to `/dashboard`.
- Removed the scaffold's `sign-in-form` / `sign-up-form` (superseded).

### Verification

- `pnpm -F web build` succeeds.

## [0.0.2] - 2026-07-10

Ported BasicTimeTracker's design system into the admin UI (`apps/web` / `packages/ui`).

### What ships

- `packages/ui/src/styles/globals.css`: BTT's Twenty-parity oklch palette (indigo primary), refined border tokens (`border-light` / `border-strong`), `row-selected` + layered `shadow-light` / `shadow-strong`, `0.45rem` radius, and a tighter 13px `text-sm`.
- Inter Variable webfont via `@fontsource-variable/inter` (self-hosted, bundled).
- Kept the `skeleton` + `caret-blink` animations (shadcn skeleton + OTP input, handy for device codes). Dropped BTT-app-specific bits: noise texture (asset-dependent), record-table sticky shadow, quicklog wedge-pulse.

### Verification

- `pnpm -F web build` succeeds; Inter woff2 assets bundle and the theme CSS compiles.

## [0.0.1] - 2026-07-10

Project foundation — the Better-T-Stack monorepo, the full data model, and auth wiring for the self-hostable "custom live TV channels" service (the NostalgeX / BunnyEars concept, cross-platform instead of Apple-only).

### What ships

- **Stack:** Better-T-Stack scaffold — Turborepo + pnpm monorepo, Hono/Bun server, TanStack Router admin web (`apps/web`), Postgres + Prisma, tRPC + better-auth. Admin UI on the Base UI (`base-lyra`) shadcn variant with the `@coss` registry.
- **Auth config** (`packages/auth`): email/password + better-auth `admin` (roles), `deviceAuthorization` (RFC 8628 TV device grant), and `magicLink` (dev console sender) plugins; `encryptOAuthTokens`; 30-day sessions. Custom Plex PIN provider stubbed as a TODO.
- **Data model** (`packages/db`, one `.prisma` file per domain): `MediaSource`; `Channel` / `ChannelPackage` / `ChannelDefinition` (predicate / collection / playlist / manual, with INCLUDE/EXCLUDE); `ScheduleItem` (materialized timeline); `BumperConfig`; `Favorite` + `ChannelWatchState`; plus the better-auth tables including `device_code` (aligned to GuideEngine's proven shape). Pushed to Postgres.
- **Tooling:** `.gitignore` local-only sections (`.docs/`, `.plans/`), the `/version-bump` release skill, and the `@coss` shadcn registry.

### Notes

- `.docs/` (architecture + feature-parity design docs) and `.plans/` are gitignored — local only.
- Dev database runs on `localhost:5433` (`ChannelGuide` / `ChannelUser`).
