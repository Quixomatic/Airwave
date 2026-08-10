# Getting started

> Zero to watching: connect a Plex library, build a channel, and tune in from a TV app — the through-line that ties the rest of the docs together.

This guide assumes you already have an Airwave **server running** and can reach the admin panel. From there it walks the setup in order and links the deeper doc for each subsystem as you go.

The whole path, at a glance:

1. **Connect a media source** — sign in with Plex, pick a server, enable libraries, sync metadata.
2. **Create a channel** — a metadata filter over that source, ordered onto a continuous timeline.
3. **Group into packages** *(optional)* — named bundles of channels for the guide and for sharing.
4. **Add viewers** — import from Plex, grant each person access.
5. **Watch** — open a TV app, point it at the server, sign in, tune in.

Steps 1 and 2 are required to get anything on screen; 3–5 build out sharing and playback. Everything is driven from the admin left-nav (**Sources, Channels, Packages, Users, Settings**), which only admins can reach.

## Prerequisites

- **A running Airwave server + an admin login.** If you haven't deployed yet, follow the [Self-hosting (Docker)](../README.md#self-hosting-docker) section of the README. The first admin is seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in your `.env` on first boot; sign in with those at your `WEB_PUBLIC_URL`.
- **A Plex server** whose library you want to turn into channels — reachable from the Airwave server (same LAN is simplest). Plex is the only media server supported today; Jellyfin/Emby are on the roadmap.

Accounts are **admin-provisioned, never self-serve** — signing in only ever matches an existing account, so the seeded admin is your way in. See [Users & access control](users-and-access.md) for the full auth model.

## 1. Connect your media source

A channel is built by resolving a filter against a **connected, synced** media source, so this comes first. Nothing downstream works until a source is connected and a metadata sync has run.

1. In the admin, go to **Sources → Add a Plex server** and click **Sign in with Plex**. A Plex popup opens; authorize it and Airwave reads back the servers on your account (yours and any shared with you).
2. **Pick your server** from the dropdown, then confirm its connection details — hostname/IP, port (default `32400`), and SSL. Airwave pre-fills a local connection when it can; you can also set an optional Web App URL. Save the connection.
3. On the source page, **enable the libraries** you want channels built from (toggle each Movies / TV Shows library on). Only enabled libraries are considered when a channel resolves. If a library is missing, hit **Rescan** to re-read the server's sections.
4. Click **Sync metadata**. This kicks off the background **Metadata Sync** job — it pages every movie and episode into Airwave's local cache and links episodes to their shows. Progress shows inline on the page; a large library takes a few minutes. You can keep working, but hold off on step 2 until it finishes.

> **Why the sync matters:** channel creation is gated on source readiness. The server refuses to create a channel if its source isn't connected *or* has zero synced media items ("Run a metadata sync on this source before creating channels…"). After the first full sync, a **Recently Added Scan** runs every few minutes and a full **Metadata Sync** runs nightly, so new content flows in automatically — see [Background jobs](jobs.md).

More detail — reconnecting, multiple sources, the danger-zone delete: **[Sources →](sources.md)**

## 2. Create your first channel

A channel is defined by **what it plays** (a metadata filter), **how it's ordered**, and **how it looks**. Airwave resolves the definition into a pool and lays it onto a continuous, deterministic timeline.

1. Go to **Channels → New channel**.
2. Pick the **media source** and the media types (movies, shows, or both).
3. Build a **filter** — genre, year, network, cast, content rating, resolution, "added in the last N days," and so on. The form shows a **live preview** of what resolves (a count plus sample titles) so you can tell whether the pool is what you expect before saving.
4. Choose an **ordering** (shuffle, in-order, by air date) and, optionally, a **strategy** — group by show and rotate across shows, size blocks by episode count or by duration, carve out a subset, enforce "no repeat within an hour," etc.
5. Give it a name, number, callsign, icon/tint, and **Create channel**.

On save, Airwave builds an initial ~12-hour **windowed schedule inline**, so the channel is watchable within seconds — even for a huge pool. The **Schedule Refresh** job then grows the timeline from the stored cursor as time moves forward, and **Schedule Backfill** picks up any channel that didn't get its initial build. You don't manage any of that by hand.

Full filter grammar, ordering, and strategies: **[Channels →](channels.md)**

## 3. Group channels into packages (optional)

Packages are named groups of channels — "Kids," "Movies," "Late Night." They organize the guide and, more importantly, are the unit that **per-user access** grants against (grant a whole package and new channels added to it later flow to those users automatically).

