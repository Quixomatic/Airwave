# Airwave documentation

Guides and "how it works" docs for [Airwave](../README.md) — for self-hosters using it and contributors
digging into the internals. For install, start at the root [README](../README.md).

## Start here

- **[Getting started](getting-started.md)** — zero to watching: connect a source, build a channel, add viewers, tune in.

## Using Airwave

| Doc | What it covers |
|---|---|
| [Media sources (Plex)](sources.md) | Connecting a Plex server, libraries, metadata sync, and on/off-network connections |
| [Channels](channels.md) | Building a channel from a filter, ordering, grouping/rotation strategies, and its schedule |
| [Packages](packages.md) | Grouping channels — for organization, the guide's filter lenses, and per-user access |
| [Users & access control](users-and-access.md) | Importing users from Plex and granular per-user access |
| [AI assistant](ai-assistant.md) | The optional bring-your-own-key chat that helps build channels |
| [Sessions (Now Playing)](sessions.md) | The admin "who's watching + how it's delivered" view |
| [Import / Export](import-export.md) | Moving a lineup (packages + channels + filters) between instances |

## How it works

| Doc | What it covers |
|---|---|
| [Background jobs](jobs.md) | The in-process `node-schedule` job system (Overseerr's pattern) + the job catalog |
| [Durable workflows](workflows.md) | How the AI lineup builder and the importer run on the Workflow SDK |
| [Device capability diagnostic](capability-diagnostic.md) | Measuring what a real device can decode instead of cataloging device profiles |

## Planned

Still to come:

- **The apps** — `tv-web` (browser · webOS · Tizen), `tv-native` (iPad · Apple TV · Android TV · Fire TV), the admin web app, and the backend server — each with its tech stack
- **Scheduling engine** — the deterministic, materialized-from-a-seed timeline; windowed builds + the resume cursor
- **Playback model** — the `effectiveTime` / DVR clock; tuning in at the live offset
- **Bumpers & ambient music** — between-program interstitials and the optional music bed
- **Self-hosting** — the single image / roles, the Docker deploy, and publishing the apps to their stores

Screenshots live in [`screenshots/`](screenshots/); brand assets (wordmark, splash) in
[`../apps/tv-native/assets/brand/`](../apps/tv-native/assets/brand/).
