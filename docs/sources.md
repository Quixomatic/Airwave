# Media sources (Plex)

> How an admin connects a Plex Media Server to Airwave once, and how that single connection powers metadata, channel-building, and playback for every viewer — on- and off-network.

## Overview

Airwave builds channels from, and streams content out of, a **media source**: a media server an admin connects. Today that means **Plex** (the `MediaSourceType` enum reserves `JELLYFIN` and `EMBY`, but only `PLEX` is wired up — `packages/db/prisma/schema/media-source.prisma`).

The model is Overseerr-style: **one admin connects one server, and that connection serves everyone.** When you sign in with Plex on the *Add a source* screen, Airwave stores the **owner token** on the `MediaSource` row. That token — the *content token* — is what the server uses for all metadata scraping and all playback brokering, for every viewer, whether or not the viewer has their own Plex account.

Do not confuse this with viewers signing in:

- **The source's owner token is a content token.** It authenticates the server's calls to Plex (list libraries, page metadata, resolve a playable URL). It is obtained once, by an admin, and stored encrypted.
- **A viewer's Plex login is identity-only.** "Sign in with Plex" as a *viewer* only matches an existing Airwave account by email — it never mints a token that streams content, and never creates an account. See [Users & access control](users-and-access.md).

So there is exactly one Plex token doing the streaming (the admin's), and playback is brokered through it for all users. This doc covers connecting that source; access control is a separate layer.

## Connecting a Plex server

The flow lives in the admin UI at **Sources → New source** (`apps/web/src/routes/_auth/sources/new.tsx`) and is backed by the `plex` tRPC router (`packages/api/src/routers/plex.ts`), which talks to Plex through `packages/api/src/services/plex/client.ts`. It is the same "Sign in with Plex" device-pin handshake Overseerr uses.

1. **Sign in with Plex.** The UI calls `plex.createAuthPin`, which asks `plex.tv/api/v2/pins?strong=true` for a pin (`id` + `code`) and builds the hosted auth URL (`https://app.plex.tv/auth#?…`). The browser opens that URL in a popup.
2. **Approve + poll.** After you approve in the popup, the UI polls `plex.checkAuthPin` every 2 seconds (with a 2-minute deadline). `checkAuthPin` calls `getPinToken`; once Plex returns an `authToken`, it also fetches the Plex account (`getPlexUser`) so the UI can show "Signed in as \<email\>".
3. **Pick a server.** `plex.listServers` calls Plex's `/resources?includeHttps=1&includeRelay=1` and returns every server the token can reach — **owned and shared** (shared servers are labelled "(shared)" in the picker). Selecting one pre-fills its host/port from the server's local, non-relay connection.
4. **Confirm connection details.** Host, port (default `32400`), an optional **SSL** switch, and an optional Web App URL override. The `baseUrl` saved is literally `${ssl ? "https" : "http"}://${host}:${port}`.
5. **Save.** `plex.saveConnection` creates (or updates) the `MediaSource` and immediately syncs its libraries.

**SSL note:** selecting a server always resets the SSL switch to *off* and fills in the local address, because Airwave normally runs **alongside** Plex on the LAN and reaches it over plain HTTP at `http://<host>:32400`. Flip SSL on only if you're pointing `baseUrl` at an HTTPS endpoint (e.g. a `plex.direct` hostname or a reverse proxy). Off-network HTTPS URLs are handled separately (see [On- and off-network connections](#on--and-off-network-connections)).

**What `saveConnection` writes** (`packages/api/src/routers/plex.ts`):

- `type: "PLEX"`, `name`, `baseUrl`, `machineIdentifier` (Plex's `clientIdentifier`), `clientIdentifier` (the `X-Plex-Client-Identifier` used to obtain the token), optional `webAppUrl`.
- `token` — the owner token, **encrypted at rest** via `encryptToken` (see [How it works](#how-it-works-brief)).
- `remoteUrl` / `relayUrl` — best-effort off-network URLs resolved at save time; a failure here is fine because the hourly refresh job keeps them current.
- `ownerUserId` (the admin who connected it), `enabled: true`, `isDefault: true`.
- It **dedupes by `machineIdentifier`**: reconnecting the same physical server updates the existing row in place (e.g. to refresh a re-issued token) rather than creating a duplicate.

After saving, the UI redirects to the source detail page. A source shows as **Ready** only once it is *connected* (`enabled` + a `baseUrl`) **and** *synced* (its metadata cache has at least one item) — otherwise it's badged **Disconnected** or **Not synced** in the list (`sources.list`, `apps/web/src/routes/_auth/sources/index.tsx`).

## Libraries

A Plex server's libraries (Plex calls them *sections*) become `MediaLibrary` rows. `syncLibraries` (`packages/api/src/services/plex/sync-libraries.ts`) fetches them via `getLibraries` → `/library/sections` and **upserts** each by `(mediaSourceId, key)`:

- **New libraries are added enabled.** The `create` branch sets no `enabled` value, so the schema default (`true`) applies.
- **Existing libraries keep your choice.** The `update` branch only touches `title`, `type`, and `lastScanAt` — it never overwrites `enabled`. So toggling a library off and re-scanning leaves it off.

On the source detail page (`apps/web/src/routes/_auth/sources/$sourceId.tsx`) you can:

- **Toggle each library** on/off (`sources.setLibraryEnabled`). Only enabled libraries feed channels.
- **Rescan** (`sources.rescan`) — re-runs `syncLibraries` to pick up libraries added or removed on the Plex side, preserving enable/disable choices. This just refreshes the *list of libraries*; it does not page item metadata.

## Syncing metadata

Discovering libraries is cheap; caching the items inside them is the heavier job. Airwave keeps a dedicated `MediaItem` cache (per source + `ratingKey`) so schedules and guides never need a live round-trip to Plex for display metadata. Three background jobs keep it fresh (all defined in `packages/api/src/services/jobs/definitions.ts`; catalog in [Background jobs](jobs.md)):

| Job | Cadence | What it does |
|---|---|---|
| **Metadata Sync** (`metadata-sync`) | Daily 03:00 | Full refresh: pages **all** movies and episodes from every enabled source, links episodes to their parent shows, and flags anything no longer on the server as `available: false` (a soft delete, so built schedules still render). |
| **Recently Added Scan** (`recently-added-scan`) | Every 5 min | Cheap incremental — pulls only the most-recently-added items per library, so new content appears in guides within minutes without a full resync. |
| **Library Scan** (`library-scan`) | Daily 04:00 | Re-reads each source's library list (same as a manual **Rescan**), picking up added/removed sections while preserving your enable/disable choices. |

You can also trigger a full sync on demand: the source detail page's **Sync metadata** button runs the `metadata-sync` job and shows live progress (`jobs.run` + `jobs.list` polling).

## On- and off-network connections

The Airwave server always talks to Plex over the LAN `baseUrl` — it runs next to Plex, so that path is fast and always used **for the server's own fetches**. The other URLs exist only so a **client** (a TV app) that's away from home can still reach the media server:

| Field | Meaning |
|---|---|
| `baseUrl` | LAN / local URL — the server uses this for everything. |
| `remoteUrl` | The Plex remote/WAN connection (a `plex.direct` HTTPS URL). Requires Plex **Remote Access** to be enabled on the server. |
| `relayUrl` | Plex Relay — the last-resort fallback, bandwidth-limited (~2 Mbps). |

`remoteUrl` and `relayUrl` come from Plex's `/resources` listing (`pickConnectionUrls` prefers the HTTPS `plex.direct` forms, so an HTTPS client stays mixed-content-safe). Because a home's WAN IP drifts, the **`plex-connection-refresh`** job re-resolves them **hourly** (`resolveConnectionUrls`, matched by `machineIdentifier`) and updates the row — so the remote URL a TV gets is never stale.

How a client uses them:

- **`GET /api/v1/connections`** (`apps/server/src/rest.ts`) returns `{ local, remote, relay }` for the default enabled Plex source. **No token is included** — the token is added only at playback-resolve time.
- The TV app **probes local → remote → relay** at launch and picks the first reachable one.
- It then passes its pick as `GET /api/v1/media?...&network=remote|relay`. The playback broker (`resolveMedia`, `packages/api/src/services/playback/broker.ts`) stamps that connection's base onto the returned stream URL, while the server's own metadata fetch still goes over `baseUrl`. `network` values other than `remote`/`relay` mean local (the default).

## Managing / removing a source

The source detail page also holds a **Danger zone**. Removing a source (`sources.remove` → `prisma.mediaSource.delete`) is a **cascade delete**: because `Channel`, `MediaItem`, and `MediaLibrary` all reference `MediaSource` with `onDelete: Cascade`, deleting the source also deletes **every channel built from it, all their schedules, and all cached metadata**. There is no undo.

To make that impossible to do by accident, the UI gates it behind a **type-`DELETE`-to-confirm** modal — the destructive button only arms once you type `DELETE`.

Lower-risk management on the same page: rename the source's label (`sources.updateLabel`), toggle libraries, rescan, and sync metadata. Separately, **Import Plex Users** (`plex.importUsers`) bulk-creates Viewer accounts from the people the Plex server is shared with — covered in [Users & access control](users-and-access.md).

## How it works (brief)

- **The owner token is encrypted at rest.** `packages/api/src/services/plex/token.ts` encrypts on the single write site (`saveConnection`) and decrypts at every boundary that makes a Plex call (`withDecryptedToken` / `decryptToken`). The stored shape is `ivB64:tagB64:ctB64` (AES-GCM); decryption is tolerant of legacy plaintext, and a one-time boot backfill (`encryptExistingSourceTokens`) encrypts any rows still stored plaintext. The encryption key derives from `BETTER_AUTH_SECRET` — **rotating that secret makes existing tokens undecryptable**, and the fix is to reconnect the source (the code throws a clear error saying exactly that).
- **Clients never see the bare token.** The server bakes it into `X-Plex-Token=…` on the URLs it hands out, so this is a server-only secret.
- **Plex.tv vs the server.** The sign-in/discovery calls go to `plex.tv/api/v2` (pins, user, `/resources`, shared users). Once connected, library/metadata/playback calls go directly to the server's `baseUrl` (`/library/sections`, `/library/sections/{key}/all`, `/library/metadata/{ratingKey}`, `/video/:/transcode/universal/...`).

## Source map

| Path | Responsibility |
|---|---|
| `packages/api/src/routers/plex.ts` | Sign-in-with-Plex flow: `createAuthPin`, `checkAuthPin`, `listServers`, `saveConnection`, `importUsers`. |
| `packages/api/src/routers/sources.ts` | Manage saved sources: `list`, `get`, `updateLabel`, `rescan`, `setLibraryEnabled`, `remove`. |
| `packages/api/src/services/plex/client.ts` | The Plex API client — pins, `getServers`, `getLibraries`, connection-URL resolution, metadata/playback queries. |
| `packages/api/src/services/plex/sync-libraries.ts` | Upsert `MediaLibrary` rows, preserving each library's enabled flag. |
| `packages/api/src/services/plex/token.ts` | Encrypt/decrypt the owner token at rest; boot backfill. |
| `packages/api/src/services/plex/import-users.ts` | Bulk-import shared Plex users as Viewer accounts (email-matched, idempotent). |
| `packages/api/src/services/jobs/definitions.ts` | The sync jobs: `metadata-sync`, `recently-added-scan`, `library-scan`, `plex-connection-refresh`. |
| `packages/api/src/services/playback/broker.ts` | Picks local/remote/relay base for a client's stream (`resolveMedia`). |
| `apps/server/src/rest.ts` | Viewer-facing REST: `GET /api/v1/connections`, `GET /api/v1/media?network=`. |
| `apps/web/src/routes/_auth/sources/` | Admin UI — list (`index.tsx`), connect (`new.tsx`), manage/danger-zone (`$sourceId.tsx`). |
| `packages/db/prisma/schema/media-source.prisma` | `MediaSource`, `MediaLibrary`, `MediaItem` models. |

---

See also: [Getting started](getting-started.md) · [Users & access control](users-and-access.md) · [Background jobs](jobs.md)