- Go to **Packages → New package**, give it a name/icon/tint, and assign channels to it (a channel's package is set on the channel).
- Channels don't have to belong to a package; **ungrouped** channels work fine but can only be shared with restricted users one at a time.

You can skip this entirely if you just want a flat list of channels. Details: **[Packages →](packages.md)**

## 4. Add viewers

Everyone who watches needs an account. The admin panel is admin-only; viewers only ever use the TV apps.

1. Go to **Users → Import Plex Users**. Airwave pulls in everyone your Plex server is already shared with, creating a Viewer account per person (matched by email). It's idempotent — re-running never duplicates, and it never stores a Plex token or logs anyone in; it just makes the account exist so "Sign in with Plex" can match it later.
2. New users start with **all access** (they see the whole lineup). To restrict someone, open their profile → **Access** and grant either everything, a whole package (FULL — future channels included), or specific channels (PARTIAL).

Access is enforced **server-side** on every viewer REST read and on the playback gate — hiding a channel in the UI isn't what protects it. The full model (the three access levels, how future content flows, enforcement): **[Users & access control →](users-and-access.md)**

## 5. Watch

With a channel built and a viewer account ready, open a client and tune in.

1. **Open a TV app.** Pick your platform from the [availability table](../README.md#platform-availability) in the README — Apple TV, iPad, Android TV, Fire TV, and LG webOS have native apps; **any browser** works via the `tvweb` Docker role (an auth-gated web player). The admin's built-in browser player at `/watch/:channel` is handy for a quick check without leaving the panel.
2. **Point it at your server.** The native apps scan your LAN for the server automatically; if that doesn't find it, enter your `SERVER_PUBLIC_URL` manually.
3. **Sign in** — "Sign in with Plex," or the email/password of any Airwave account. TV clients use a device-code flow (scan a QR / enter a short code).
4. **Tune in.** Open the guide, pick a channel, and you join whatever's on now, mid-program, at the correct offset. Scrub back within the live buffer (DVR-style); you can't skip ahead. Channel up/down and channel-surf without leaving what's playing.

On first launch each device runs a short **capability diagnostic** that measures exactly what it can decode, so Airwave direct-plays natively where possible and only transcodes when it must. You can watch who's tuned in, and how each stream is being delivered, from **Settings → Sessions** in the admin.

Off-network playback resolves the right connection to your Plex server automatically (local → remote → relay), so the same app works at home and on the road — as long as your Plex server is set up for remote access.

## Common first-run gotchas

A few things that trip people up on the way from zero to watching:

- **"Connect a Plex server first" / can't create a channel.** Channel creation is gated on source readiness. Make sure the source shows a connection *and* that a **Metadata Sync** has actually finished — a connected source with zero synced items is still refused.
- **No libraries listed on the source page.** Hit **Rescan** to re-read the server's sections, then enable the ones you want. Only *enabled* libraries feed channels.
- **A brand-new channel looks empty for a moment.** The inline build lays a ~12-hour window; the guide fills in as **Schedule Refresh** (hourly) and **Schedule Backfill** (every 10 min) grow the timeline. If a channel never gets a schedule, check **Settings → Jobs**.
- **TV app can't find the server.** LAN auto-discovery can miss across VLANs or on some networks — enter `SERVER_PUBLIC_URL` by hand. Remember it must **not** be `localhost`; it has to be an address the TV can reach.
- **A viewer sees nothing.** A user with all-access off and no grants sees an empty guide by design. Grant them a package or specific channels from **Users → their profile → Access**.
- **Playback fails only off-network.** Off-network streaming depends on your **Plex** server being set up for remote access (Plex Remote Access or a reachable domain/port) — Airwave can only relay to a connection Plex actually exposes.

## Optional next steps

- **Skip the hand-building — auto-generate a lineup.** From the **Channels** page, run **Auto-Generate Lineup**: Airwave evaluates a catalog of presets against your library and creates the channels it can fill. A one-click way to go from an empty install to dozens of channels.
- **Let AI draft channels.** Off by default and bring-your-own-key. Add an AI connection in **Settings → AI Assistant**, then use the assistant to author channels from a prompt, or run the durable multi-agent **Build Lineup with AI** workflow (also needs `WORKFLOW_ENABLED=1`). Nothing is sent anywhere until you configure a provider. See **[AI assistant →](ai-assistant.md)** and [Durable workflows](workflows.md).
- **Add bumpers.** Optional between-program "Up Next" interstitials with cover art, plus an optional ambient **music bed** you can point at a folder of tracks. Configure globally and per channel in **Bumpers**.
- **Move a lineup between instances.** Export your packages + channels + filters and import them into another Airwave, with dry-run and de-duplication. See **[Import / Export →](import-export.md)**.
- **Peek under the hood.** The [Background jobs](jobs.md) catalog explains every scheduled task (metadata sync, schedule refresh/backfill, connection refresh, session reaping, and more) and how to run or reschedule them from **Settings → Jobs**.
