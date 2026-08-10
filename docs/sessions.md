# Sessions (Now Playing)

> An in-house, admin-only "Now Playing" for Airwave: who's watching right now, what's on their screen, how far behind live they are, and exactly how each stream is being delivered — plus a rolling log of recent tunes. Airwave tracks all of this itself; it never reports sessions or watch-state back to Plex.

## Overview

The **Settings → Sessions** page (`apps/web/src/routes/_auth/settings/sessions.tsx`) is Airwave's answer to Plex's *Now Playing* dashboard. It has two parts:

- **Active sessions** — live tiles for every viewer currently watching, refreshed every 5 seconds.
- **Recent sessions & play logs** — the last N tune attempts across all devices, each with its full delivery diagnostics.

Two design facts frame everything below:

- **Airwave keeps its own sessions.** Unlike a normal Plex client, Airwave deliberately does *not* call Plex's `/:/timeline` or otherwise report playback back to the Plex Media Server. Session state lives in Airwave's own database. The rationale is documented alongside the code (`packages/api/src/services/playback/sessions.ts` header) and repeated in the tRPC router comment (`packages/api/src/routers/playback.ts`). A consequence: your Plex server's Activity dashboard will *not* show Airwave viewers — this page is the only place they appear.
- **Admin-only.** Both data sources are `adminProcedure` queries (`playback.sessions`, `playback.recentLogs` in `packages/api/src/routers/playback.ts`). The parallel REST endpoint (`GET /sessions` in `apps/server/src/rest.ts`) hard-checks `user.role === "admin"` and returns 403 otherwise. Viewers cannot see who else is watching.

## Active sessions

The tile grid is driven by `trpc.playback.sessions`, which polls every 5 seconds (`refetchInterval: 5000` in `sessions.tsx`) — the same cadence as the guide's own session chip. The server side is `listActiveSessions` in `packages/api/src/services/playback/sessions.ts`.

**What counts as "active".** A session is a `WatchSession` row whose `lastHeartbeatAt` is within the last **30 seconds** (`SESSION_ACTIVE_MS = 30_000`). There is at most **one row per user** (`userId` is `@unique`) — switching channels updates the same row rather than creating a new one. Sessions are ordered by `startedAt` ascending.

Each active row is then enriched, Plex-style, by three per-row lookups (cheap, because only a handful of sessions are ever live at once):

**1. Where they are on the timeline → program + progress.** The viewer's timeline position is `positionAt` if the client reported an exact instant, otherwise it's derived from how far behind live they are (`now − delaySeconds`). The service then finds the current `PROGRAM` schedule slot — the latest `ScheduleItem` of `kind: "PROGRAM"` that starts at or before that position — and confirms the position still falls within that slot's duration (`inSlot`). From the slot's `mediaItem.guide` bundle it pulls the structured episode metadata (show title, season, episode, year, poster). Program progress (`positionSeconds` / `durationSeconds`) is computed only when the viewer is `inSlot` **and** `state === "program"` — so it's null during bumper breaks or when off the air.

**2. How it's being delivered → the latest matching play log.** The service looks up the most recent `PlaybackLog` for this `(userId, channelId, ratingKey)` and reads the delivery detail off it: the Plex `decision` JSON (`videoDecision`/`audioDecision`/`videoCodec`/`audioCodec`/`container`), the `connection` (local/remote/relay), `mode`, `outcome`, decoded dimensions, and source codecs. This is why the delivery badges reflect the *actual* stream, not a guess.

**3. Which device → `TvDevice`.** If that play log carries a `deviceId`, it's joined to the `TvDevice` row for the device `model` and `platform`.

**What each tile shows** (`SessionTile` in `sessions.tsx`). Tiles use a CSS **subgrid** so their five sections (media, progress, device, streams, viewer) line up row-for-row across neighboring tiles:

