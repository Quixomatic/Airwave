# Channels

How to build and configure a channel in Airwave — the candidate pool, its ordering, optional
grouping/rotation strategies, and how it all becomes a continuous, always-on timeline.

> New here? Start at [Getting started](getting-started.md), then come back. Channels live inside
> [packages](packages.md) and draw their media from a connected [source](sources.md). If you'd rather
> not build channels by hand, the [AI assistant](ai-assistant.md) can author a whole lineup for you —
> everything below is what it's writing under the hood.

## Overview

A **channel** is two things wired together:

1. **A candidate pool** — the set of movies and/or episodes it's allowed to play, produced by a
   *definition*. Today that definition is a **predicate** (a filter): "90s comedies", "everything
   Studio Ghibli", "unwatched sci-fi episodes". Airwave resolves the filter against your media
   server and gets back a concrete list of items.
2. **An ordering** — how that pool is laid out: shuffled, or sorted by a field you choose. An
   optional **strategy** layers grouping and rotation on top (marathons, round-robins).

From those two inputs Airwave *materializes* a **schedule**: a back-to-back, gapless timeline of
program slots (plus any bumper breaks) stretching days into the future. The build is **deterministic
and seed-driven** — the same pool + ordering + seed always produce the same lineup, so every viewer
tuning in sees the same thing at the same wall-clock moment, and a rebuild reproduces it exactly.

Every channel is bound to exactly one media source (`mediaSourceId`) and can only be created once
that source is **connected and synced** — there's no media to filter or schedule against otherwise.
The create call enforces this (`packages/api/src/routers/channels.ts` `create`): it rejects a source
that isn't connected, or that has zero synced `mediaItems`, with a message telling you which step is
missing.

Admin UI: **Channels → New** (`apps/web/src/routes/_auth/channels/new.tsx`) to create, **Channels →
\<channel\>** (`$channelId.tsx`) to edit, preview, and schedule. Both render the same
`ChannelForm` (`apps/web/src/features/channels/channel-form.tsx`), split into collapsible sections:
**Details**, **Options**, **Content & filter**, and **Advanced — grouping & rotation**.

## Defining what plays — the filter builder

The **Content & filter** section decides the pool. First pick the content types with the **Movies**
and **TV Shows** checkboxes (at least one is required); then build a predicate in the filter builder
(`apps/web/src/features/channels/filter-builder.tsx`).

### Conditions

A condition is `field · operator · value`. The available fields, their kinds, and which operators
each kind allows come from the server catalog
(`packages/api/src/services/plex/filter-fields.ts`, exposed via `channels.filterFields`). Field kinds
and their operators (`OPS_FOR_KIND`):

| Kind | Operators | Notes |
|---|---|---|
| `tag` | is / is not | Value picked from a dropdown of real library values (genre, studio, network, actor, collection, content rating, resolution, …) |
| `text` | contains / does not contain | Title, episode title — substring match |
| `int` | is / ≥ / ≤ | Year, decade, ratings, duration (minutes), play count, … |
| `date` | ≥ / ≤ | Release / air date, last watched — a date picker |
| `recency` | is | "Added within N days" |
| `bool` | is | true/false — unwatched, in progress, HDR, Dolby Vision, … |

For a **tag** field the value box becomes a dropdown populated live from your libraries — the
`channels.filterValues` endpoint unions the distinct tag titles across the enabled libraries of the
selected content types. Tag values are matched **by title**, then resolved to the per-library key at
query time (each library keys its tags differently), so you pick "Comedy" and Airwave finds the right
key in each library.

### AND / OR and nesting

The builder is a **recursive predicate tree**. Each group combines its children with **all (AND)** or
**any (OR)**; a group can hold conditions *and* nested sub-groups, so you can express
`Genre is Comedy AND (Year ≥ 1990 OR Studio is HBO)`. The resolver
(`packages/api/src/services/plex/resolve.ts`) evaluates this with **set algebra**: it runs each leaf
as a simple Plex query and combines results in code — **intersect** for AND, **union** for OR. That's
why arbitrary nesting works even though the media server only understands simple operators. An
all-conditions AND group is optimized into a single query (the fast path).

> **UI nesting cap.** The resolver handles *any* depth, but the builder only offers the **Add group**
> button at the root (`filter-builder.tsx`), so through the UI you get one level of sub-groups. That's
> enough for the vast majority of channels; deeper trees are only reachable via import or the API.

