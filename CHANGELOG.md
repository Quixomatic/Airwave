# Changelog

All notable changes to ChannelGuide are documented here.

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
