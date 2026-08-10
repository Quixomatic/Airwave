# Airwave documentation

Architecture and "how it works" docs for [Airwave](../README.md) — the internals, for contributors and
curious self-hosters. For install and usage, start at the root [README](../README.md).

## How it works

| Doc | What it covers |
|---|---|
| [Background jobs](jobs.md) | The in-process `node-schedule` job system (Overseerr's pattern) + the full job catalog |
| [Durable workflows](workflows.md) | How the AI lineup builder and the lineup importer run on the Workflow SDK |
| [Import / Export](import-export.md) | Moving a lineup (packages + channels + filters) between Airwave instances |
| [Users & access control](users-and-access.md) | Importing users from Plex and granular per-user access |

## Planned

More subsystem docs are on the way — the code and the changelog are the source of truth until they land:

- **Scheduling engine** — the deterministic, materialized-from-a-seed timeline; windowed builds + the resume cursor
- **Channel strategies** — grouping + rotation layered over a channel's base ordering
- **Channel definitions & filters** — the Plex-parity filter builder and how it resolves to a pool
- **Playback model** — the `effectiveTime` / DVR clock; tuning in at the live offset
- **Capability diagnostic & delivery** — per-device decode measurement and native-first playback
- **Bumpers & ambient music** — between-program interstitials and the optional music bed
- **Self-hosting** — the single image / roles, the Docker deploy, and remote playback (local → remote → relay)

Screenshots live in [`docs/screenshots/`](screenshots/); brand assets (wordmark, splash) in
[`apps/tv-native/assets/brand/`](../apps/tv-native/assets/brand/).
