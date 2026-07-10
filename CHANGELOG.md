# Changelog

All notable changes to ChannelGuide are documented here.

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
