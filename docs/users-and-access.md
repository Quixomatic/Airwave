# Users & access control

> How Airwave provisions viewer accounts from a Plex server and gates what each viewer can see and play, down to the individual channel — enforced server-side, not just in the UI.

## Overview

In Airwave, **authentication is identity only** — it answers *"who is this?"*, never *"what may they watch?"*. The two concerns are deliberately separate: sign-in establishes a `User` row and a role; a distinct access layer decides which channels that user can reach.

Key facts about the auth model:

- **Accounts are admin-provisioned, never self-serve.** They are created one of three ways: seeded from the environment (the initial owner/admin), created by an admin, or bulk-imported from Plex (below). There is no public sign-up.
- **All OAuth is login-only.** Sign in with Plex, Google, or GitHub only ever *matches* an existing account by email — it never creates one. This is enforced with `disableSignUp: true` on every provider in `packages/auth/src/index.ts`. A stranger who authenticates with Google but has no Airwave account simply cannot get in.
- **Two roles, via the better-auth admin plugin.** `admin` and `user` (we treat `user` as "Viewer"). Configured in `packages/auth/src/index.ts`:

  ```ts
  admin({ defaultRole: "user", adminRoles: ["admin"] })
  ```

  `role` is a column on the `User` model (`packages/db/prisma/schema/auth.prisma`) and is server-issued — a client cannot forge it.
- **Login surfaces:** email/password is always on; Plex/Google/GitHub OAuth light up when their credentials are configured; TV clients use a bearer token minted through an RFC 8628 device-code flow. All of these authenticate against an *existing* account.

Everything below is layered on top of that identity: given a known `User`, what can they watch?

## Importing users from Plex (the "Import Plex Users" flow)

Rather than making every household member register by hand, an admin can pull in everyone the Plex server is already shared with. This is an **explicit, Overseerr-style action** (a button), not an automatic background sync.

**Where it lives:**

- UI: `apps/web/src/routes/_auth/users/index.tsx` — the "Import Plex Users" button (calls `trpc.plex.importUsers`).
- Router: `packages/api/src/routers/plex.ts` → `importUsers` (an `adminProcedure`). It finds the connected `MediaSource` of type `PLEX` and hands it to the service; if none is connected it throws `PRECONDITION_FAILED` ("Connect a Plex server first.").
- Service: `packages/api/src/services/plex/import-users.ts` → `importPlexUsers(prisma, source)`.
- Plex fetch: `packages/api/src/services/plex/client.ts` → `getSharedUsers(...)`.

**How it works** (`import-users.ts`):

1. The connected source must have both a `clientIdentifier` and a `machineIdentifier`; otherwise it throws (reconnect the server).
2. `getSharedUsers` calls the classic `https://plex.tv/api/users` XML endpoint (the same one Overseerr/Tautulli use) with the *decrypted* owner token. Each `<User>` carries nested `<Server>` entries; the client keeps only users whose server list includes **this** server's `machineIdentifier`. Each result is `{ plexId, email, username, thumb }`.
3. For each shared user:
   - **Skip** anyone with no email (email is the identity key).
   - **Skip** anyone whose email already matches an existing `User` — this is what makes the import **idempotent**; re-running it never duplicates and never touches owner-created or env-seeded admins.
   - Otherwise **create** a `User` with a fresh UUID, the Plex email, the Plex username as `name`, `emailVerified: true`, and `role: "user"` (Viewer).
4. Returns `{ imported, skipped, total }`, which the UI surfaces as a toast ("Imported N users — M already existed.").

Note what import does **not** do: it does not store a Plex token for the imported user, and it does not log them in. It just makes an account exist so that, later, "Sign in with Plex" (login-only) can match them by email. New users are created with `allAccess = true` (the schema default — see below), so an imported viewer can see everything until an admin restricts them.

## Access model — the three levels

A user's effective access resolves to a **set of channel ids**. There are three levels of granularity, defined in `packages/db/prisma/schema/access.prisma` and the `User` model in `auth.prisma`:

### Level 1 — All access (`User.allAccess`)

`User.allAccess` is a boolean, **default `true`** for every new user. When true, the user sees **everything, including packages and channels added in the future**. This is the "just works" default; an imported or newly created viewer sees the whole lineup until someone narrows it.

### Level 2 — FULL access to a package

