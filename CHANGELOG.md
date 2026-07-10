# Changelog

All notable changes to ChannelGuide are documented here.

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