### Movies vs TV — where a field applies

Movies resolve at the movie level; **TV resolves at the episode level**. Airwave uses the media
server's dotted advanced-filter syntax so a single query mixes both levels: `show.genre`,
`episode.resolution`, and so on (`filter-fields.ts` `tvScope`, applied in `buildParam`). The practical
consequences:

- **Genre lives on the *show*, not the episode.** `genre` resolves as `show.genre`; there is no such
  thing as an episode genre. Filtering TV by genre filters by the parent series' genre.
- Some fields are **episode-level**: resolution, audio/subtitle language, release/air date, added-within,
  HDR/DoVi, unwatched/in-progress. On TV these describe the individual episode.
- A field can be scoped to one library type (`appliesTo`). "Network" is show-only; "Duration (min)"
  is movie-only; "Episode title" / "Episode year" are TV-only. A field that doesn't apply to a given
  library type is simply skipped for it.

### Other definition kinds

The data model reserves other ways to define a pool — `PLEX_COLLECTION`, `PLEX_PLAYLIST`, and
`MANUAL_ITEMS` (explicit include/exclude of specific items) — see `ChannelDefinitionKind` in
`packages/db/prisma/schema/channel.prisma`. **The current admin builder and resolver implement the
`PREDICATE` (filter) path only**; collection/playlist/manual definitions are scaffolding for later and
aren't yet selectable in the UI. (Note: the *strategy* "Filtered set" scope described below is a
grouping concept, not a Plex collection.)

### Previewing the pool

On the channel page, the **Preview** card shows what the filter currently resolves to — shows with
their episode counts coalesced up, movies passed through (`channels.preview` →
`resolveChannel`). Use **Refresh preview** after editing the filter to re-resolve against the server.

## Ordering

The **Options** section sets the base order of the pool. Two user-facing choices:

- **Shuffle** — the pool is shuffled. The shuffle is a **seeded, deterministic** Fisher–Yates over a
  stable base order (ratingKey-sorted, so it never depends on the server's return order), and it
  **reshuffles per pass** so a looping channel doesn't repeat the same sequence every lap
  (`timeline.ts` `seededShuffle` / `passOrder`).
- **Sorted by…** — pick a **sort field** and **direction**. The pool is ordered by that field and the
  scheduler preserves it exactly. Sort fields come from `sort-fields.ts` (`channels.sortFields`):
  Title, Year, Release / air date, Critic/Audience/Personal rating, Content rating, Duration, Plays,
  Date added, Date viewed, Resolution, Bitrate.

Internally these map to the `ordering` enum: Shuffle → `SHUFFLE`, Sorted → `IN_ORDER` (with
`sortField`/`sortDir`). A legacy `BY_AIR_DATE` value still exists in the enum but isn't offered as a
distinct option in the current UI. For a sorted TV channel remember the level rule: `releaseDate`
sorts episodes by *their* air date; a sorted movie channel sorts by the movie's own field.

## Strategies — grouping & rotation

By default a channel just plays its pool in the base order above. The **Advanced — grouping &
rotation** section (`strategy-editor.tsx`) turns on a **strategy**: an optional layer that buckets the
pool into groups and decides how those groups interleave. It's a bolt-on — off means byte-for-byte the
old behavior; the base ordering still governs the order *within* each group and how groups are sorted.

Turn on **Group & rotate this channel's content** to reveal:

**Rotation** — how groups are woven together:

- **Marathon each group** (`clustered`) — play a group's whole run, then the next group. Great for
  "one series at a time" blocks.
- **Rotate between groups** (`round_robin`) — take a *run* from one group, then move to another, never
  the same group back-to-back. This is the "channel-surfing variety" mode. A sub-option, **Order**,
  picks **Varied** (`shuffle` — reshuffle the group order each lap) or **Fixed cycle** (`cycle` —
  rotate the same pattern).

**Grouping rules** — one or more rules that decide *what a group is*. Each rule has a **scope**, a
**run**, and an optional **filter**. Rules are tried top-down and **the first matching rule wins**, so
put a narrow carve-out above a catch-all.

- **Scope:**
  - **Each show** — one group per series.
  - **Movies** — all movies collapse into one group.
  - **Filtered set** — the items this rule's filter matches become **one** group (a marathon
    carve-out, e.g. "the Star Wars films as a block").