A `UserPackageAccess` row with `mode = FULL` grants **every channel in that package, including channels added to it later**. This is how new content flows automatically without all-access: add a channel to a package, and everyone with FULL access to that package picks it up for free.

### Level 3 — PARTIAL package + explicit channels

A `UserPackageAccess` row with `mode = PARTIAL` grants **only** the specific channels listed for that user in `UserChannelAccess`. Channels added to the package later are **not** granted automatically — an admin has to come back and grant them.

**The two grant tables** (`access.prisma`):

- `UserPackageAccess` — one row per package the user has *some* access to (`@@unique([userId, packageId])`), carrying `mode` (`FULL` | `PARTIAL`). Absence of a row = no access to that package.
- `UserChannelAccess` — an explicit per-channel grant (`@@unique([userId, channelId])`). Used for the channels of a PARTIAL package, and for ungrouped channels.

Both cascade on delete of the user, package, or channel, so grants clean themselves up.

**How future content flows** (the crux):

- Level 1 (all-access) and Level 2 (package FULL) are the **only** ways new content reaches a user automatically.
- Level 3 (PARTIAL), and any package the user simply isn't granted, require the admin to grant the new channel explicitly.

**Ungrouped channels** (a `Channel` with `packageId = null`) are a special case: there is no package to hang a FULL grant on, so a restricted user can only receive them **individually** via `UserChannelAccess`. Consequently, a newly-added ungrouped channel is auto-granted **only** to all-access (Level 1) users; restricted users keep exactly the ungrouped channels they were granted and must be re-granted when new ones appear.

A user with `allAccess = false` and **no** grant rows sees **nothing**.

## Enforcement

All the levels above are resolved by one function, and that resolver is woven into every viewer-facing REST read plus the playback gate. Enforcement is **server-side** — hiding a channel in the UI is not what protects it.

### The central resolver — `accessibleChannels`

`packages/api/src/services/access/access.ts`:

```ts
export type AccessSet = "all" | Set<string>;
export async function accessibleChannels(prisma, userId): Promise<AccessSet>
```

Resolution logic:

- Load the user's `role`, `allAccess`, their `FULL` package grants, and their explicit channel grants.
- **`role === "admin"` OR `allAccess` → return `"all"`** — a sentinel that short-circuits every downstream filter (admins and all-access users are never filtered).
- Otherwise build a `Set<string>`: the explicit `UserChannelAccess` channel ids, **unioned** with every channel whose `packageId` is one of the user's FULL packages.
- An unknown user resolves to an empty set (sees nothing) — fail-closed.

Two helpers make the sentinel ergonomic for callers:

```ts
isChannelAllowed(access, channelId)  // "all" ⇒ true, else set membership
filterAccessibleIds(ids, access)     // "all" ⇒ unchanged, else intersection
```

### Woven into the REST surface — `apps/server/src/rest.ts`

This is the REST API the TV apps (`apps/tv-web`, `apps/tv-native`) hit as viewers. Two pieces of middleware do the work:

1. **Resolve once per request.** The `api.use("*")` middleware requires an authenticated session (cookie or `Authorization: Bearer <token>`), then stashes `accessibleChannels(...)` on the Hono context as `c.get("access")`. A viewer tunes across several endpoints per session, so the set is resolved a single time and reused.

2. **Gate every per-channel route in one place.** `api.use("/channels/:id/*")` returns **403** unless `isChannelAllowed(access, id)`. The must-have here is **`GET /channels/:id/media`** — the actual stream resolver. Because the gate is on the server, a direct bearer call or a deep-link to a channel number a viewer can't see is refused (403 "You don't have access to this channel"), regardless of what the UI shows.