- **Media header** — a portrait **poster** (the show's poster for episodes via `guide.showRatingKey`, else the movie's own — never the landscape episode still), and the title. Title prefers the current program's structured guide title and falls back to the session's `title` snapshot. Below it, `Sn · En` and the episode title. During a bumper break the header instead reads **"On a break."**
- **Channel** — `Ch <number> · <name>` and the callsign when present.
- **Progress band** — a filled progress bar plus `position / duration` and a live indicator: **● LIVE** (red) when `delaySeconds < 5`, otherwise `<n>s/<n>m behind`.
- **Device + Connection** — the device model/platform (or "Unknown"), and a color-coded connection badge (see [Delivery & connection](#delivery--connection-explained)).
- **Streams** — a **Video** badge and an **Audio** badge, each showing Direct Play (emerald) vs Transcode (amber) with the codec, plus a **Subtitles** row. Note: the subtitles row is currently a static **"None"** in the UI (`sessions.tsx`) — subtitle-per-stream detail isn't wired into the tile yet.
- **Watching** — the viewer's name (or email).

## Recent sessions & play logs

The lower panel lists the most recent tunes across *all* users and devices, newest first. It's driven by `trpc.playback.recentLogs` (default 30; the page requests **40**; hard-capped at 100), backed by `listRecentPlaybackLogs` in `packages/api/src/services/playback/log.ts`.

Each row is one `PlaybackLog` — a single tune attempt with full diagnostics. The service batch-resolves each item's portrait poster key (show poster for episodes, else the item's own) from the `MediaItem` table so rows show a real poster rather than a landscape still.

**What each row shows** (`LogRow` in `sessions.tsx`):

- Poster, the item **title**, and the channel name — with the decoded resolution appended (`<width>×<height>`) when the panel reported it.
- A row of badges: an **outcome** badge — **Playing** (emerald), **No frames** (`not_decoding`, amber), or **Error** (red) — then the **Video** and **Audio** Direct-Play/Transcode badges, then the **connection** badge.
- The error string, if the tune errored.
- The viewer's name and a relative timestamp (`5m ago`).

This log is the review trail for "did channel X actually play on device Y?" — the whole reason `PlaybackLog` exists (see the model's schema comment). `outcome: "not_decoding"` with `decodedWidth: 0` is the classic "stream negotiated but the panel never decoded a frame" case.

## How sessions are tracked

**Heartbeat → `WatchSession`.** While a viewer is watching, the client heartbeats roughly every 10 seconds. Admin preview goes through `trpc.playback.heartbeat`; TV clients POST `/sessions/heartbeat` (`apps/server/src/rest.ts`). Both call `heartbeatSession` (`sessions.ts`), which **upserts the one row per user** — recording channel, state (`program`/`bumper`/`off`), the current `ratingKey`/`title`, `delaySeconds`, exact `positionAt`, and the Plex `transcodeSession` id — and stamps `lastHeartbeatAt = now`. The same call also maintains a per-channel `ChannelWatchState` history row (skipped when `state === "off"`), which is what powers the guide's "Recents" list and cross-device resume — separate from the single live `WatchSession`.

When a viewer stops cleanly, the client calls `trpc.playback.endSession` / `POST /sessions/end` → `endWatchSession`, which best-effort stops the row's Plex transcode (`stopTranscode`) and deletes the row.

**`PlaybackLog` per tune.** Independently of heartbeats, the client records one `PlaybackLog` when a tune settles or errors — admin preview via `trpc` internals, TV clients via `POST /playback/log` → `logPlayback` (`log.ts`). Each log captures what was asked of Plex (`mode`, source container/codecs, the `decision` JSON, advertised `caps`), which `connection` the stream resolved to, and how it actually went on the panel (`outcome`, decoded dimensions, `readyState`, `error`).

**The reaper (stale-session cleanup).** A closed browser tab or a killed TV app never sends `/sessions/end`, so its row would linger. The **Watch Session Reaper** job (`watch-session-reap`, `packages/api/src/services/jobs/definitions.ts`) runs **every 2 minutes** (`0 */2 * * * *`): it finds `WatchSession` rows whose `lastHeartbeatAt` is older than **60 seconds**, stops any Plex transcode each left running, then deletes them — so zombie transcode sessions don't pile up on the Plex server. Full job reference: [docs/jobs.md](./jobs.md) ("Watch Session Reaper").

Note the two thresholds differ by design: the reaper deletes rows after **60s** of silence, but the *Active sessions* view only shows rows heartbeated within **30s** (`SESSION_ACTIVE_MS`). So a session that just went quiet drops off the dashboard before the reaper actually removes its row.

## Delivery & connection explained

Every tune records two independent decisions on its `PlaybackLog`, both surfaced as badges.

**Direct Play vs Transcode** — recorded *per stream* in the `decision` JSON (`videoDecision` / `audioDecision`). Plex returns `"copy"` (the codec is muxed through untouched — **Direct Play**, emerald) or `"transcode"` (Plex re-encodes it because the client can't handle the source — amber). Video and audio are decided separately, so it's normal to see e.g. Direct Play video + Transcode audio. The `StreamBadge` component treats anything that isn't `"transcode"` as Direct Play, and shows the codec alongside.

**Connection: local / remote / relay** — recorded in `PlaybackLog.connection`, the Plex connection path the server resolved the stream to based on the client's probe/override:

- **local** (emerald) — same-network direct connection to the Plex server; best case.
- **remote** (sky) — the server's public/remote connection, reached over the internet.
- **relay** (amber) — Plex's relay, a bandwidth-limited fallback when neither local nor remote is reachable directly.

Both badges render **"Unknown"** (muted) when the underlying value is missing — e.g. an active session with no matching play log yet.

## Source map

| Concern | File |
| --- | --- |
| Active-session enrichment (`listActiveSessions`, `heartbeatSession`, `endWatchSession`, `SESSION_ACTIVE_MS`) | `packages/api/src/services/playback/sessions.ts` |
| Recent play logs (`listRecentPlaybackLogs`, `logPlayback`) | `packages/api/src/services/playback/log.ts` |
| tRPC admin queries (`playback.sessions`, `playback.recentLogs`, `heartbeat`, `endSession`) | `packages/api/src/routers/playback.ts` |
| REST endpoints for TV clients (`/sessions/heartbeat`, `/sessions/end`, `/sessions`, `/playback/log`) | `apps/server/src/rest.ts` |
| Admin UI — Now-Playing tiles + recent-logs list | `apps/web/src/routes/_auth/settings/sessions.tsx` |
| `WatchSession` + `ChannelWatchState` models | `packages/db/prisma/schema/user-state.prisma` |
| `PlaybackLog` model | `packages/db/prisma/schema/playback-log.prisma` |
| `TvDevice` model | `packages/db/prisma/schema/tv-device.prisma` |
| Stale-session reaper job (`watch-session-reap`) | `packages/api/src/services/jobs/definitions.ts` · [docs/jobs.md](./jobs.md) |