- **Run** — how much of a group plays per turn:
  - **One at a time** (`1`)
  - **Block of…** — a fixed count or a seeded `[min, max]` range of episodes (e.g. 2–3)
  - **~ Minutes** — a seeded `{minutes: [min, max]}` window; the engine packs items toward that
    duration **without overshooting the ceiling**, so short-episode shows self-adjust (a 22-min show
    in a 24–30 window is one episode; 7-min shorts pack in until they fill it). Length-aware, no
    per-show tuning needed.
  - **Whole run** (`all`) — the whole group in one turn (a marathon that then drops out).
- **Filter** (the funnel icon) — narrow which pool items the rule claims, using the *same* filter
  builder. Unlike the content filter, a grouping filter is evaluated **locally** against cached pool
  metadata (no server round-trip), so it's restricted to fields Airwave caches
  (`local-filter.ts` `LOCAL_FILTER_FIELDS` — title, genre, director, actor, year, rating,
  resolution, HDR, release date, …). Time-relative fields are deliberately excluded to keep the build
  deterministic.

**Don't repeat a show** — an optional cross-pass constraint (`noRepeatWithin`): keep the same group
off the air for **N minutes** or **N shows**. The engine runs a starvation scheduler that prefers the
longest-un-aired eligible group, and *relaxes* rather than stalling if a tiny pool can't satisfy the
window — every item is still laid exactly once.

### How it works (briefly)

Each schedule pass is still a **full permutation of the pool** (every item exactly once), so a
strategy is a pure function of `(pool, ordering, seed, passIndex)` and slots into the same
deterministic build with no special state — except the no-repeat constraint, which carries a small
"recently aired" tail across pass boundaries so the window holds at a build seam
(`timeline.ts` `strategyPassOrder` / `constrainedPassOrder`). A malformed or empty strategy safely
falls back to plain ordering (`parseStrategy`), so bad config never bricks a channel.

Strategy changes only take effect the **next time the schedule is built** — use **Generate schedule**
(below) to apply them immediately. Deeper internals of the deterministic timeline are their own
subject (a dedicated scheduling doc is planned; see [`docs/README.md`](README.md)).

## Channel identity

The **Details** and **Options** sections carry the channel's identity (`channel.prisma` `Channel`):

- **Name** — display name (e.g. "90s Comedies"). Required.
- **Number** — the guide channel number. **Unique** across the instance; leave blank on create and
  Airwave assigns the next free number (`max(number) + 1`).
- **Callsign** — a short memorable code, uppercased and capped at 6 chars (e.g. `90SCOM`). Normalized
  on save; optional.
- **Description** — optional blurb for what the channel is.
- **Package** — the [package](packages.md) this channel belongs to (optional). A channel with no icon
  or tint of its own **inherits the package's**.
- **Appearance — icon & tint** — a Lucide/Phosphor icon plus an **accent tint** from a fixed palette
  (`services/accents.ts` `ACCENT_KEYS` — purple, blue, teal, green, amber, orange, red, rose, …). The
  tint is stored as a stable key and each client maps it to its own hues; an unknown key degrades to
  neutral. Leave both empty to inherit the package's look.
- **Active** (the header toggle) — the `enabled` flag. **Inactive channels aren't selectable in the
  guide** and are skipped by the schedule jobs.
- **Bumpers** — a thin per-channel mode (Inherit / Off / Interstitial only / Full). The actual break
  content is configured globally under **Bumpers**; a channel only chooses whether and which to show.

## The schedule

A channel's filter/ordering is only the *recipe*; the **schedule** is the materialized timeline the
guide and players actually read — rows in `ScheduleItem`, each a program (or bumper) with a start
time and duration.

**On create**, Airwave builds a **windowed initial schedule** inline (`channels.create` →
`generateChannelSchedule` with `windowSeconds = INITIAL_WINDOW_SECONDS`, ~12h) so the channel is
watchable immediately instead of waiting for a job — but capped, so a huge pool doesn't lay a 300-day
pass up front. A build capped mid-pass records a **resume cursor** so later extensions continue from
that exact item rather than replaying the top of the pool. If the inline build fails, the channel is
simply left for the backfill job to pick up.