Reads are **filtered** by the access set (channels the viewer can't see never appear):

- `GET /channels` → `listGuideChannels(prisma, access)`
- `GET /packages` → `listActivePackages(prisma, access)`
- `GET /guide` → `getGuideGrid(..., access)`
- `GET /favorites`, `GET /recents` → `filterAccessibleIds(...)` (inaccessible favorites/recents are **hidden, not deleted** — re-granting restores them)

Routes whose channel id lives in the request **body** — `POST /favorites`, `POST /sessions/heartbeat`, `POST /playback/log` — are gated inline with `isChannelAllowed` (middleware can't read the body without consuming it).

Device-level routes (`/qualities`, `/connections`, `/caps/*`, `/device/*`) are not channel-scoped and aren't gated. `GET /sessions` (the "Now Watching" view) is admin-only, checked inline.

**Admins bypass everything** because their access resolves to `"all"`, which short-circuits every filter and every gate above.

### Not duplicated on the admin surface

The admin panel is tRPC (`packages/api/src/routers/`), every procedure is an `adminProcedure`, and admins are `"all"` — so no viewer filtering is added there. All access enforcement lives on the REST surface. This keeps the check in exactly one place per concern.

## Admin-only lockout

Viewers never belong in the admin panel — they use the TV apps. Two independent layers keep them out (defense in depth):

1. **Route guard (`apps/web/src/routes/_auth/route.tsx`).** The `_auth` layout's `beforeLoad` calls `authClient.getSession()` (a real server round-trip, so `role` is the DB-backed, better-auth-issued value — not something the client can forge). No session → redirect to `/login`. `role !== "admin"` → redirect to `/not-authorized`. A non-admin simply cannot render any admin route; they still use the TV apps normally.

2. **Every data call is an `adminProcedure` (`packages/api/src/index.ts`).** Even if the route guard were bypassed, each admin tRPC procedure re-checks the role server-side and throws `FORBIDDEN` for non-admins:

   ```ts
   export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
     const role = ctx.session.user.role ?? null;
     if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", ... });
     return next({ ctx });
   });
   ```

So the UI guard is a convenience and a redirect; the actual protection is that the server refuses non-admin calls.

## Granting access (the admin UI, briefly)

An admin manages a viewer's access from the Users area (`apps/web/src/routes/_auth/users/`):

- **`users/index.tsx`** — the list, with the "Import Plex Users" button and a per-user badge ("All access" or "N of M channels").
- **`users/$id/index.tsx`** — the profile, summarizing what the user can see (e.g. "Restricted — 2 full packages, 1 partial, 3 channels").
- **`users/$id/access.tsx`** — the access editor grid. Admins show as "always full access, nothing to configure."

The editor maps the three levels onto simple switches:

- A master **"All packages & channels"** switch bound to `allAccess`. On → the user sees everything (incl. future content), grid hidden. Off → reveal the grid, pre-populated with everything currently selected.
- Each package tile has a **header switch** and per-channel toggles. On **Save**, the selected set is translated back into grants (see the `save()` in `access.tsx`):
  - A package with **all** its channels selected → `FULL` (future channels included).
  - A package with **some** selected → `PARTIAL` + explicit `UserChannelAccess` rows for the checked channels.
  - Selected **ungrouped** channels → explicit `UserChannelAccess` rows.
- "Reset to all access" flips the master switch back on.

Saving calls `trpc.users.setAccess`, which routes to `setUserAccess` in `access.ts` — a single `prisma.$transaction` that sets `allAccess`, deletes the prior grant rows, and recreates them from the payload (a "stage → apply once" replace). When `allAccess` is true, grant rows are cleared entirely (they're moot), so toggling all-access back off later starts from a clean, all-selected grid.

---

### Source map

| Concern | File |
| --- | --- |
| Auth config, login-only OAuth, roles | `packages/auth/src/index.ts` |
| `User.allAccess`, `role` | `packages/db/prisma/schema/auth.prisma` |
| `UserPackageAccess`, `UserChannelAccess`, `PackageAccessMode` | `packages/db/prisma/schema/access.prisma` |
| Import service | `packages/api/src/services/plex/import-users.ts` |
| Plex shared-users fetch | `packages/api/src/services/plex/client.ts` (`getSharedUsers`) |
| Import router | `packages/api/src/routers/plex.ts` (`importUsers`) |
| Access resolver + read/write helpers | `packages/api/src/services/access/access.ts` |
| Access admin router | `packages/api/src/routers/users.ts` |
| REST enforcement (middleware + gate) | `apps/server/src/rest.ts` |
| `adminProcedure` | `packages/api/src/index.ts` |
| Admin route guard | `apps/web/src/routes/_auth/route.tsx` |
| Admin access UI | `apps/web/src/routes/_auth/users/**` |

_History: see `CHANGELOG.md` (v0.9.21 → v0.9.27) — the access-control config, REST enforcement, and the admin-only lockout._