**Generate schedule** (on the channel page → Schedule card, `channels.generateSchedule`) does a **full
rebuild** from *now*: at least one complete pass of the pool (every item scheduled), looping whole
passes — each reshuffled for a Shuffle channel — until it covers a ~7-day floor. This **replaces** the
timeline, so use it after you change the filter, ordering, or strategy. **Extend**
(`channels.extendSchedule`) is the non-disruptive counterpart: it appends a fresh block at the tail and
leaves what's on now untouched.

**Growing and healing** the schedule over time is handled by background jobs — see
[Background jobs](jobs.md):

| Job | Cadence | Role |
|---|---|---|
| **Schedule Backfill** (`schedule-backfill`) | every 10 min | Builds the *initial* schedule for enabled channels that have none (in batches). Picks up freshly created/auto-generated channels. |
| **Schedule Refresh** (`schedule-refresh`) | hourly | For each enabled channel, appends at the tail *only when the timeline is running low* (`extendChannelSchedule`, ~2-day threshold). Continues mid-pass from the stored cursor. |
| **Bumper Sync** (`schedule-bumper-sync`) | every 10 min | Reconciles a schedule with the current bumper settings when the channel's mode/rev falls behind. Also kicked immediately when you save a channel's bumper mode. |

Because the build is deterministic and seed-driven, all of these reproduce a consistent lineup: a
rebuild, an extension, and a repair all lay the same items in the same order for a given seed.

## Tips & gotchas

- **Curate over bare genre sweeps.** A single `Genre is Comedy` can pull in thousands of loosely
  related items. Tighter, intentional filters (a decade, a studio, a network, a hand-picked set of
  shows) make a channel that feels *authored* rather than a firehose — and resolve faster. This is
  exactly how the [AI assistant](ai-assistant.md) builds lineups: many narrow channels, not a few
  giant ones.
- **Genre is on the show, not the episode.** Filtering TV by genre matches the *series'* genre;
  episodes carry no genre of their own. Use episode-level fields (resolution, air date, unwatched)
  when you mean the individual episode.
- **The grouping filter is one level in the UI.** The content filter and each grouping rule's filter
  both cap at one level of sub-groups in the builder (the resolver itself has no depth limit).
- **A strategy needs a rebuild to show.** Editing the strategy doesn't retro-actively rewrite the live
  timeline — hit **Generate schedule** to apply it now, or wait for the next full rebuild.
- **Shuffle ignores the sort field.** Sort field/direction only matter for a **Sorted** channel; a
  Shuffle channel derives its order from the seed.
- **Tag values are matched by title.** If a filter dropdown is empty, the source may not be synced, or
  no library of the selected content types carries that tag.

## Source map

| Concern | File |
|---|---|
| Channel form (all sections) | `apps/web/src/features/channels/channel-form.tsx` |
| Filter builder (conditions, AND/OR, nesting) | `apps/web/src/features/channels/filter-builder.tsx` |
| Strategy editor (grouping & rotation) | `apps/web/src/features/channels/strategy-editor.tsx` |
| Preview tiles | `apps/web/src/features/channels/channel-preview.tsx` |
| Routes (new / edit) | `apps/web/src/routes/_auth/channels/{new,$channelId}.tsx` |
| API router (create/update/get/list, preview, generate/extend, filterFields/filterValues) | `packages/api/src/routers/channels.ts` |
| Filter field catalog + Plex param building | `packages/api/src/services/plex/filter-fields.ts` |
| Filter resolution (set-algebra AND/OR, dotted TV syntax) | `packages/api/src/services/plex/resolve.ts` |
| Ordering / sort fields | `packages/api/src/services/plex/sort-fields.ts` |
| Strategy engine (grouping, rotation, no-repeat) | `packages/api/src/services/schedule/timeline.ts` |
| Local grouping-filter eval | `packages/api/src/services/schedule/local-filter.ts` |
| Schedule build / extend / repair | `packages/api/src/services/schedule/generate.ts` |
| Accent tint palette | `packages/api/src/services/accents.ts` |
| Data model (Channel, ChannelDefinition, kinds) | `packages/db/prisma/schema/channel.prisma` |
| Background jobs | [`docs/jobs.md`](jobs.md) |

---

See also: [Getting started](getting-started.md) · [Packages](packages.md) · [Sources](sources.md) ·
[Background jobs](jobs.md) · [AI assistant](ai-assistant.md)
