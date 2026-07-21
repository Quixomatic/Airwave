# Changelog

All notable changes to ChannelGuide are documented here.

## [0.6.9] - 2026-07-21

### Changed

- **Admin: the workflow pages match everything else now.** Settings → Workflows, the AI-lineup runs list, and the per-run detail page all moved from Cards to Frames. The workflows list and the runs list are proper divide-y row lists (like channels/packages/sources) instead of bordered cards nested inside a card. A run's status is a **coloured badge** (green completed, blue running, red failed, muted cancelled).

## [0.6.8] - 2026-07-21

### Changed

- **Admin: the settings pages are on Frames now too.** General, AI Assistant, Jobs & Cache, and About all moved from Cards to the coss Frame treatment (title + description header over a raised panel), matching the rest of the admin. (The Jobs schedule-editor is still a Card — it's a modal, not a page section.)
- **Jobs page polish.**
  - Each job carries an **Auto** (sky) or **Manual** (amber) badge, with an icon.
  - The schedule details are **badges** now instead of a text line — outline pills for the cron cadence and next run, and a **green “Last ran …”** badge.
  - **Manual jobs no longer show a cron / “next run”** (they never auto-fire) — just the last run.
  - The **Edit** button comes **before** Run, and for a manual job it's shown **disabled** (with a tooltip) rather than hidden, so the row layout stays consistent.
  - More gap between a job's action buttons.

## [0.6.7] - 2026-07-21

### Changed

- **Admin: sources, users, bumpers, and the channel/package lists are on Frames now.** Following the channel/package forms, these pages moved from Cards to the coss **Frame** treatment — a title + description header over a raised panel. The **channels** and **packages** lists keep their good bits (tinted icon tiles, numbers, callsigns, Auto/Inactive/package badges). Redundant back-links dropped (breadcrumb covers them).
- **Toggles are Switches now, consistently.** The source **Libraries** enable, the channel-list **Active** toggle, the bumpers **Enable** master switch, and the new-source **Use SSL** are all the `Switch` component instead of native checkboxes. The new-source **Server** picker is the base-lyra `Select` too.
- **Users page: admin/user role badges got some life** — an amber shield for **Admin**, a muted user outline for everyone else, instead of a plain grey pill.

## [0.6.6] - 2026-07-21

### Changed

- **Admin: page content width is now consistent, set once in the layout.** Every page used to hand-roll `mx-auto max-w-*` and they'd drifted (2xl / 3xl / 4xl / 5xl / 6xl). The layout now centers content at a single **`max-w-6xl`** by default, and pages no longer set their own width — so channels, packages, sources, settings, bumpers, users and the dashboard all match. A page that genuinely needs full width opts out with `staticData: { fullBleed: true }` (the mechanism the guide grid already uses).
- **Admin: the package create/edit form gets the Frame treatment** to match the channel form — a Frame with a title + description header and a raised FramePanel, replacing the plain Card. The package's channel-list panel is a Frame too, and the redundant "← Packages" back-link is gone (the breadcrumb covers it).

## [0.6.5] - 2026-07-21

### Changed

- **Admin: the channel page is rebuilt on coss's Frame components — much cleaner.** The Edit/New channel form is now a **Frame** (muted container) with a proper **FrameTitle + FrameDescription** header and no redundant wrapping Card. Its sections are **collapsible** (base-ui Collapsible): each toggle is a standard inline-width ghost button with a **section icon**, the title, and a chevron just to its right; the section's content lives in its own raised **FramePanel**. Independent open state (several open at once). The **Preview** and **Schedule** blocks became Frames too, each with a title + description and its action in the header — **Refresh preview** in Preview's header, Extend/Generate in Schedule's (Watch stays in the top header).
- **Frame styling tuned once, for all frames.** The `Frame` component now defaults to `p-2` with a uniform gap between header and panels (instead of stock `p-1`), so every frame gets the same breathing room. Fixed two rough edges on the collapsible triggers: an **open** section no longer keeps a faint background (the ghost button's `aria-expanded:bg-muted` is cancelled), and the triggers are inset to line up with the header/panel content above and below them.

### Added

- **`Frame`, `Field`, `Form` components** added to `@ChannelGuide/ui` from the `@coss` (base-lyra) registry; `Collapsible` was already present. Base-ui underneath, matching the rest of the kit.

## [0.6.4] - 2026-07-21

### Changed

- **Admin: the channel page's chrome is tidied up.**
  - The **preview** moved to its own card (it's the resolved output of the filter, not a form field).
  - **Active** moved out of the form body into the sub-header's right side — it's a channel-status toggle, not a field. (Portaled from the form, still wired to the same state.)
  - **Watch** and **Refresh preview** moved up into the **top** header (left of the AI Assistant button).
  - **Save** is now a normal outline button like Watch/Refresh (no primary-blue emphasis); **Delete** is a plain ghost button (the red was heavier than warranted — it confirms first anyway).
  - The redundant **"← Channels"** back-link above the form is gone; the breadcrumb already covers it.

## [0.6.3] - 2026-07-21

### Changed

- **Admin: the channel form's section headings are larger and sit on a subtle background.** Each collapsible heading is now `text-base` semibold on a muted `bg-muted/50` bar (hover-darkened), so the sections read as distinct blocks instead of thin divider lines.

## [0.6.2] - 2026-07-21

### Changed

- **Admin: the channel form is now grouped into collapsible sections, with content + filter last.** Instead of one long scroll, the fields are split into three **independent** collapsibles (several can be open at once; it's not an accordion): **Details** (name / callsign / number / description / active), **Options** (package, ordering + sort, bumpers, appearance), and **Content & filter** — the Movies/TV type checkboxes joined with the predicate builder. Content & filter is deliberately last: the two jointly define what plays, and the resolved preview tiles render right below the form, so it reads top-to-bottom.

## [0.6.1] - 2026-07-21

### Added

- **Admin: channel identity in the sub-header on the channel page.** The channel detail page's sub-header (left) now shows **tinted icon tile · callsign · CH NN**, dot-separated and sized to match the breadcrumb tile above it — so which channel you're editing is clear at a glance. The tile inherits the package's icon/tint when the channel has none of its own (the `channels.get` payload now carries `packageIcon`/`packageTint` for that).

## [0.6.0] - 2026-07-21

Opens the 0.6.x line.

### Changed

- **Admin: the filter builder is on the design-system `Select` too.** Following v0.5.57, the nested predicate builder still had five native `<select>`s — the group combinator (all/any), and per condition the field, operator, boolean value, and tag value. All are now the base-lyra `Select`, so the whole channel form is consistent. The tag-value picker being a popup is also a real improvement — a native `<select>` of hundreds of genre/studio values was unwieldy.
- **The filter-builder selects now match the input height.** They were `size="sm"` (28px) sitting next to `h-8` (32px) value inputs in the same row, which looked off; they're default height now, so selects and inputs line up.

## [0.5.57] - 2026-07-21

### Changed

- **Admin: the channel create/edit form now uses the design-system components throughout, and the top row lines up.** An audit turned up several raw HTML controls: the Name/Callsign/Number row is fixed so the three inputs align on one baseline (explicit side-column widths + `items-end` instead of `auto` columns with hardcoded widths); the **Active** checkbox is now a **Switch**; the Movies / TV Shows checkboxes use the `Checkbox` component; and the five native `<select>`s (Ordering, Package, Sort by, Direction, Bumpers) are now the base-lyra `Select`. Shared by both the New and Edit channel pages.

### Added

- **`Switch` component** added to `@ChannelGuide/ui` from the `@coss` (base-lyra) registry — base-ui underneath, matching the existing checkbox.

## [0.5.56] - 2026-07-21

### Changed

- **Admin: "New package" and "Add source" moved to the top header too.** Same treatment as v0.5.55 — both now sit in the top-right header slot, left of the AI Assistant button, in the `outline` style. Packages' "Refresh styling" stays in the sub-header; the Sources page's heading no longer needs its inline button row.

## [0.5.55] - 2026-07-21

### Changed

- **Admin: the Channels page's "New channel" button moved to the top header.** It now sits in the top-right header slot, just left of the AI Assistant button, instead of in the sub-header, and uses the same `outline` style as Auto-generate (no longer the primary blue). "Auto-generate" stays in the sub-header.

## [0.5.54] - 2026-07-21

### Changed

- **Admin: the AI Assistant header button now shows its label.** It was an icon-only Sparkles button (with just an `aria-label`); it's now a full button — Sparkles + "AI Assistant" — so the entry point to the assistant panel is obvious rather than a bare icon.

## [0.5.53] - 2026-07-21

### Added

- **Dev: React Grab in the admin frontend.** `grab init` wired **react-grab** into `apps/web` — a dev tool for selecting page context to hand to a coding agent. It's a **DEV-only dynamic import** in `main.tsx` (`if (import.meta.env.DEV) import("react-grab")`), so it never ships in the production bundle. Added as a devDependency via pnpm (init was run with `--skip-install` to keep the workspace lockfile clean).

## [0.5.52] - 2026-07-21

### Changed

- **Admin: connection roles are now a clear dropdown per use, not toggle buttons on every card.** Settings → AI Assistant used to put up to three role buttons on each connection card, which was genuinely confusing — three buttons × N cards, each toggling a role. There's now a single **"How connections are used"** section with one dropdown each for **Chat**, **AI lineup — planner**, and **AI lineup — worker**; you just pick the connection for each job. Planner and worker offer a **"Same as chat"** option (they fall back to the chat connection when unassigned); chat is required. The connection cards keep their role **badges** so you can still see at a glance what each one is used for.

## [0.5.51] - 2026-07-21

### Changed

- **Admin: the AI lineup observability moved under Settings.** It was a standalone top-level section at `/workflows/ai-lineup`; it now lives at **Settings → Workflows**, matching Jobs & Cache. A new **Workflows** tab lists the durable workflows (just the AI lineup builder today), `/settings/workflows/ai-lineup` is its runs list, and `/settings/workflows/ai-lineup/:runId` is the per-run detail. The "Build Lineup with AI" job's link and all internal navigation were repointed. No behaviour change — same pages, better home.

## [0.5.50] - 2026-07-20

### Changed

- **TV: an unfocused channel's number is now muted.** Every row's number rendered at full brightness, so nothing distinguished the highlighted channel. The number is now bright only on the focused row and muted (`mutedFg`) on the rest, so the current channel stands out down the rail.

## [0.5.49] - 2026-07-20

### Changed

- **TV: the favorite indicator on the guide rail icon is bigger and loses its dark disc.** The small corner heart that marks a favorited (unfocused) channel now sits directly on the tinted circle — no backing disc — and is roughly doubled in size, with a soft drop-shadow so it stays legible where it overlaps the circle's edge.

## [0.5.48] - 2026-07-20

### Added

- **TV: a "Show All" button at the top of the guide sidebar's filter list when a filter is applied.** Clearing a filter previously meant scrolling the whole package list back to the currently-lit lens and selecting it again to toggle it off. Now, whenever a lens other than "all" is active, a **Show All** circle appears first in the filter group — above Favorites and Recents — so one press clears back to every channel. It's hidden when nothing is filtered (the Guide action already covers that, and a permanent "Show All" over an unfiltered grid is just noise). Safe to add and remove on the fly: the item list only changes while focus is in the grid — selecting a lens returns focus there, and re-entering the sidebar resets selection to the top — so the index shift never lands mid-navigation.

### Changed

- **TV: the guide channel rail's tinted icon now matches the featured panel's tile, and absorbs the favorite affordance.** The rail's little accent circle was too small to read — it's now the **exact** size, tint, and accent-ring treatment as the featured now-playing tile (same `vw(64 × FEATURE_SCALE)` dimensions and `1px` accent border, expressed the same way so the two stay locked together). It also became the single favorite control: the separate heart button beside it is gone. Focus the rail and the circle gains the blue focus ring and its glyph turns into a **heart** — filled red if the channel is favorited, a white outline if not — and OK toggles it. A favorited channel that *isn't* focused shows a small red heart badge tucked into the circle's bottom-right, so favorites are still spottable while scanning. The channel number is top-aligned so it stays put regardless of the circle's height.

### Notes

- _(TV client — first `apps/tv-web` source change since v0.5.2; needs a rebuild + `ares-install` to the C2.)_

## [0.5.47] - 2026-07-20

### Fixed

- **A run's entire build spend showed as “unpriced”.** The cost table keys on undated model ids (`claude-haiku-4-5`), but a connection stores whatever the provider's API expects — which for Anthropic is usually the dated variant, `claude-haiku-4-5-20251001`. Exact-match lookup missed it, so 8 calls and 352k input tokens sat outside the total. Rates now resolve by **longest prefix**, so dated ids price correctly while a genuinely unknown model (say `gpt-5`) still reports `unpriced` rather than being guessed at. Verified against the last run: builds price at **$0.257**, which with the Opus plan puts it at **~$0.61** — against the **$0.16** the old build-only estimate claimed.

## [0.5.46] - 2026-07-20

### Fixed

- **Channels were being built twice, and both copies paid full price.** On a 5-channel run, three channels ran their entire agent loop a second time — about a third of all build spend, wasted. The event log showed **16 `step_started` against 12 `step_created` and zero `step_retrying`**: nothing had failed, so these were never retries. The cause is documented behaviour — the workflow body **replays whenever a step completes**, and the SDK is **at-least-once**. When the first build finished at 9.2s the body replayed, and the four builds still in flight were dispatched again. Pre-assigned channel numbers (v0.5.42) don't help: both copies agree on the number, they just both do the work.
- **The guard now RESERVES instead of checking.** It previously looked for an existing channel at the top of the step and created it at the bottom — so every duplicate passed the check while the original was still mid-loop. The builder now creates the channel row as its **first** action, `enabled: false`, which is an atomic claim because `Channel.number` is `@unique`. A duplicate finds the row (or loses the insert race) and returns in milliseconds. Commit writes the verified filter over the planner's proposal and enables the channel, so nothing reaches the guide or `schedule-backfill` until its filter has actually been checked; `give_up`, a throw, or exhausting the step cap releases the reservation.
- **Previous AI packages are no longer offered for reuse.** `createPackages` wipes every `aiGenerated` package *before* resolving reuse, so offering one guaranteed the lookup would miss and fall back to creating a new package. The first run with reuse enabled "reused" 15 of 15 packages — but 7 targeted the previous run's own AI packages and were silently recreated, reproducing exactly the duplicate-package sprawl reuse exists to prevent. Only preset and hand-made packages are offered now.

### Notes

- Root-caused by reading the SDK's `/foundations/` docs: replay re-runs the body from the top with completed steps served from the event log, in-flight steps are undocumented in that path, and idempotency is explicitly the caller's responsibility. Also worth knowing: **runs are pinned to the deployment that started them**, so rebuilding mid-run doesn't affect an in-flight run and recovering a broken one means cancel-and-restart.
- A duplicate now costs one indexed read. It's still worth watching `step_started` vs `step_created` on a big run.

## [0.5.45] - 2026-07-20

### Fixed

- **The run detail page never rendered — `/workflows/ai-lineup/:runId` kept showing the runs list.** Adding `ai-lineup.$runId.tsx` beside `ai-lineup.tsx` silently promoted `ai-lineup.tsx` into a **layout** route for it, and a layout only renders its child through an `<Outlet />`. It had none — it rendered the list — so the URL matched, the child route existed in the generated tree, and nothing appeared. No error, in the router or the typecheck.
- Restructured to the convention the rest of the app already uses (`channels/`, `packages/`, `sources/`): a directory with **`route.tsx`** (layout holding the `<Outlet />` and the section breadcrumb), **`index.tsx`** (the list), and **`$runId.tsx`** (the detail). The breadcrumb moved to the layout so it isn't repeated per child.

## [0.5.44] - 2026-07-20

### Added

- **A dedicated page per run — `/workflows/ai-lineup/:runId`.** Clicking a run now opens it properly instead of expanding a cramped panel in the list. It shows **the full plan** (every package, channel and filter — including the ones a build cap meant were never constructed, which used to be discarded unread), **every channel build** as an expandable row with the model's own reasoning, its brief and proposed filter, its **tool calls** — what it previewed, what came back, how it revised — and its outcome, plus the SDK's step timeline with durations and retries.
- **The cost panel here is the honest one.** Grouped by model *and* phase, counting retries and the planner call. The list page's old figure was build-steps-only priced at worker rates, which is how a run whose planner ran twice on Opus reported **$0.16**. A model with no known price shows as `unpriced` and is excluded from the total rather than being silently guessed at — an obvious gap beats a confidently wrong number, which is the mistake being corrected.
- Builds are **expandable rows, not tabs**, so two channels' reasoning can be read side by side — comparing them is how a prompt problem becomes obvious.

### Changed

- The runs list is now a pure index: status, step counts, duration, and a link. All detail moved to the run page.

### Notes

- Runs from before v0.5.43 have no trace rows and will say so rather than rendering empty panels.
- **`TS2589: Type instantiation is excessively deep`** — `Prisma.JsonValue` is a deeply recursive union, and inferring it through tRPC tips the *client* compiler over. Fixed properly at the source: `listRunTraces` returns an explicit DTO with the three JSON columns widened to `unknown`, which keeps the inferred router type shallow. Worth remembering for any future procedure returning a Prisma row with `Json` fields.

## [0.5.43] - 2026-07-20

### Added

- **Every AI lineup run now records what the model actually did** — new `AiLineupTrace` table. The Workflow SDK already stores each step's input and output, so this deliberately isn't a copy of that; it captures the two things WDK structurally *cannot* see. First, **the inside of a step**: a channel build is one step wrapping a whole `generateText` tool loop, so its previews, filter revisions and reasoning were invisible from outside and lived only in the server's stdout. Second, **the plan itself** — only channels that got *built* left a row anywhere, so the last capped run designed 33 channels and threw 28 of them away unread. Plan quality can now be judged for the price of a single call instead of a full build.
- **Honest cost accounting.** The run report only ever summed usage from per-channel builds that succeeded, which understated a run three ways: the planner call (on a pricier model) wasn't counted at all, **retries were free**, and everything was priced at worker rates. That's how a run showed **$0.16** when the planner alone — which ran twice — was several times that. A trace row is written **per attempt** and carries its own model, so `summarizeRunUsage` can group by model and phase and the real figure falls out.

### Fixed

- **A failing plan step is now legible.** `AI_NoObjectGeneratedError: response did not match schema` is emitted for two completely different problems, and we couldn't tell them apart — the only evidence was a CBOR blob in the SDK's event log that had to be decoded by hand. The error carries the raw `text` and a `finishReason`: truncation ends mid-token with `finishReason: "length"`, a genuine schema violation is well-formed JSON in the wrong shape. Both are now logged, along with a trace row. Each retry is a full call on the planner model, so paying twice and *still* not knowing why was the worst case.
- **`maxOutputTokens` is pinned at 32k for the plan call.** It was unset, so the cap was whatever the provider defaulted to. The last successful plan emitted **10,393 output tokens** for 26 channels and the field catalog invites bigger ones, which makes silent truncation a live risk — and truncation is one of the two candidate causes of the retry above.

### Changed

- **Package reuse is now stated as mandatory, not encouraged.** First run with it offered reused 4 of 13 packages but still produced "Kids Corner" beside the existing "Kids & Family" and "Blockbuster Movies" beside "Action & Sci-Fi". The prompt now requires walking the existing list before inventing anything, names those exact cases as failures, and says a near-synonym *is* a duplicate.

### Notes

- _(Schema change — requires `pnpm db:push` + `pnpm db:generate`; backend needs a restart, then `pnpm workflow:build`.)_
- Trace writes are best-effort and never throw into a run: losing a row is a nuisance, failing a completed channel build because we couldn't log it is not.
- Tool *results* are summarized (match count + a short sample), not stored whole — one `preview_filter` result can be tens of thousands of tokens.

## [0.5.42] - 2026-07-20

### Added

- **The planner can now file channels into packages that already exist.** It previously minted every package from scratch — it had never been shown that any others existed — so a run could produce a "Family Fun" alongside your existing "Kids & Family", which is worse for the viewer than one good package. It's now given the current package list with each one's **provenance** (`preset` / `manual` / `ai`) and channel count, and can set `existingKey` on a planned package to file its channels into that one instead. Reuse is the default when a reasonable home exists; a new package is for a genuinely new idea. It's told to prefer `preset` and `manual` packages, since those are your own organisation, whereas an `ai` package is from a previous run and about to be replaced anyway.
- **Every package gets its own hundred-block at 1000+, existing or not.** A package whose channels live at 1–999 — a preset or hand-made one — gets a fresh block carved out for its AI channels, so those stay contiguous in the guide even though the package's originals sit elsewhere. A package that already owns a 1000+ block keeps it and fills the gaps. Blocks are allocated by scanning what's actually free, and a package with more channels than a block holds spills into the next free one rather than colliding.
- **`scripts/sim-lineup-numbering.ts`** — exercises the allocator against the real database (read-only; it only reads channel numbers) and checks the properties that matter: no collision with existing channels, no duplicates within the run, nothing below 1000, one distinct block per package.

### Changed

- **Numbering moved out of the plan step into its own durable step, after the wipe.** It used to be derived at plan time from the package's index, which no longer works: a reused package's block depends on live database state, and reading that *before* `clearAiGenerated` would allocate against numbers about to be freed. Keeping it a durable step preserves the property the original plan-time assignment existed for — a resumed run replays the identical numbering instead of re-deriving it against a database that has since moved.
- `planLineup` now returns a `LineupPlanDraft` (no numbers); `assignChannelNumbers` turns it into a `LineupPlan`.

### Notes

- No schema change. Package reuse is resolved **after** the wipe, so a planner that picked a previous run's `ai` package falls back to creating a new one rather than pointing at a deleted row.
- Verified: typecheck uncached, `workflow build` clean (25 steps), numbering harness green against the live library.

## [0.5.41] - 2026-07-20

### Fixed

- **`main` didn't build — unescaped backticks in the planner prompt, shipped in v0.5.39.** The line about `targetPoolSize` used plain backticks inside a template literal, which closes and reopens the string; Bun rejects it with `Expected ";" but found "targetPoolSize"`. Since `lineup-plan.ts` is inlined into the workflow bundle, `workflow build` could not have succeeded — meaning **v0.5.39's three prompt fixes were never actually exercised by a run**, and neither was v0.5.40. This is the second time this exact bug has shipped (v0.5.36 was the first).
- **A green `pnpm check-types` hid it.** The v0.5.40 run reported "4 successful, 4 total" with "1 cached" — the server task came from turbo's cache and never re-parsed the changed file. The task count was honest; the cache made it meaningless. **Treat a cached typecheck as no typecheck when the point is to validate an edit.**

### Added

- **The planner now gets the full field catalog, not just the tag vocabulary.** These were conflated, and only tag fields have listable values — so `audienceRating`, `criticRating`, `duration`, `decade`, `addedWithin`, `unwatched`, `hdr` and `userRating` were invisible to it, leaving the AI route with a *narrower* filter vocabulary than the static generator it's meant to beat (which builds its most distinctive channels out of exactly those axes). The catalog is static, costs a few hundred tokens, and rides in the same cached prefix that every fan-out shares, so it's paid once per run. Library-hygiene fields (`trash`, `duplicate`, `unmatched`, `location`, `editionTitle`) are deliberately left out as noise, and the heavy tag fields (`actor`, `director`, `writer`, `producer`) are named but still **not** preloaded — they run to thousands of values, which is why the vocabulary was trimmed in the first place.
- **Numeric spreads in the library profile.** A threshold is meaningless without knowing where the library's mass sits: `audienceRating gte 7` is either a tight prestige channel or a third of the library. The profile now carries p10/p25/median/p75/p90 for audience score, critic score, and **movie** runtime, plus HDR and 4K counts split by movies and episodes. This is what makes a *score window* ("7.0–8.0") an expressible idea rather than a guess that resolves to 4 items or 4,000. Runtime is movies-only because `duration` is declared `appliesTo: ["movie"]`, so pooling episode lengths would describe a population the field can't filter.
- **A deterministic sanitize pass over the planner's filters, before the build fans out.** A wider catalog means more ways to be wrong, and the likeliest mistake is a type-restricted field on a channel carrying both media types — `duration` is movies-only, `network` is shows-only, and channels now default to `["movie","show"]`. Unknown fields, operators that don't belong to a field's kind, and type-mismatched conditions are dropped and logged. A group emptied by sanitizing is dropped with it, since an empty AND/OR resolves to *everything* — the opposite of what the removed condition intended. The worker would eventually catch a bad filter via preview, but only after spending agent steps, and a silently-ignored condition can resolve to a plausible pool nobody questions.

### Changed

- The prompt now teaches the numeric axes: prefer a **window** to a bare floor, treat runtime as programming intent (quick-bite / matinee / event), and respect the catalog's type restrictions.

### Notes

- No schema change. Run `pnpm workflow:build` before the next lineup run (verified building — 21 steps, 4 workflows).

## [0.5.40] - 2026-07-20

### Fixed

- **The planner was being told not to write filters — in the same prompt that requires them.** A leftover line from the original design read *"Do NOT write Plex filter syntax. Describe the intent in `theme` — a later agent builds and verifies the actual filter."* That stopped being true in v0.5.29, when the planner took over authoring filters so workers could verify rather than explore, but the instruction was never removed. Forty lines later the same prompt says *"BUILDING THE FILTER — this is what the whole job is judged on"*, and the schema makes `filter` required. Faced with both, the cheapest way to satisfy the prohibition *and* the schema is to emit the thinnest filter that validates and put the real thinking in `theme` — which is exactly the lazy, mechanical filters we've been getting. It now says plainly that a channel needs both, and what each is for.
- **"Build from the FILTER VOCABULARY only" was silently banning most of the filter engine.** The vocabulary is built from eight *tag* fields (genre, studio, network, contentRating, collection, country, resolution, label), because those are the ones with value lists worth caching. But the instruction read as a restriction on **fields**, not values — so the planner never proposed `audienceRating`, `criticRating`, `duration`, `decade`, `addedWithin`, `unwatched`, `hdr` or `userRating`, none of which have tag values to be listed in the first place. The result was a planner working from a *smaller* filter vocabulary than the static preset generator it's meant to improve on: the generator builds its most distinctive channels out of score windows and duration bands, and the AI route couldn't express either. The rule now constrains tag *values* and says so explicitly.

### Changed

- **`collection` is demoted to a last resort.** It was advertised alongside `studio` as one of the "sharpest fields available", but this library's collections were assembled years ago and haven't been maintained — a collection that reads perfectly for a channel is likely missing most of what belongs in it. The prompt now says so outright and steers toward studio, title sets, and the numeric fields instead.

### Notes

- Prompt-only; no schema or API change. The planner is bundled into the workflow handlers, so **`pnpm workflow:build`** before the next run (`pnpm dev` rebuilds when stale).
- This is the first of three: the full field catalog + rating/duration distributions land next, then existing-package reuse.

## [0.5.39] - 2026-07-20

### Fixed

- **The builder gave up on channels it had already worked out how to fix.** On a 26-channel run it skipped 4, and in two cases its own explanation contained the correct filter — for "Star Wars Galaxy" it wrote *"the correct approach requires adding a title constraint: (Lucasfilm Ltd. OR Lucasfilm Animation) AND (title contains 'Star Wars') — this yields 177 items"* and then abandoned the channel instead of trying it. The prompt framed the planner's filter as a proposal to **accept or reject**; it now frames it as a **starting point to refine**, and states outright that diagnosing a problem isn't finishing the job: if you can describe a better filter you must build and preview it, and `give_up` is only for a library that genuinely can't support the channel.
- **It distrusted hand-applied labels.** It refused an anime channel because your `Anime` label "includes many Western animated series" — but those labels were applied **by hand by the library's owner**, which makes them the most authoritative signal available, not a mistake to correct. Both prompts now say to trust user-curated `label` values absolutely.
- **It judged channels by title count instead of runtime.** It skipped a classic-sitcom channel for matching "only 3 shows" — those three carry 635 episodes between them, which is weeks of programming. Both prompts now judge pools by runtime and treat `targetPoolSize` as a loose hint (overshooting is fine); `MIN_POOL_SIZE` drops 5 → 3, since the pool is counted in items and a handful of long-running shows is a strength.

### Added

- **Per-step breakdown on the AI Lineup page.** Opening a run now lists every step — name, status, retry attempts, duration — so the fan-out is visible while it happens, alongside each skipped/failed channel with the model's full reasoning for that outcome. The cost figure is now labelled as build-steps-only, since the planning call runs on a different model and isn't part of the per-channel totals.

## [0.5.38] - 2026-07-20

### Changed

- **"Build Lineup with AI" now builds the whole planned lineup by default.** The 5-channel cap existed while a per-channel build cost ~215k input tokens; once the planner started authoring filters (so workers verify rather than explore) that fell to ~43k over ~4 steps, putting a full lineup around a dollar instead of twenty. Set `AI_LINEUP_BUILD_LIMIT` to a small number to go back to sampling while iterating on prompts. Note the binding constraint is now wall-clock rather than tokens: each channel resolves its filter against Plex (~35s for a large one) twice — once to verify, once to build its schedule.
- **Jobs can carry a `detailHref`,** rendered as a "View runs & cost" link. Jobs that only *dispatch* long-running work finish instantly and their real output lives elsewhere, so the Jobs row was a dead end; the AI build now links straight to `/workflows/ai-lineup`.

## [0.5.37] - 2026-07-20

### Fixed

- **The channel page blocked on `channels.preview` despite the preview being "lazy".** tRPC's `httpBatchLink` collapses concurrent queries into one request, and a batch resolves as a unit — so the preview (which resolves the whole filter against Plex) was landing in the same batch as `get` / `nowNext` / `schedule` and holding up first paint. Firing it independently in React Query didn't help: the transport re-coupled them. The v0.5.18 note that "the preview query runs async so it never blocks the page" was wrong — only the poster *images* were lazy, never the data.
- Added a `splitLink` so a query can opt out of batching with `trpc: { context: { skipBatch: true } }`, and applied it to `channels.preview`. The page's fast queries now return on their own schedule while the preview loads alongside them. Use the same escape hatch for any procedure that can be slow and isn't needed for first paint.

## [0.5.36] - 2026-07-20

### Fixed

- A comment inside the raw-SQL template literal used backticks, which closed the template string and produced `TS1005: ',' expected`. The previous commit shipped with the web package failing to typecheck — I misread turbo's "2 successful, 4 total" as a pass.

## [0.5.35] - 2026-07-20

### Fixed

- **The AI Lineup runs list returned 500.** The query counted `workflow_steps.id`, but that table is keyed by `(run_id, step_id)` and has no `id` column at all. Counts `step_id` now. The failure was confined to the observability page — in-flight runs were completely unaffected, since the workflow engine reads those tables itself.

## [0.5.34] - 2026-07-20

### Fixed

- **The "Build Lineup with AI" job ran uncapped.** It dispatched a run with no build limit, so a single click on a library this size would have designed a full lineup and then built *every* channel — each one an agent loop costing ~215k input tokens. It now builds **5 channels by default**, overridable with `AI_LINEUP_BUILD_LIMIT` (0 removes the cap). The planner still designs the complete lineup either way, so you see everything it would build and only pay to construct a sample; the run report and the AI Lineup page show planned-versus-built.

## [0.5.33] - 2026-07-20

### Changed

- **The planner always designs the FULL lineup; a testing cap now limits only the build fan-out.** The interesting artifact is the plan — it's one call, and it's where the curation happens — while the per-channel builds are what actually cost money. So a capped run now shows you the entire lineup it would build and only pays to construct a sample of it. The sample is taken **round-robin across packages** rather than off the top of the list, so it spans different kinds of channel instead of exercising one package's worth of the easiest cases. The run report carries `channelsPlanned` alongside `channelsCreated`, and the observability page shows both so a capped run doesn't read as a shortfall.
- **`pnpm dev` no longer rebuilds the workflow handlers every time.** It compares mtimes across `workflows/` and `packages/api/src` (both are inlined into the bundle) and rebuilds only when something actually changed. The unconditional ~13s build was delaying server startup enough that the admin frontend's first fetch timed out.
- **The observability UI is no longer started by `pnpm dev`.** It's a separate long-lived process and doesn't belong coupled to the server. Both it and the handler build are now proper turbo tasks: **`pnpm workflow:ui`** and **`pnpm workflow:build`**.

## [0.5.32] - 2026-07-20

### Changed

- **The planner is no longer told how many channels to build.** It was being handed `Propose exactly 50 channels across 8 packages` — a number with no relationship to the library, derived by arithmetic. A quota is the wrong instruction for the actual goal: too high and the model pads with near-duplicates, too low and whole sections of the library are left with nowhere to live. It now sizes the lineup to what's actually there, with the brief being **coverage**: could someone find a decent home for the vast majority of this server by browsing the lineup? It's told to walk the profile — genres, studios, decades, biggest shows — and make sure each meaningful block is served; to build several distinct channels where there's real depth (a genre with 300 titles, a show with 500 episodes) rather than one catch-all; and not to pad, since two channels resolving to nearly the same pool should be one channel.
- `--limit` is now explicitly a **testing** control (generate exactly N as a representative sample, keeping trial runs cheap) rather than a truncation of a fixed-size plan.

### Notes

- **This makes a full run potentially much more expensive.** Per-channel build cost is still ~215k input tokens and ~10 agent steps — unchanged and unsolved — so a lineup that sizes itself to a large library scales that linearly. Until the worker loop is fixed, use `--limit` (or the testing cap) rather than an uncapped run.

## [0.5.31] - 2026-07-20

### Fixed

- **Every AI-generated `OR` group was silently being treated as `AND`.** A filter group combines with **`combinator`**, but the two schemas added for the lineup workflow emitted **`op`** instead. The resolver switches on `node.combinator` and falls through to intersect when it's missing, so nothing errored — `Blockbuster Night`'s `(genre = Action OR genre = Adventure)` actually resolved to films tagged *both* Action *and* Adventure. The chat assistant was never affected (it always used `combinator`); this only hit channels built by the lineup workflow.

### Changed

- **The planner is now taught what a curated channel actually looks like.** It was reaching for the laziest expressible filter — `genre = Animation` for an "All-Day Toons" channel, matching ~7,900 items whose only shared trait is a tag. That's precisely what the existing rule-based generator already produces, so it added nothing. The prompt now states outright that a bare single-genre filter is a failure, and shows the real shape to aim for: **a general predicate, then curated exceptions** — the pattern behind a hand-built channel that pairs `contentRating` + `genre`, subtracts the specific titles that break the mood, and adds back the one show the rule misses. It's also told to combine at least two dimensions, to use exclusions, to reach for `collection`/`studio` over `genre`, and that the biggest-shows list is raw material for nostalgia and daypart channels.
- **Channels now default to carrying both movies and TV**, like real channels do. `mediaTypes` defaults to `["movie","show"]` and narrows only when the concept demands it (a full-series marathon, a film festival).

## [0.5.30] - 2026-07-20

### Added

- **Two manual jobs on Settings → Jobs.** **Clear AI Lineup** deletes every AI-generated channel and package in one click — scoped strictly to `aiGenerated` rows, so preset-generated and hand-made channels are untouched. **Build Lineup with AI** kicks off a full run without touching a terminal. The build job is a **dispatcher**: the real work is a durable workflow that outlives the request and survives restarts, so the job returns as soon as the run is started and its status means "kicked off", not "finished" — the Job table can't represent a multi-hour run.
- **An AI lineup observability page at `/workflows/ai-lineup`.** Its own section rather than living under Channels, because it's about the workflow rather than the channels it happens to produce. Lists every run with live status and per-step progress (polling while anything is in flight), and opens a run to show what it built and **what it cost**: input/output tokens, cache reads (~0.1×) and writes (~1.25×), agent steps, **steps per channel**, and a dollar estimate. Every cost lesson in this arc so far was learned after the fact from terminal logs; this makes spend visible while a run is happening.

### Notes

- Run metadata is read straight out of the Workflow SDK's `workflow` schema with raw SQL — Prisma's describer deliberately can't see that schema (which is what keeps `db push` away from those tables), but plain SQL over the same connection reads it fine.
- A run's report is stored as CBOR in `output_cbor`, so it's decoded through the SDK (`getRun().returnValue`) rather than read as JSON.

## [0.5.29] - 2026-07-19

### Changed

- **The planner now writes the actual filters, and the builders just verify them — the fix for a runaway token bill.** Previously the planner emitted only a *theme* ("Martial arts and Golden Harvest action") and each of the ~50 per-channel workers had to rediscover how to express that as a Plex filter, taking 3–4 preview round-trips. Because an agent loop re-sends its whole conversation on every step, those previews were re-billed repeatedly: **~117,000 input tokens per channel**, and one build exceeded Haiku's entire 200K context on its own preview results. The planner already holds the library's full tag vocabulary, so it now authors each channel's filter directly; the worker previews it once and commits, adjusting only if the result genuinely doesn't match. Verification still lives with the worker, so a bad proposal is corrected or abandoned rather than becoming a broken channel.
- **A `limit` now bounds plan GENERATION, not just the result.** `--limit 5` used to trim the plan *after* the model had written all ~50 channels — so every test run paid for a full 50-channel structured output on the planner model (the most expensive artifact in a run) and discarded 90% of it. It's now part of the prompt.
- **New `compact` preview projection for refinement passes.** Measured on a 316-item filter: `default` ≈ 72k tokens, `quick` ≈ 37k, **`compact` ≈ 10k** — with **no truncation**, every matched item still represented, carrying title / year / rating / genres / studio and episode-and-season counts. The first look at a new filter still uses full `quick` detail; the agent is told to pass `compact` on follow-up checks, which is where the same payload would otherwise be re-sent step after step.

### Added

- **Prompt-cache accounting.** Every build now records `cacheReadTokens` and `cacheWriteTokens` (from the SDK's `usage.inputTokenDetails`) alongside input/output, and the run report totals them. Cache reads cost ~0.1× and writes ~1.25×, so this is what makes the shared-prefix work verifiable instead of assumed — it had been asserted twice without evidence.

## [0.5.28] - 2026-07-19

### Added

- **`pnpm dev` now starts the workflow observability UI alongside the server.** The Workflow SDK ships a web UI that reads our Postgres world directly — runs, steps, events and streams, live — so a lineup build can be watched from a browser instead of scraped out of terminal logs. It comes up automatically on **http://localhost:3199?resource=run**, or on its own via `pnpm --filter server workflow:ui`. `pnpm dev` also now runs `workflow build` first, so the flow/step handlers are always current.

### Notes

- **The UI needs `NODE_OPTIONS=--experimental-sqlite`.** It imports `node:sqlite`, which Node keeps behind that flag until Node 23 (we run 22.12). Without it the server logs "started" and then returns **500 on every request** with `ERR_UNKNOWN_BUILTIN_MODULE` buried in its own output — it looks up but serves nothing. The flag is set in `scripts/dev.ts` / `scripts/workflow-ui.ts` rather than the npm script, because env-var prefixes in package.json aren't portable across Windows and POSIX.
- The UI is taken down with the dev server, so a restart doesn't leave port 3199 held (an orphan makes the next start fail with `EADDRINUSE`).
- Also bounded the engine's Postgres footprint (`WORKFLOW_POSTGRES_MAX_POOL_SIZE`, `WORKFLOW_POSTGRES_WORKER_CONCURRENCY` in `.env`): each engine instance opens a WDK pool **and** a graphile-worker pool, so a dev server plus a CLI run could exhaust `max_connections=100` and fail with `FATAL 53300`.

## [0.5.27] - 2026-07-19

### Added

- **AI connections can now be assigned roles, so different work can run on different models.** Each saved connection can hold any combination of three roles: **Chat** (the admin assistant), **Planner** (heavy reasoning — designs the lineup), and **Worker** (high volume — builds each channel). This exists because an AI lineup build has two wildly different halves: **one** planning call where judgment matters, and **~50** mechanical per-channel build loops that dominate the bill. Pointing the worker at a cheaper model is the single biggest cost lever in the run — and it also makes an A/B trivial: assign Worker to one model, run a few channels, reassign, re-run, compare the filters.
  - **A single connection needs no configuration** — the first one you add claims all three roles automatically, and the role buttons stay hidden. They appear only once a second connection exists.
  - **Every role falls back to the Chat connection** when unassigned, so nothing breaks if a role is never set or its connection is deleted.
  - Roles are exclusive (one connection per role) but independent, so one connection can hold several. Settings → AI Assistant shows a badge per role and a button to reassign.

### Notes

- _(Schema change — requires `pnpm db:push` + `pnpm db:generate`; backend needs a restart.)_

## [0.5.26] - 2026-07-19

### Fixed

- **The lineup build was wildly more expensive than it needed to be.** An agent loop re-sends its whole conversation on every step, so cost grows **quadratically** with step count — and the first full run had nothing cached, a fat static prefix, and the library's entire tag vocabulary arriving as a *tool result* (407 studios ≈ 2k tokens) that was then re-sent on every subsequent step of every channel. The same problem the chat solved in v0.5.13 wasn't carried over to the builder. Three changes, all about **where the prompt-cache breakpoint sits**:
  - **One shared cache prefix for the entire run.** The system prompt, tool definitions, library profile and filter vocabulary are now byte-identical across all 50 channel builds, with the cache breakpoint on the system message — so they cost **one cache entry for the whole run** instead of being re-billed per channel. (A request-level breakpoint, as first written, swallowed the per-channel brief and made every prefix unique — sharing nothing.)
  - **The filter vocabulary is hoisted into that cached prefix.** Previously each agent called `discover_field_values` itself, which lands *after* the breakpoint and is therefore re-sent uncached on every step. Now it's fetched **once per run** (its own durable step) and handed to every builder pre-loaded — so it's sent whole and untruncated, builds converge in fewer steps because discovery is already done, and the agent starts out unable to invent a tag value that doesn't exist.
  - **`preview_filter` stays pinned to the leanest projection.** It's the one genuinely per-channel, per-iteration payload — so it's hardcoded to `detail: "quick"` with **no way for the model to request `verbose`** (which measured ~270k chars on a large filter).

### Added

- **Token accounting.** Every channel build records its input/output tokens and step count, and the run report totals them — so a run's cost is visible immediately instead of arriving with the bill.
- **Live run inspection, documented.** The SDK's inspector reads our Postgres world directly: `bunx workflow inspect runs`, `… steps -r <runId>` for per-step status while a build is running, and `… runs --web` for a local dashboard. Note `bunx` doesn't load `.env`, so `WORKFLOW_TARGET_WORLD` / `WORKFLOW_POSTGRES_URL` must be exported first.

## [0.5.25] - 2026-07-19

### Added

- **The AI lineup workflow now actually builds channels (§7.3a Phase 4 — no more stubs).** Each planned channel gets its own **grounded agent** that turns a plain-language theme into a verified Plex filter: it lists the filterable fields, discovers the library's **real tag values** (never guessing one it hasn't seen), previews candidate filters to check what they actually match, and only then commits. If nothing sensible matches it calls `give_up` with a reason rather than creating an empty channel, and a pool under 5 items is refused outright. Every created channel is stamped `aiGenerated`, attached to its planned package, given its plan-assigned number — and immediately gets a **windowed initial schedule** (v0.5.20) so the lineup is watchable the moment the run finishes. Builds fan out **6 at a time**, each its own durable step, so a crash resumes only the unfinished channels. Verified against a real library: 10 packages and 9 channels created with working schedules (the rest of the run hit an API credit limit), **all 135 preset channels untouched**.
- **The planner now picks icons, and packages get palette accents.** Channel and package concepts include an `icon` from the **lucide** or **phosphor** sets (`lucide:Rocket`, `phosphor:FilmSlate`) chosen to actually evoke the channel, plus an optional broadcast-style **callsign**. Package accents come from the model out of the **16-swatch palette**; **channel** accents come from the existing `channelAccentAt` variance cycle — the same 1–3-channel run-length mechanism the preset generator uses — so the guide gets organic colour banding instead of a rigid rotation, and the counter runs across the whole lineup rather than resetting per package.
- **Re-runs wipe the previous AI lineup first**, scoped strictly to `aiGenerated` rows — manual channels and the preset generator's `generated` rows are never touched.

### Fixed

- **Channel builds are now idempotent.** A durable step that fails anywhere is retried **from the top**, so a step that had already created its channel hit `Unique constraint failed on the fields: (number)` on the retry and reported the channel as skipped even though it existed. The builder now checks for an existing channel at its plan-assigned number before doing any work (and treats a unique-violation on commit as success), so a retry is a no-op instead of a failure. It also refuses to touch a channel at that number that isn't AI-generated.

### Notes

- A full 50-channel run is a real number of LLM calls — it will exhaust a low API credit balance partway through. Failed channels are reported individually in the run report; re-running rebuilds cleanly.
- Running `scripts/run-lineup.ts` while the dev server is up means **two workers share one queue**, so steps may execute in either process. Harmless now that steps are idempotent, but the logs will be split.

## [0.5.24] - 2026-07-19

### Added

- **The AI now proposes a real lineup (§7.3a Phase 3 — the plan step).** One structured-output call over the ~630-token library profile returns a full, Zod-validated lineup: themed **packages**, each holding **channel concepts** with a name, a viewer-facing description, an ordering strategy, and a plain-language `theme` written specifically for the agent that will build the filter. On a real 584-movie / 275-show library it produced **10 packages and 50 channels** — and it's grounded, not generic: it noticed `EON Productions (22)` and proposed a **007 Marathon**; it combined `Toho Pictures` and `Orange Sky Golden Harvest` into **Kaiju & Kung Fu Theater**; it turned the biggest shows into a **Marathon Vault** of in-order complete-series channels; and it split the kids content by era and age band (**Preschool Storytime** / **Bluey & Modern Kids** / **Adventure Time Zone**) rather than lumping it into one "Kids" channel. That's the whole point of the arc: channels nobody would have written a preset for.
- **Channel numbers are assigned at plan time, in the 1000+ block.** AI channels start at **1001**, leaving 1–999 to preset and manual channels, and each package gets its own hundred-block (1001–1099, 1101–1199, …) so its channels stay contiguous with room to grow. Numbers are assigned by us **after** generation rather than by the model — `Channel.number` is `@unique` and the build step fans out concurrently, so letting each agent pick one would race. It also makes a resumed run idempotent.

### Notes

- The planner deliberately **does not write Plex filters**. It proposes intent; Phase 4's per-channel agent grounds that into a real filter with `discover_field_values` + `preview_filter` and verifies the pool before creating anything — so a concept that can't be filled is discarded at build time instead of becoming a broken channel.
- The prompt is explicit that Plex's genre/studio tags are a real-world vocabulary, not a clean taxonomy (`Science Fiction` vs `Sci-Fi & Fantasy`, anime usually tagged only `Animation`), and that a channel's episode count determines whether it can sustain a loop.
- Uses the **active AI connection** (Settings → AI Assistant). Still creates nothing — the build step lands in Phase 4. _(Server — needs a restart; `bunx workflow build` after any change under `workflows/`.)_

## [0.5.23] - 2026-07-19

### Added

- **The AI lineup workflow can now see your library (§7.3a Phase 2 — the analyze step).** The planning model can't be shown 15,000 items, so the workflow distills the whole library into a compact **profile**: totals, the **genre distribution**, the **studios/networks** that dominate, the **content-rating** mix, the **decade spread**, and the **shows big enough to carry a channel** (by episode count). That's what will let the planner propose channels grounded in what's actually on the server instead of generic guesses. Measured on a real library — 584 movies / 275 shows / 14,793 episodes → **~630 tokens in 90ms**, small enough to sit in the cached prompt prefix every per-channel agent shares.
- **`scripts/show-library-profile.ts`** — prints the profile as the model will see it, with its size in characters/tokens, for sanity-checking a plan's inputs.

### Notes

- Genres live inside the `guide` JSONB bundle rather than a column, so the counts are done with **one `jsonb_array_elements_text` aggregate** instead of pulling every row into memory.
- The dimension counts deliberately cover **movies and shows only, never episodes**: episode guides don't carry genre/studio/rating (those live on the parent show), and counting episodes would let one 583-episode show drown out the entire distribution. Episode counts surface separately as "biggest shows".
- _(Server — needs a restart, and `bunx workflow build` after any change under `workflows/`.)_

## [0.5.22] - 2026-07-19

### Added

- **The AI lineup workflow is wired into the server (§7.3a Phase 1 — skeleton).** The durable engine proven in 0.5.21 now starts with the app: `startWorkflowEngine()` boots alongside `startJobs()`, runs the queue poller, and registers a runner the admin API can drive. The workflow itself (`apps/server/workflows/lineup.ts`) lays out the real shape — **analyze → plan → build → report** — as four independently checkpointed steps, each with its final signature (`LibraryProfile`, `LineupPlan`, `PlannedChannel`, `LineupReport`); the bodies are stubs that Phases 2–4 fill in. Verified end-to-end: a run starts, every step executes in order, the status poll goes `running` → `completed`, and the report comes back as the workflow's return value.
- **Admin API for the workflow** — `ai.buildLineup` (start a run, returns a `runId` immediately), `ai.lineupRun` (poll status + report), `ai.cancelLineupRun`, and `ai.lineupAvailable` so the UI can hide the action when the engine is off. The workflow must live in `apps/server` (the SDK's CLI scans `./workflows`) while the tRPC surface lives in `packages/api`, which can't import from an app — so the server **registers** a runner at startup and the router looks it up (`services/agent/lineup-runner.ts`). Dependency direction stays correct and `packages/api` never has to know the workflow SDK exists.
- **`scripts/run-lineup.ts`** — drives a full run from the CLI on its own ports (so it won't collide with a dev server), for developing Phases 2–4 without the admin UI.

### Changed

- **`pnpm dev` and `pnpm build` now run `workflow build` first**, since the `"use workflow"` directives are a build-time transform. Turbo's `build` outputs gained `.well-known/**` — otherwise a cache hit would restore a build with no handlers and every run would 404 on dispatch. Note `bun --hot` will **not** re-run the transform: after editing anything in `workflows/`, re-run `bunx workflow build`.

### Security

- **The workflow handlers are bound to `127.0.0.1` on their own listener** (`WORKFLOW_LOCAL_PORT`, default 3152) and are deliberately **not** mounted on the public Hono app. They execute workflow steps and have no auth — on Vercel they'd ride queue-consumer security, which self-hosting doesn't provide. They're machine-to-machine (our own worker calling back over loopback), so there's no user or session to authenticate and better-auth doesn't apply; the control is that they're unreachable off-box, the same posture as Postgres on :5433. This needs revisiting if the worker ever runs on a different host or the port is published in Docker.

### Notes

- Engine is **opt-in**: set `WORKFLOW_ENABLED=1` (plus `WORKFLOW_TARGET_WORLD` / `WORKFLOW_POSTGRES_URL`). Without it the server boots exactly as before and the API reports the runner as unavailable. Handler bundles are imported lazily, so a fresh checkout that hasn't run `workflow build` still starts.
- Still a skeleton — running it creates **no channels or packages**. _(Server — needs a restart.)_

## [0.5.21] - 2026-07-19

### Added

- **Durable workflow engine proven on our stack (§7.3a Phase 0 — the go/no-go spike).** Groundwork for the "analyze the whole library and build every channel with real understanding" arc: Vercel's **Workflow SDK** (`workflow` + `@workflow/world-postgres`, both pinned at `4.3.0`) now runs on **Bun + Hono** against our own Postgres, with **no Nitro and no framework adapter** — `bunx workflow build` emits standalone handlers we host ourselves. The headline result: a workflow ran its first step, the **process was killed mid-flight**, and a brand-new process **resumed and finished it** — replaying the completed step's result from the event log instead of re-running it. That resumability is the whole reason for the dependency: a "build 150 channels" run takes hours and has to survive a restart. Durable state lives in **its own Postgres schemas** (`workflow`, `workflow_drizzle`, `graphile_worker`) with **zero tables in `public`**, and `prisma db push` was verified to leave all 13 of them untouched — so the workflow engine and Prisma share one database safely. Includes `workflows/spike.ts` + `scripts/spike-workflow.ts` (the harness that proves it), and `workflow-plugin.ts` + `bunfig.toml` (the required build-time transform).

### Notes

- **New env vars** (`apps/server/.env`, not committed): `WORKFLOW_TARGET_WORLD=@workflow/world-postgres` and `WORKFLOW_POSTGRES_URL=<DATABASE_URL without the ?schema= query string>` — the query param is forwarded as a Postgres server setting and errors with `unrecognized configuration parameter "schema"`.
- **One-time setup:** `bunx --package @workflow/world-postgres bootstrap` creates the workflow schemas (idempotent).
- **A build step now exists:** `bunx workflow build` must run before the server boots and again whenever `workflows/` changes — `bun --hot` will not re-run it. Not yet wired into the dev/build scripts or turbo; that lands with Phase 1.
- Generated handler bundles (`apps/server/.well-known/`) are ~20MB and gitignored.
- **Nothing is wired into the running server yet** — this release only proves the engine works and adds the dependencies. No behaviour change.

## [0.5.20] - 2026-07-19

### Added

- **Windowed schedule builds — a new channel becomes watchable in seconds instead of waiting on a full pass.** `buildSchedule` gained an optional **window cap** (`maxDurationSeconds`): instead of always laying one *complete* pass of the pool — for a 2,800-episode channel that's a ~300-day timeline and far too slow to run inline — a windowed build stops at roughly the requested duration, **breaking mid-pass** to do it. Because that leaves a pass half-finished, a build now also returns a **`ScheduleCursor`** (`passSeed` / `passIndex` / `pos`) persisted on the channel, and `extendChannelSchedule` **resumes from it** — so a capped channel walks *through* its pool rather than replaying the top of it. That mattered most for `IN_ORDER` / `BY_AIR_DATE` channels, where every pass is the same order: without the cursor they'd have looped their first N hours forever and never reached episode 50. Running off the end of a pass rolls cleanly into a brand-new pass from 0 (reshuffled for `SHUFFLE`), and a stale cursor — the pool shrank because the filter was edited — rolls to a fresh pass rather than wedging. `schedulePassSeed` is stored **signed** (`| 0`), since Postgres `Int` is signed 32-bit and the seed is an unsigned hash.
- **`scripts/sim-schedule-window.ts`** — harness covering the tricky cases (mid-pass truncation, resume without repeats or gaps, pass rollover, stale cursor) against synthetic pools, so the engine can be checked without Plex or the DB.

### Changed

- **Schedule Backfill builds windowed (~12h) and in bigger batches (10 → 25).** A cheap windowed build means the whole lineup gets a timeline in a run or two instead of ten channels every ten minutes; the hourly Schedule Refresh grows each one from its stored cursor. **A full build is still the default everywhere else** — editing a filter and hitting *Generate schedule* rebuilds the entire timeline exactly as before.

_(Schema change — requires `pnpm db:push` + `pnpm db:generate`; backend needs a restart.)_

## [0.5.19] - 2026-07-19

### Changed

- **Channel preview grid caps at ~2 rows** (`max-h-[30rem]`, tuned for the wide desktop layout) and scrolls beyond that, so a big channel's poster grid stays compact instead of pushing the schedule far down the page.

## [0.5.18] - 2026-07-19

### Added

- **Artwork preview tiles on the channel page (auto-loading).** The channel builder's preview is no longer a plain "N items · title, title…" string — it now shows a **poster grid** of what the channel resolves to, loaded automatically when you open an existing channel. A show's episodes coalesce into one tile with an **episode-count badge** + season line; movies show their year; each tile pulls real Plex art through the existing `/img/:channelId` proxy. The grid is a **scroll-capped** container (handles hundreds of tiles), posters **lazy-load** as you scroll with a **per-tile skeleton** that fades into the image, and the preview query runs async so it never blocks the page. Backed by a new `channels.preview` procedure (full `PlexItem`s via the shared coalescing service). The channel page was also **widened** (`max-w-2xl` → `max-w-6xl`) to give the grid room. _(New tRPC procedure — needs a backend restart.)_

## [0.5.17] - 2026-07-19

### Added

- **Live "Thinking…" indicator in the AI chat.** While the model reasons, the chat now shows an auto-expanding **"Thinking… Ns"** ticker (with the reasoning streaming in) instead of a bare spinner, then collapses to **"Thought for Ns"** when it's done; reasoning loaded from history stays a quiet collapsed "Reasoning". There's also a standalone "Thinking…" bubble for the gap right after you send, before the first token streams back — so a long turn always reads as working, not stuck. Built by upgrading our base-lyra Reasoning AI-Elements component (no upstream registry).

## [0.5.16] - 2026-07-19

### Fixed

- **The AI chat "hang" — the actual root cause: Bun's 10s server idle timeout.** The server exported the Hono app directly, so Bun served it with its **default `idleTimeout` of 10 seconds**. An AI turn (extended thinking + a large context + several tool calls) routinely goes longer than 10s before the first byte or between chunks, so Bun closed the socket mid-stream (`request timed out after 10 seconds`) and the reply never landed — which then persisted a half-finished turn. The server now exports `{ port, idleTimeout: 255, fetch }`, raising the idle timeout to Bun's maximum; each streamed byte resets the clock, so only a genuinely stalled connection is cut. The v0.5.13–0.5.15 caching + lean-preview work still matters (it keeps turns fast and cheap), but this is what was actually severing the stream. _(Server — needs a restart.)_

## [0.5.15] - 2026-07-19

### Changed

- **Preview now returns full `PlexItem`s with episodes coalesced up into the show — on the canonical schema, with 3 detail levels.** The v0.5.14 pass stripped episodes correctly but reshaped each entry into a bespoke `{ show, seasons, episodes }` stub that deviated from `PlexItem` (the type everything else speaks). Now `preview_filter` / `search_titles` return real `PlexItem`s: a show's many episodes **coalesce into a single show item** — pulled from the `MediaItem` cache so it carries the true parent-show metadata (genres, cast, studio, art) — annotated with `episodes` + `seasons` counts; movies pass through as their own item. A new **`detail`** param picks the depth: **`quick`** (guide trimmed of summary/cast/art for a fast glance), **`default`** (full item metadata, episodes coalesced), or **`verbose`** (every matched episode as a full item). Verified on a 2,816-episode filter: 16 shows at ~7k chars (quick) / ~13k (default) vs 400 episode items / ~270k (verbose). The agent gets the real metadata picture without the episode flood, and the same shape will feed the coming admin preview tiles.

## [0.5.14] - 2026-07-19

### Changed

- **`preview_filter` / `search_titles` return a lean summary to the model — big previews no longer bloat the chat.** A preview can match thousands of episodes; the agent was being handed the full rich payload (poster paths, genres, ratings for up to 60 entries) on every call, which is what grew a conversation to 100k+ tokens. The tools now return just what the model needs to reason: **totals + which shows match (each with its season & episode counts) + which movies** — e.g. `{ show: "Pokémon", seasons: 11, episodes: 583 }`. Measured **~85% smaller** per call. Actual episode titles are available on demand via a new **`verbose: true`** tool param. The **rich shape is unchanged** for the (coming) admin preview tiles — the grouping now also computes a **season count** per show, and the lean projection happens only at the agent boundary.

## [0.5.13] - 2026-07-19

### Fixed

- **Long AI chats no longer feel "hung" — prompt caching.** A channel-building conversation grows fast (each `preview_filter` returns dozens of show/movie entries) and was hitting **120k+ tokens re-sent to Anthropic *uncached* on every turn** — tens of seconds of reprocessing latency per reply, which read as the assistant hanging (and gave a slow turn more room to abort mid-reasoning). The chat now sets an Anthropic **`cacheControl: ephemeral`** breakpoint on the conversation prefix (system + tools + prior turns), so each turn reuses the cached prefix and only the new delta is processed fresh. Measured on a real 120k-token chat: a follow-up turn went from ~120k uncached input tokens to **~30k fresh + ~220k served from cache** — much faster and ~10× cheaper on the cached tokens. Namespaced to Anthropic, so it's a no-op for other providers. _(Backend — needs a restart.)_

## [0.5.12] - 2026-07-18

### Fixed

- **The AI assistant now survives real conversations — tool approvals, resume, and persistence hardened.** Approving a write (create/update/delete channel or package) was **stuck on "Working" forever and never hit the server**: `useChat` needs `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` to actually POST the approval-resume — without it `addToolApprovalResponse` only records the decision locally. Added it, so an approved tool now runs, streams its result, and the card completes. Also fixed three ways a chat could **silently stop responding**: (1) a crashed/abandoned tool approval left a dangling tool call that bricked every later turn with `MissingToolResultsError` — a new `healDanglingToolCalls` guard closes out any resultless tool call the user has moved past (injecting a "not applied" result) while leaving a live approval alone; (2) interrupted turns persisted broken `streaming`/unsigned reasoning blocks that Anthropic rejected as "unsupported reasoning metadata" and that poisoned subsequent requests — reasoning fed back to the model is now sanitized to keep only complete, **signed** thinking blocks (which the approval-resume genuinely needs) and drop the rest; (3) the tool-call card crashed the whole panel (`Cannot read properties of undefined (reading 'icon')`) on the `approval-responded` state, now mapped with a catch-all fallback. Raised the per-turn tool-step cap 16 → 40 so long discovery/build loops don't end without a reply, and the **Approve / Deny** buttons now show on the collapsed tool card (persistent footer) instead of only when expanded.

## [0.5.11] - 2026-07-18

### Fixed

- **AI chat multi-step turns now persist.** A turn that ran tool calls (multiple steps) was lost from history — the assistant's response vanished on reload. Persistence now upserts the **whole conversation by each message's own id** (both up front and on finish), so multi-step / tool turns are captured and the reloaded ids round-trip without duplicating. Added `onError` logging + a `show-ai-history.ts` debug script.

### Changed

- **`preview_filter` / `search_titles` return grouped, artwork-ready results** instead of a flat title list: **shows aggregated with episode counts** + movies, each with a poster path — far more useful for the agent (and the shared shape the admin channel-builder preview will use). The agent's system prompt also now knows the **`title` "is" operator is a Plex substring/contains match** (`title is "Bear"` matches anything containing "Bear").

## [0.5.10] - 2026-07-18

### Added

- **The AI assistant can now build channels — the tool layer (increment C).** The chat has a full, grounded toolbox over your real services: **discovery** (`list_media_sources`, `library_overview`, `list_filter_fields`, `discover_field_values`, `search_titles`) and **`preview_filter`** (resolve an unsaved filter → count + sample), so it builds filter trees ONLY from real library data and verifies before creating; **inspection** (`list`/`get` channels + packages); and **writes** — `create_channel`, `update_channel` (any subset — even just a number or package), `delete_channel`, bulk `update_channels` / `renumber_channels`, `create`/`update`/`delete_package`, and `clear_ai_generated`. **Writes require the admin's approval**: the chat pauses and shows an **Approve / Deny** card (AI SDK native tool-approval) before anything touches the DB. AI-made rows are flagged with a new **`aiGenerated`** provenance field (on Channel + ChannelPackage), so they're cleanly reversible. The tools are plain reusable services — the coming **workflow-SDK** "analyze the whole library and build everything" job will call the exact same functions. _(Requires `pnpm db:push` + a backend restart.)_

## [0.5.9] - 2026-07-18

### Added

- **Tool-call + reasoning rendering in the chat.** New base-lyra **Tool** and **Reasoning** AI Elements components, and the assistant thread now renders the model's tool calls (collapsible cards showing the tool name, status, input, and output/error) and its reasoning inline — the UI groundwork for the channel-building tool layer.

## [0.5.8] - 2026-07-18

### Added

- **The chat's input footer shows the active model** as a badge (Sparkles + model name) — clicking it opens a dropdown to **switch the active connection** right from the chat, like AI Elements' model selector.
- **Empty state when no model is connected.** If there are no AI connections yet, the whole assistant panel shows a "No model connected" state with a **Set up a model** button that jumps to Settings → AI Assistant, instead of a broken chat.

## [0.5.7] - 2026-07-18

### Changed

- **Removed the divider line between the chat textarea and its footer** — the input card now reads as one continuous surface.

## [0.5.6] - 2026-07-18

### Changed

- **The AI chat's input is now a single unified card** (matching AI Elements' PromptInput): a taller, auto-growing textarea with a divider and a footer row (tools on the left, send on the right), and the **focus ring wraps the whole control** — textarea + footer + send button — via `focus-within`, instead of just the textarea. Enter sends / Shift+Enter makes a newline; it clears on submit. Bumped the default textarea height so the footer no longer crowds it.

## [0.5.5] - 2026-07-18

### Added

- **The AI assistant chat is live (increment B).** The reserved global side panel (0.5.3) is now a working **streaming chat** against your active AI connection (0.5.4) via the Vercel AI SDK (`streamText` → `useChat`, a new cookie-authed admin-only `POST /api/ai/chat` route). **Chat history persists** — every exchange saves to the `AiConversation` / `AiMessage` tables, and the panel lets you start a **New chat** or resume any past one from **History** (with delete).
- **Base-lyra "AI Elements" components.** The upstream AI Elements registry assumes stock (Radix) shadcn and tries to overwrite base-lyra's own components, so we built our own equivalents on base-lyra: **Conversation** (auto-stick-to-bottom via `use-stick-to-bottom` + a scroll-to-bottom button), **Message** / **MessageContent** (user/assistant bubbles), **Response** (streaming markdown via `streamdown`), and **PromptInput** (textarea + submit, Enter-to-send). More (tool-call cards, reasoning) will come with the tool layer.

> No tools yet — it's a grounded conversational assistant that helps you think through channels. The channel-building **tool layer + propose-then-approve** is increment C. Requires a backend restart.

## [0.5.4] - 2026-07-18

### Added

- **AI provider connections (Settings → AI Assistant).** Configure one or more AI model connections for the channel-building assistant and pick which is **active** (what the chat uses). Each is a provider (Anthropic / OpenAI / Google / **OpenAI-compatible / local**) + a **model dropdown** (curated per provider, with a custom option) + optional base URL (for local endpoints — Ollama, LM Studio, vLLM, OpenRouter) + an API key **encrypted at rest** (AES-256-GCM keyed off `BETTER_AUTH_SECRET`). Each connection can be **tested** (a cheap round-trip that proves the model actually responds) and **set active**. Built on the **Vercel AI SDK** provider factory (`getModel`) so the rest of the agent stays provider-agnostic. New `AiConnection` table (+ `AiConversation` / `AiMessage` tables ready for the chat's history persistence) and an `ai` tRPC router; added the base-lyra `select` + `badge` components. _(Requires `pnpm db:push` + a backend restart.)_

## [0.5.3] - 2026-07-18

### Added

- **Slide-in side-panel system in the admin (ported from BasicTimeTracker).** The authenticated layout now hosts a right-side panel that slides in beside the inset content card, with BTT's two modes: **global panels** (local state, persist across navigation — for always-available surfaces like the AI assistant) and **URL-param route panels** (`?panel=<type>`, shareable / refresh-survivable, content declared by the matched route's context). Global wins when both are set. Panel content publishes its own title / meta / footer up to the chrome via **portals** (matching the use-portals-not-slots convention). An **AI Assistant** button (Sparkles) in the top header toggles the reserved `chat` global panel — a placeholder for now; the next arc fills it with the Vercel AI SDK chat, the channel-building tool layer, and the provider/model config. New: `@ChannelGuide/ui` `side-panel` primitives, `details-panel-provider`, `panel-header-provider`, `DetailsPanel`.

## [0.5.2] - 2026-07-17

### Added

- **Device settings: per-codec capability overrides.** The Device page now lists this TV's video / audio / container support (in two columns), each with a toggle, showing what the diagnostic **measured**, any **known-issue** default (VP9, DTS/TrueHD — now defaults you can override rather than hardcoded), and an **Override** badge when a toggle diverges from what the diagnostic found. You can **force a codec on or off** — forcing on something the panel can't actually decode is flagged with a "Forced" warning — and **Reset to diagnostic** clears all overrides. The device's recent playback errors are listed for context, alongside its info (model / webOS / resolution / HDR). Backed by a new `capabilityOverrides` JSON column on `TvDevice`; `getDeviceNativeCaps` now layers **measured → known-issue quirks → overrides**, so playback honors your toggles. New endpoints `GET`/`POST /api/v1/device/caps` + `POST /api/v1/device/caps/reset`. _(Requires `pnpm db:push` + a backend restart.)_
- **About page** — the app is now **Airwave**; the subpage shows the version (tracked from `appinfo.json`) and a short description.

### Changed

- The settings sidebar gains an **About** category, and the focused settings row now **scrolls into view** as D-pad focus moves down a long page.

## [0.5.1] - 2026-07-17

### Changed

- **Settings is now a master-detail shell with a sliver sidebar.** `/settings` gains a left sidebar reusing the guide's glass-circle treatment — a quiet sliver of circles (Guide · General · User · Device) that expands to labels when focused — over nested subpage routes (`/settings`, `/settings/user`, `/settings/device`) that all share one consistent layout. D-pad: on the rail ▲/▼ move between categories, OK opens one (Guide returns to live TV), ► enters the page's content, Back returns to the guide; in the content ▲/▼ move between options, OK activates, ◄/Back returns to the rail. The old flat settings list is replaced by **General** (app prefs + back to guide), **User** (sign out), and **Device** (Run capability diagnostic + Remote key probe). The device capability toggles + reset land next (0.5.2).

## [0.5.0] - 2026-07-17

Opens the 0.5.x line.

### Changed

- **The capability diagnostic is now a polished onboarding screen.** The setup flow (auto-run on first sign-in, or Settings → Run capability diagnostic) is centered and clean: the clip being tested plays inside a framed "screen," and the format under test — its label plus container/codec chips — **slides in and out with Framer Motion** as the run advances, over a single filling progress bar with a live "N native · M transcode" tally beneath. On completion a check-mark pops into the frame and a Continue button fades up. The **measurement logic is unchanged** (same per-clip native-decode test + post-run audio-track verdict, same `DeviceCapability` writes) — only the presentation changed; the old dense debug results grid is gone (per-clip detail still lives in the DB / PlaybackLog and the remote/probe tooling).

## [0.4.33] - 2026-07-17

### Changed

- **The full-screen "Channel Surf" control now opens the surf carousel.** It previously dropped the player to the mini feed (a leftover from before channel surf existed) — pressing it now closes the feature panel and slides up the channel-surf carousel, which is what the button says it does.

## [0.4.32] - 2026-07-17

### Fixed

- **Channel surf now auto-hides, and opens on the current channel.** Two fixes to the new carousel: (1) the ~12s auto-hide never fired — the player status ticks ~twice a second, re-rendering the chrome and handing surf a fresh `onClose` that restarted the countdown every time; the timer now lives in its own mount-scoped effect (reading `onClose` through a ref), so it actually reaches 12s. (2) Opening surf pre-stepped one channel in the pressed direction; it now opens **centered on the channel you're already watching**, marked with a subtle "Watching" flag above that tile, and ◄/► move from there.

## [0.4.31] - 2026-07-17

### Added

- **Channel surf — ◄/► brings up a channel carousel while watching (§7.2, Arc 3; completes the remote-navigation arc).** With the full-screen chrome closed, pressing left/right slides a horizontal carousel of channel tiles up from the bottom (same slide as the feature panel), opening one step in the pressed direction. Each tile shows the channel (icon / number / name in its accent), its **cover art**, a **progress bar** for how far into the current program it is, and the **title / episode** on now. ◄/► move — **wrapping**, so channel 1 → the last channel is a single press — **OK tunes** the highlighted channel, **Back closes** without changing, and ~12s of no input auto-hides it back to the video. The row is **virtualized horizontally** (`@tanstack/react-virtual`, like the guide grid) so 100+ tiles and their cover images stay cheap — only the visible window loads. While it's up it owns ◄/►/OK/Back via a shared `surfActiveRef`, so number entry, CH▲/▼, and the player chrome all defer to it.

## [0.4.30] - 2026-07-17

### Added

- **CH▲/▼ changes the channel while watching (§7.2, Arc 1).** The remote's channel up/down — **PageUp/PageDown, keyCode 33/34** on the C2 — steps one channel through the ordered lineup (up = the next-higher number), clamped at the first/last channel (no wrap). It's a while-watching gesture (full-screen or mini); on the guide with nothing playing it's a no-op. No banner — a tune already opens the feature panel showing the new channel. Behind an **in-flight lock** (per spec, *not* a debounce): a press fires immediately and any further CH press is ignored until the new channel has actually loaded — the persistent player remounts on a channel change, so this prevents rapid-press reload thrash — with a timeout backstop if a channel errors and never plays. Also testable in a desktop browser (PageUp/PageDown). Stepping lives in the provider (`channelStep`) since it shares the lock with the player's load lifecycle.

## [0.4.29] - 2026-07-17

### Added

- **Channel number entry — type a number on the remote to tune it (§7.2).** From the guide, the full-screen player, or the mini feed, typing digits drops a glass overlay from the top-center (same treatment as the channel pill) showing the number with placeholder slots. **OK — and only OK — commits**, tuning that channel full-screen if it exists or flashing red briefly if it doesn't; there's deliberately no commit-on-timeout and no auto-commit as soon as digits resolve (a toddler mashing numbers never jumps channels on its own). An arrow breaks out and passes through to normal navigation, Back cancels the entry, and a stretch of inactivity quietly dismisses it *without* tuning. Number→channel lookup is client-side against the already-loaded lineup (no server round-trip), via a new shared `use-channel-nav` foundation (ordered lineup + `byNumber`, plus next/prev ready for the upcoming CH▲/▼ arc). While entry is active it's **zoned** so OK/Back reach only it — the guide and player chrome defer via a shared context ref (`numberEntryActiveRef`) paired with `stopImmediatePropagation`, so there's no stray tune, app-exit, or pop-to-mini underneath. (Internally, the player context was split into `player-ctx` to break a Fast-Refresh import cycle.)

## [0.4.28] - 2026-07-17

### Added

- **Remote key probe (Settings → Remote key probe).** A dedicated diagnostic route (alongside the capability diagnostic) that shows the raw key event for every remote button press — `keyCode` front and center, plus `key`/`code`/`which`/`location`/`repeat` and keydown-vs-keyup — newest first. webOS surfaces its special keys only via `keyCode` (Back is 461; the CH▲/▼, color, and other buttons are otherwise unknown, and the desktop simulator won't reveal them), so this reads them straight off the panel. It swallows every key so probing never navigates away; **double-press Back** (or click **Exit** with the magic-remote pointer) to leave. This unblocks the remote channel-navigation arc (§7.2) — we can now capture the real CH keycodes on the C2.

## [0.4.27] - 2026-07-17

### Changed

- **The favorite heart shows a clear focus ring when its channel rail is focused.** Focusing a channel's rail in the guide is the affordance to favorite/unfavorite it (OK toggles), but the heart didn't read as the interactive target. It now gets a circular outline in the same blue the program focus uses. The heart's own size, color, and position are unchanged — the padding that reserves the ring's space is constant (an outline takes no layout space), so the icon never shifts when focus lands on it.

## [0.4.26] - 2026-07-17

### Changed

- **The bumper countdown is now a draining donut.** The between-programs "Coming up next" card used to pop/enlarge the number on every tick; it now shows an accent ring that **empties like a pie/loader** as the countdown runs, with the seconds held steady in the middle. The ring drains off a local clock (smoothed with a CSS `stroke-dashoffset` transition) and represents the whole bumper length, so it winds cleanly from full to empty.
- **The bumper's cover art is a touch more visible.** The blurred backdrop was dimmed a little too far — eased the image opacity up (0.5 → 0.62), the blur down (48 → 40px), and the dark overlay lighter, so the upcoming program's art reads without hurting text contrast.

### Added

- **A bumper now shows something in the mini feed too.** When a bumper hit while the player was docked as a mini feed in the guide, the video area just went blank (the full bumper card only draws in full-screen). The mini feed now shows a **compact** version — the donut countdown + an "Up next · {title}" blurb (no art) — so the interstitial is visible there as well.

## [0.4.25] - 2026-07-17

### Changed

- **Guide featured-panel badges now carry a subtle left→right gradient.** The 4K/HD, HDR/DV, audio-channel (Stereo/5.1/7.1), and ATMOS/DTS:X badges keep their existing base colors, but each now fills with a `linear-gradient(90deg, …)` that starts at that color and deepens slightly toward the right — a soft sheen rather than a flat block (identical at the left edge). Text colors are untouched; plain gradients render fine on the C2's Chrome 108.

### Added

- **The watch player's Info view now shows how the current program is being delivered.** Pressing **Info** in the full-screen chrome tucks a small **Playback** readout under the details: the delivery mode (**Direct Play** / **HLS Transcode** / **Progressive Transcode**) as an accent pill, then the container, video codec, and audio codec as chips — each codec chip annotating Plex's copy-vs-transcode call (amber when it's re-encoding). When a direct-play uses a client-side audio-track switch (the Avatar / Gladiator II case), the audio chip shows the selected track's label instead. Backed by a new `delivery` field on the player status, captured from the resolved media at each program load — so it's a from-the-couch diagnostic without digging into PlaybackLog.

## [0.4.24] - 2026-07-17

### Fixed

- **VP9 video now transcodes instead of tanking the app.** VP9 decodes in isolation (the capability diagnostic passes it — it's what YouTube uses) but fails every real path on the LG C2: raw-file `<video>` direct-play of `mkv/vp9` errors (code 4, `SRC_NOT_SUPPORTED`), and VP9 *copied* into fMP4/MSE **software-decodes**, pegging the CPU so the whole app goes unresponsive (Back / channel-change took ~30s until the stream was killed). VP9 is now a device-quirk exclusion (`UNRELIABLE_VIDEO` in `codecs.ts`, the video analog of `UNDECODABLE_AUDIO`): it's dropped from the panel's credited video set, so `getPlaybackInfo` won't direct-play it and the HLS profile won't advertise it as a copy target → Plex re-encodes the video to H.264, which hits the hardware decoder. Confirmed on the C2 (Ms. Rachel, `mkv/vp9/aac`). Server-side only.

### Added

- **A proper channel/package accent palette + per-channel colour variance.** Channels and packages now choose from a fixed **16-swatch palette** (a stored swatch **key** like `orange`, not a hex — each app computes the colour from the key). Every swatch has a **vivid** value (shown small: the picker swatch, the sidebar package dot) and a hand-tuned **muted** value (large surfaces: the guide's rail/cell fill + channel icon) — "store vivid, present muted", so saturated tones never glow against the dark grid. Palette lives once in `@ChannelGuide/ui/lib/accent-palette` (both apps) with a server-side key mirror in `packages/api/services/accents.ts`.
- **The generator now gives channels colour variance.** Previously every channel inherited its package's single colour, so the guide read as long same-colour bands down each package's contiguous channel numbers. The generator now assigns each channel a **cycled accent** (a running index through the palette) so adjacent channels contrast — restoring the lively per-row variance while staying a fixed, overridable palette choice. Packages keep their own colour for the sidebar.
- **`backfill-accents.ts`** — migrates the existing DB in place (no regeneration needed): remaps package tint tokens to keys (`gray`→`slate`; the rest already matched), and assigns the variance accent to all generated channels. Idempotent, with a dry-run default.

### Changed

- **Admin accent picker + tiles use the palette.** The channel/package appearance picker now shows the 16 vivid swatches; channel/package/guide tiles render the palette's exact muted hexes via a new `AccentIconTile` (so the admin matches the TV). The app's own nav/breadcrumb chrome is untouched (it keeps `TintedIconTile`). Channel/package `tint` inputs are coerced to a valid accent key server-side.
- **The TV now colors everything from the channel's real accent** (its own key, else its package's), replacing the index-derived accents: the guide rail/cell fill + channel icon, the featured panel's icon tile + muted-tinted channel number/name + progress fill (all **muted**, for large surfaces over the slate grid), and the full-screen player chrome — channel chip, scrubber/progress fill, control buttons, bumper card, mini-feed buttons (all **vivid**, since they sit over black video where the muted tint reads washed out). "Store vivid, present muted" applied per context.

### Changed

- **The featured now-playing card gets more height.** Retiring the top Guide/Settings segmented control into the sidebar freed the vertical space it occupied; the featured panel's scale is bumped (0.72 → 0.80) to take it back. The grid keeps the remaining height and stays comfortably scrollable.

## [0.4.21] - 2026-07-16

### Added

- **Guide sidebar (step 1) — filter the channel grid by package.** A collapsed **sliver** of glassmorphism circle buttons sits at the left of the guide; D-pad **left** off the leftmost program lands on the **channel rail**, and left again focuses the sidebar, which **expands to reveal a label beside each circle**. The layout reserves only the sliver's width and the expansion is a pure **overlay**, so the guide never shifts, reflows, or smooshes the program blocks / time axis (and the expand animation costs no re-renders). Collapsed it stays quiet — just the **actions** (Guide / Settings / Account) and a single **Filters** circle standing in for the whole filter group (lit in the active filter's accent when one is applied). On focus the real lenses — Favorites, Recents, then each channel **package in its own stored tint + icon** — **fade in, staggered**, in a scrolling list that keeps the focused circle in view. Selecting a package filters the grid to it and stays lit; selecting the **already-applied** filter toggles it back off to all channels; **Guide** clears to all channels; **Settings**/**Account** navigate / sign out.
- **Favorite channels (per user, synced across devices).** Focus a channel's **rail** and a **heart** appears beside its icon — filled when favorited; **OK** (or a click) toggles it. Backed by the long-dormant `Favorite` table via `GET /api/v1/favorites` + `PUT`/`DELETE /api/v1/favorites/:channelId` — the method carries the **desired state** rather than toggling server-side, so it's idempotent (a retry or double-press can't flip it back), and the TV flips its cached set **optimistically** so the heart responds instantly. The **Favorites** lens filters the grid to them.
- **Recently-watched channels.** The **Recents** lens shows the channels you've actually watched, **deduped** and **most-recent-first** (the one lens not in channel-number order). `WatchSession` couldn't serve this — it's `userId @unique`, i.e. only the *current* session — so the heartbeat now also upserts **`ChannelWatchState`** (previously declared but never written): its `@@unique([userId, channelId])` dedupes to one row per channel for free and `updatedAt` is the recency order. Exposed as `GET /api/v1/recents`. This also seeds the cross-device resume that table was designed for.
- **`GET /api/v1/packages`** — the channel packages that have at least one **enabled** channel (the sidebar's canonical filter list, ordered by the admin `sortIndex`), via a new `listActivePackages` service. The guide's channel payload now also carries `package.id`/`key`, so the grid filters by package **id**.
- **Shared `GlassCircleButton`** — the player chrome's glass circle treatment (blur + translucent + accent focus ring) extracted for reuse by the sidebar, with a per-item accent so packages glow in their own tint. Tint **tokens** (`blue`, `rose`, …) now resolve to hex on the TV via `lib/tint.ts`.

### Fixed

- **The channel rail is now a D-pad focus stop** between the grid and the sidebar (OK on it is inert for now — the Favorites step will make it toggle favorite/unfavorite).

### Removed

- **The top Guide/Settings segmented control is gone** — the sidebar owns that navigation now (Guide / Settings / Account), and the reclaimed vertical space goes to the guide. Up from the top channel row still docks into the mini feed.

## [0.4.20] - 2026-07-16

### Fixed

- **Off-window and sliver guide programs are dropped from navigation *and* render.** The guide API returns a small back-buffer past the rail start, and a program clamped tight to the rail could compute to a near-zero/negative width (which is invalid CSS, so the block auto-expanded to fit its content — a mis-sized stub). Such programs — ones that ended before the rail start, or that would render narrower than a small pixel threshold (`MIN_VISIBLE_PX`) — are now filtered out of each channel's `programs` at the source, so they're **neither shown nor D-pad-navigable** (you can no longer left-arrow onto a program that isn't on screen). The currently-airing program is never affected (always well within the window and full-width). Filtering stays client-side because "too tiny to show" is a pixel judgment tied to the panel's lane width.

### Changed

- **Channel up/down in the guide now snaps to the currently-airing program.** Moving between channels previously preserved a horizontal *time cursor* — it matched whatever program aired at the same time position on the next channel (cable-guide time-column alignment). It now always highlights the next channel's **"on now"** program instead; left/right still browses that channel's past/future programs as before. The time-alignment logic is retained behind a `TIME_ALIGN_CHANNEL_NAV` flag (default `false`) via a `pickAtLive` wrapper mirroring `pickAtCursor`, so the old behavior can be flipped back on.
- **Live program's progress-fill direction is now a flag.** The two-tone tint on the currently-airing card (stronger for elapsed, weaker for the remainder) can be reversed via `PROGRESS_FILL_ELAPSED_STRONGER` (default `true` keeps the current look).

### Fixed

- **A narrow clamped guide program no longer overflows into its neighbor.** A program that started before the grid's left edge is clamped to the rail with a shrunk width; when that width was smaller than the block's horizontal padding, `box-sizing: border-box` couldn't shrink the element below its padding, so it floored to ~42px (padding + borders) instead of its real ~19px and overlapped the next program. The padding now lives on an inner wrapper that the block clips, so the block always renders at its exact geometric width.

### Removed

- **The leftover D-pad legend** ("◄► programs · ▲▼ channels · OK to watch") pinned to the bottom-left of the guide — it overlapped the program grid and is no longer needed.

## [0.4.18] - 2026-07-16

### Added

- **HDR / Dolby Vision / Atmos captured during metadata sync + badged in the guide.** The featured panel now shows an **HDR** badge (or **DV** for Dolby Vision) beside the 4K/HD badge, and an **ATMOS**/**DTS:X** badge beside the audio badge. These live on the video/audio *streams*, which the section listing omits by default — so the sync now requests them inline with **`includeElements=Stream`** (the same bulk call, no per-item fetches; verified it doesn't strip the genre/cast tags) and `getPlaybackInfo`-style parsing derives HDR from the video stream's `colorTrc` (`smpte2084`→HDR10, `arib-std-b67`→HLG) or the Dolby-Vision flag, and object-audio from the audio stream titles. Stored on the cached `GuideMeta` (a JSON column — no migration), so the guide reads them straight from the `MediaItem` table.
- **A few other useful fields now captured in the same sync call** for future use: `videoCodec` (hevc/h264/av1), `dynamicAudio` (Atmos/DTS:X), and `addedAt` (library add date, for recency / "New" cues).

> Run **Sync Metadata** once to backfill these onto existing library items.

## [0.4.17] - 2026-07-16

### Changed

- **Guide mini-feed fills the featured panel's height.** The docked mini player was sized by a fixed width with a 16:9 aspect ratio, so its height was width-derived and, with the row top-aligned, it sat short against the top of the featured panel leaving a gap below. It now stretches to fill the panel's available height (bottom-flush — the panel has no bottom padding) while keeping a fixed, bounded width (the video's `objectFit: cover` fills the taller slot), so the feed spans the featured section top-to-bottom and stays on-screen on the webOS simulator (deriving width from a stretched height via `aspect-ratio` overflowed off-screen there).
- **Featured description uses the full available width.** The now-playing summary had a fixed `maxWidth` that capped it well short of the column, leaving empty horizontal space beside it. The cap is removed so it fills the room left beside the mini feed (still clamped to two lines).

## [0.4.16] - 2026-07-16

### Added

- **Direct-play with a client-side audio-track switch — the real fix for TrueHD/DTS-default 4K HDR (e.g. Avatar).** When a file's container + video are natively decodable but its *default* audio isn't (TrueHD/DTS/ALAC), yet it carries a **decodable companion track** (Avatar's TrueHD 7.1 default alongside an AC3 5.1), playback no longer drops to an HLS transcode (where the copied ~50 Mbps HDR video blew past the MSE SourceBuffer quota and buffered endlessly). Instead the raw file **direct-plays** — no transcode, HDR/HEVC untouched, entirely off the MSE path — and the server tells the client **which audio track to select** on load. A new `getPlaybackInfo` middle case picks the best decodable audio track — preferring a real program track over a **commentary**, then most channels — and returns `directAudio` with its **index among the decodable tracks** (which is exactly what the panel exposes, since it hides tracks it can't decode); the TV player switches to it via `video.audioTracks` after `loadedmetadata`. No Plex-side PUT is involved: a raw-file direct-play serves the file as-is, so Plex's selected-stream state wouldn't ride along — and since the browser's `AudioTrack` API exposes no codec, the **server** names the track and the **client** enables it. The panel's exposed audio-track list + the selected index are recorded to `PlaybackLog` (`caps.audio`).
- **Client falls through same-language audio tracks before dropping to HLS.** Measured on the C2, `video.audioTracks` does **not** match Plex's file order — the panel reorders and even hides tracks (Avatar's 2 audio streams surfaced as 1). So the server's `audioIndex` is a first guess, not a certainty: the player now enables that candidate, and on a `<video>` decode error tries the **next same-language track**, exhausting them before it falls back to the (buffering) HLS transcode. This turns files where the panel exposes multiple tracks (which previously errored straight to HLS) into native direct-plays when any exposed same-language track is decodable.
- `sim-audio-directplay.ts` — server-side test of the flow (PUT-select a decodable track, re-read metadata, and diff Plex's `/decision` before/after — proving the file's embedded `default` flag is immutable and `Media.audioCodec` doesn't follow the selection, which is *why* the switch must happen client-side). `sim-title.ts` now prints `directAudio`.

## [0.4.15] - 2026-07-16

### Changed

- **Aggressive HLS buffering for high-bitrate 4K HDR.** When a very high-bitrate 4K HDR HEVC video is *copied* into the HLS transcode (e.g. ~50 Mbps Avatar, forced there only because its TrueHD audio must transcode), hls.js's default 60 MB buffer (≈ a few seconds) thrashed over Wi-Fi — `bufferFull ↔ bufferStalled ↔ bufferSeekOverHole`. The player now buffers as aggressively as the browser allows: `maxBufferSize` raised so hls.js's own cap never binds before the MSE quota (~150 MB, the hard ceiling), a long forward `maxBufferLength`, a tiny `backBufferLength` so the whole quota goes to the *forward* buffer, and `maxBufferHole` tolerance so it doesn't stall re-seeking small gaps. Video is still copied (untouched); this only changes how much is buffered ahead.

### Added

- `probe-title-streams.ts` — read-only inspector for a title's bitrate + every audio track (codec/channels/default), for deciding delivery (e.g. spotting a decodable secondary audio track on a TrueHD-default UHD rip).



### Added

- **Idle mini-feed auto-expands to full-screen** (default 60s of no input). With only the small mini feed playing over the guide, the TV's screensaver would eventually blank everything but the tiny video; a fullscreen video keeps the panel awake, so after an idle stretch the mini feed goes full. Any remote/pointer activity resets the timer.



### Fixed

- **Grid fully deselects when focus moves to the nav pill / mini feed.** The row highlight already dimmed, but the focused program *block* kept its outline (its `focusedProgramId` wasn't gated on the zone), so a channel still looked selected while you were on Guide/Settings. Now nothing in the grid is highlighted when focus isn't on the grid.
- **Snappy fast-scroll.** The wheel handler read `fc` from the render closure, so a burst of ~15 ticks all saw the same stale value and advanced one-per-render (the lag before it caught up). It now accumulates through a synchronous `fcRef`, so a fast scroll jumps straight to the target channel.



### Fixed

- **No stray tune when activating the nav pill.** The magic-remote OK button also fires a *click* on whatever the pointer is hovering, so pressing OK on the Guide/Settings pill was clicking the (still-highlighted) channel underneath and tuning it. A channel-row click now only tunes when the **grid** is the focused zone; on the pill or mini feed a click just returns to the grid. The channel highlight also **dims when focus is on the pill or mini feed**, so it's clear where focus is.
- **Wheel / scroll-ring now moves the selection like a D-pad**, one channel per tick (fast), instead of slowly free-scrolling the grid. (Non-passive wheel listener that drives `fc` up/down and lets the virtualizer scroll to it.)

### Added

- **The channel overlay opens automatically when you tune a channel** (and auto-hides after the normal timeout, or on Back) — so you see the channel/program info + controls on open without pressing OK first.



### Added

- **D-pad up reaches the Guide/Settings nav pill.** From the top channel row, Up now leaves the grid — into the mini feed if one's playing, then Up again (or directly, if no feed) to the **Guide/Settings segmented control**. Left/Right move between the tabs, OK activates (Settings navigates; Guide returns to the grid), Down returns to the grid. The focused tab shows a ring (inset outline, no layout shift).
- **Magic-remote pointer + scroll-wheel support on the guide.** Clicking a channel row with the motion pointer tunes it (same as OK). Scrolling with the wheel keeps the D-pad focus following the view (the highlighted/tuned channel stays on-screen), so pointer-scrolling and D-pad navigation stay in sync — guarded so it doesn't fight the D-pad's own scroll.



### Changed

- **Guide grid is virtualized — fixes the painfully slow scrolling on the C2.** With 100+ channels × several program blocks each, rendering every row up front made scrolling crawl on the TV browser (and bloated the DOM compositing behind the full player). The channel rows now use `@tanstack/react-virtual`: only the visible rows plus an **overscan of 10 above/below** render (so nothing pops in mid-scroll), sized from the dynamic viewport-derived row height (remeasured on resize). D-pad focus scrolls via the virtualizer's `scrollToIndex`. The now-line/marker overlay and per-row time-lane math are unchanged.
- **Hid the grid scrollbar** — it never showed on the C2 but appeared in the desktop browser sim. `scrollbar-width: none` + `::-webkit-scrollbar { display: none }` on the grid's scroll container.



### Fixed

- **HLS transcode audio is now AAC (was Opus) — fixes the mid-stream audio cutout.** The HLS transcode target advertised `{aac, opus}` (measured caps ∩ MSE-safe), and Plex picked **Opus** — which cut out mid-stream on the C2 while the video kept playing (confirmed on the HDR + DTS test channel). Opus removed from the MSE-safe set (`{aac, mp3}`), so the target advertises only AAC and Plex transcodes audio to AAC — the bulletproof MSE codec. No quality tradeoff (the audio is transcoded either way); direct-play keeps the full native audio set.

### Added

- **hls.js audio/buffer errors are logged to PlaybackLog.** Non-fatal audio/buffer/append/stall errors now record a row (with the hls.js detail), so a future mid-stream cutout is captured with its real cause instead of guesswork.

### Verified

- **HDR survives the HLS transcode path on the C2.** 4K HEVC HDR + DTS-HD MA (The Bourne Legacy) played via HLS with the video **copied** (`→hevc`, 3840×1600) and HDR intact for 12+ minutes — the last open question on the playback arc.



### Fixed

- **Audio track switching now actually works, and shows every track.** Two bugs: (1) audio tracks were **coalesced by language**, so a title with multiple English tracks (main 5.1, stereo, **director commentary**) collapsed to a single "English" — you couldn't see or pick the others (e.g. Back to the Future defaulting to commentary with no way off it); (2) the switch selected by *language* and applied it via the URL `audioStreamID` transcode param, which Plex honors **inconsistently** — so it re-resolved the stream but never changed the track. Now each track is exposed individually with its **stream id** and a rich label (from `extendedDisplayTitle` — e.g. "English (DTS 5.1)" / "Commentary"), the client selects by **id**, and selection is applied via Plex's **"Set stream selection" PUT** (`PUT /library/parts/{id}?audioStreamID=&subtitleStreamID=&allParts=1`) — the same proven path subtitles already use. Fixed in **both** the TV app and the admin preview. (Switching still forces a transcode to HLS; a future Phase 2 will switch supported codecs natively via `video.audioTracks` without transcoding.)



### Added

- **Buffering spinner on the player.** The player now shows a spinner while the `<video>` is waiting on data — both the **initial channel load** (nothing to look at while a 4K HDR / transcoded stream spins up) and any **mid-stream rebuffer** (e.g. scrubbing a transcoded channel re-spins the transcode). Driven by real `waiting`/`stalled` → `playing`/`canplay` events (plus the initial resolve), a new `PlayerStatus.buffering`. Centered, animated (no burn-in), shown in both full and mini layouts; hidden during the bumper card and while paused.

## [0.4.6] - 2026-07-15

### Changed

- **Transcode delivery is now HLS, not progressive MKV.** The must-transcode tail (DTS/TrueHD/ALAC audio, Hi10P, quality caps) was delivered as a progressive-HTTP stream to the native `<video>` — which the PlaybackLog proved **does not play on the C2**: `mode=http` either returned nothing (`0x0`) or reported dimensions but rendered a black screen, while the *identical* content via `mode=hls` played cleanly (e.g. `hevc/dca-ma → hevc/opus`, 3840×1632). The progressive rung is removed; transcodes now always deliver **HLS (fMP4)** via hls.js/MSE. **Direct-play (native `<video>`) is unchanged and remains the primary path** for everything the panel decodes — HLS only carries the transcode tail. The HLS profile advertises the full native video set (so Plex **copies** HEVC/AV1, HDR metadata preserved) with MSE-safe audio (aac/opus/mp3). `getPlaybackInfo` no longer emits `mode: "http"`.
- **Sim tooling:** `sim-channel.ts <n> hls` forces the HLS transcode path for inspection; added `show-play-log.ts` to dump recent PlaybackLog rows.

### Notes

- Open item: verify **HDR survives the HLS/MSE path** on the C2 for HDR content that *also* has undecodable audio (DTS/TrueHD) — the only case forced to transcode a copied HEVC-HDR video. HDR content with decodable audio still direct-plays untouched.



### Added

- **Playback logging restored in the TV player.** The player refactor had left `api.logPlayback` uncalled, so `PlaybackLog` stopped recording. `use-tv-player` now records each program load's real on-device outcome — mode (direct/http/hls), Plex's decision, source codecs, and whether the panel actually decoded (`decodedWidth`/`readyState`/`error`) — ~6s after load, and immediately on a `<video>` error. This is the ground truth for diagnosing bad channels (e.g. a black-screen `mode=http` transcode with `decodedWidth=0`) instead of guessing.



### Changed

- **Diagnostic audio detector switched to `audioTracks`.** `webkitAudioDecodedByteCount` turned out to be stubbed to `0` on the C2's Chrome 108 (measured on-device — it never climbed), so it can't detect audio decode. The working signal is `HTMLMediaElement.audioTracks`: the panel lists a decodable audio track for codecs it can decode and drops/disables it for ones it can't. `audioOk` is derived from that, with the same safe cross-clip control (only a panel that produced a usable track for *some* clip can mark another clip's audio unsupported) so it's never a false negative. Grid shows the raw `tracks=/en=/bc=` readout. DTS remains excluded via the `UNDECODABLE_AUDIO` quirk regardless.



### Added

- **The diagnostic now verifies audio decode, not just video.** Each clip's decoded-audio bytes (`webkitAudioDecodedByteCount`) are sampled over playback; the result fills the existing `DeviceCapability.audioOk` column (previously always null — the hands-off onboarding had dropped the manual audio verdict). It's derived safely, never a false negative: a clip whose audio bytes climb → `audioOk = true`; and **only if some clip proves audio decodes on this panel** (a control) does a clip that played its video but decoded ~0 audio bytes get `audioOk = false`. If nothing climbs or the counter isn't exposed, verdicts stay null (unknown). The results grid shows 🔊/🔇 per clip. Fully silent (muted — audio still decodes) and needs no re-onboarding gesture.
- **`native-caps` credits audio from the measured verdict.** An audio codec is credited when `audioOk = true`; a measured `audioOk = false` blocks it and **supersedes** the old video-only inference; codecs with no verdict (`null`) fall back to inference minus the `UNDECODABLE_AUDIO` quirk. So on a re-run panel, DTS is blocked because the C2 demonstrably decodes no DTS audio — not because of a hardcoded list. Re-run "Run diagnostic" from Settings to populate `audioOk` on an existing device (upsert by `deviceId+testId`).



### Fixed

- **DTS audio no longer cuts out dead (Anastasia).** The onboarding diagnostic verifies only that a clip's **video** decodes (`videoWidth×videoHeight`) — it never checks audio — so a DTS clip whose video decoded made us wrongly credit DTS *audio* support. The LG C2 has no DTS decoder (licensing), so DTS video plays but the audio is silent then stalls dead. DTS is now excluded from the credited native audio set, so DTS/`dca` content takes the transcode path — the **video still copies** (no re-encode) and only the **audio** transcodes to Opus over the (working) MKV progressive stream. `mkv/h264/dca` now resolves to `MODE=http` with a real matroska stream.

### Changed

- **Codec naming consolidated into one module** (`services/capabilities/codecs.ts`). The codec-name canonicalization (DTS `dca`/`dca-ma`/`dca-hra` → `dts`, `ec-3` → `eac3`, `h265`/`hvc1` → `hevc`, `matroska` → `mkv`, …) was duplicated between the capability side (`native-caps.ts`) and the source-matching side (`plex/client.ts`); it now lives once and both import it. The DTS exclusion is a documented **device-quirk table** (`UNDECODABLE_AUDIO`) rather than a magic set — a stopgap until the diagnostic verifies audio directly.



### Added

- **Persistent player with a live mini-feed in the guide.** Playback no longer stops when you leave a channel. The `<video>` and the effectiveTime state machine now live in a root-level `PlayerProvider` (above the router), so:
  - Tuning a channel plays it **full-screen**; **Back** drops it to a **mini feed** docked in the guide's featured panel (top-right) that **keeps playing** (audio too), instead of ending the session.
  - Focus returns to the channel you were watching (its live program) when you land back in the guide.
  - **D-pad Up** from the top of the grid docks focus into the mini feed, showing two buttons — **Full screen** and **Close**. **Back** while a mini feed plays stops the feed + session; a second Back exits the app.
  - The featured **right slot only appears while a feed is playing** — with nothing playing, the featured info spans the full width (no empty gap).
  - One `<video>` element is repositioned between full and the featured slot (Framer-animated), so same-channel navigation never reloads the stream; a channel *change* is a clean remount.
- `/watch/$channelId` is now a deep-link entry that tunes and bounces to the guide (the player is a persistent overlay, not a route).

## [0.4.0] - 2026-07-15

Opens the 0.4.x line. Fixes the black-screen channels — DTS content now direct-plays, and the progressive transcode path actually produces a playable stream.

### Fixed

- **DTS content now direct-plays instead of black-screening.** Plex reports DTS streams as `dca` / `dca-ma` (DTS-HD MA) / `dca-hra`, but our measured capability token is `dts`, so the names never matched and every DTS title was pushed to transcode. Added codec-name normalization in the direct-play check (`dca*`/`dts*` → `dts`, plus `ec-3`→`eac3`, `hvc1`/`h265`→`hevc`, `matroska`→`mkv`, etc.). DTS-HD MA/HRA embed a DTS core any DTS-core decoder falls back to, so the measured `dts` legitimately covers them. Verified via simulation: `mkv/hevc/dca-ma` → `direct` with a real matroska stream.
- **The progressive-HTTP transcode rung produced an unplayable stub (the black screen).** For a TV, content that must transcode was served as a **progressive MP4**, which a native `<video>` can't play while it's still transcoding (no front `moov` atom) — Plex returned an ~89-byte stub and the screen stayed black, only recovering to hls.js if at all. The progressive transcode now uses a **streamable container the panel natively decodes** — `progressiveContainer()` picks `mkv` (preferred) or `mpegts` from the device's measured containers; if it has neither, we skip straight to hls instead of a doomed attempt. Verified via simulation: a must-transcode title went from `container=mp4` / 89-byte stub → `container=mkv` / a real 165 KB matroska stream. hls.js is now a genuine last resort.

### Added

- **Playback simulation scripts** (`apps/server/scripts/sim-playback.ts`, `sim-channel.ts`) — resolve playback for a panel's *measured* capabilities and fetch the resulting stream to confirm Plex serves a real body, reproducing the TV playback path server-side. Lets codec/transcode issues be diagnosed without a TV. `sim-playback.ts` sweeps every channel's "now"; `sim-channel.ts <n>` scans one channel's timeline.

## [0.3.57] - 2026-07-15

### Changed

- **Guide now-line is just the triangle marker (vertical line hidden).** The big red vertical now-line is hidden for now; the downward triangle at the top marks the current time. Behind a `SHOW_NOW_LINE` toggle so the full line can be restored.

## [0.3.56] - 2026-07-15

### Fixed

- **Highlighting a program no longer nudges the layout.** The focus indicator was a border-width change (1px → 2px), which reflowed the card's contents by a pixel or two. The card border is now a constant 1px and focus is drawn as an **inset outline** (`outline-offset: -2px`) — no layout participation, stays within the rounded card, so highlighting is a pure visual change.

## [0.3.55] - 2026-07-15

### Changed

- **Cleaner focus states in the guide.** Highlighting a channel row now tints only the **rail** (the redundant row-wide highlight background is gone). And focusing a program that isn't the currently-airing one now shows just the **outline** — it no longer changes the block's background, so only the live program ever carries a filled color.

## [0.3.54] - 2026-07-15

### Added

- **The live program card fills like a progress bar.** The currently-airing program now shows a two-tone channel-tint background: a stronger, more vibrant tint from the left up to the live point (how far into the show we are), and a weaker tint of the same color for the not-yet-aired remainder. The fill is computed against the card's *rendered* width, so it stays correct even when the card is clamped to the rail (a program that started before the visible window). The live tint takes precedence over the selection highlight; D-pad focus still reads via the ring.

## [0.3.53] - 2026-07-15

### Changed

- **Channel tint is now reserved for the live program and the focused channel rail.** Previously every program block wore a faint channel-tint background. Now only the currently-airing program carries the channel tint; all other blocks get a standard neutral fill. The focused channel's rail/row highlight (background + inset bar) also switches from the generic blue to that channel's tint, so the selected channel reads in its own color. The D-pad selection/focus highlight on a program block is unchanged.

## [0.3.52] - 2026-07-15

### Changed

- **Live "on air" accent line hugs the card edge and is a touch slimmer.** Moved the accent line right up against the left edge of the program card (`left: 3`) and reduced its width (`4 → 3`px), keeping the top/bottom inset that clears the corner radius.

## [0.3.51] - 2026-07-15

### Changed

- **Featured now-playing card gets more of the screen.** Bumped the featured panel's scale so it has more room to breathe; the guide grid keeps the remaining height and stays comfortably scrollable.

## [0.3.50] - 2026-07-15

### Changed

- **Smaller top Guide/Settings control; bigger feature card.** The segmented Guide/Settings control at the top was oversized; shrank its font, padding, and top margin considerably and handed that vertical room to the featured now-playing card (bumped the feature panel scale up).
- **Featured description holds a fixed two-line height.** The summary reserves two lines (its max) at all times, so the featured panel no longer grows/shrinks as the description varies between one line, two lines, or none.

## [0.3.49] - 2026-07-15

### Changed

- **The guide opens focused on what's on now.** On first load the focus sat on the first program of the first channel — the recently-aired lead that fills the grid's left edge — rather than the program actually airing. It now initializes focus (and the featured panel) to the currently-airing program for the selected channel once the guide data loads.

## [0.3.48] - 2026-07-15

### Changed

- **The now-line's top marker is now a downward triangle, correctly centered.** The red circle that capped the live now-line was centered on the line's left edge rather than its 3px center, so it looked slightly off. Replaced it with a subtle downward-pointing triangle whose bottom point sits at the very top of the line, centered on the line (with a soft red glow). Added a buffer between the time-increment axis and the top of the grid so the triangle has clearance and doesn't crowd the time labels.

## [0.3.47] - 2026-07-15

### Changed

- **The live "on air" accent is now a separate inset line, not a border.** It was drawn as the block's left border, which meant it read as the blue focus ring while focused and dropped to a thin, radius-curved edge once you moved away — so it looked like moving focus lost the accent. It's now a dedicated element: a rounded accent line inset slightly from the left edge and clear of the top/bottom corner radius, driven purely by whether the program is airing — so it stays put on the live program regardless of focus and never gets clipped by the block's rounded corners.

## [0.3.46] - 2026-07-15

### Fixed

- **Guide up/down navigation no longer lands on off-screen programs.** When focused on a long, already-airing program clamped to the rail, the vertical-nav time cursor sat at that program's midpoint — often left of the grid's visible start — so moving to the next channel matched an equally off-screen program and put the focus ring on something you couldn't see. The cursor is now clamped to the visible window before matching, so up/down selects the next channel's clamped/left-most in-view program instead.

## [0.3.45] - 2026-07-15

### Changed

- **Rail-clamped guide programs keep a tiny gap from the rail.** Following 0.3.44, an in-progress program pinned to the rail sat flush against it; it now leaves the same small 6px gap the program blocks have between each other, so it's inset consistently rather than butted right up against the channel rail.

## [0.3.44] - 2026-07-15

### Changed

- **Guide grid: in-progress programs now pin to the rail instead of overflowing off-screen.** A program that started before the grid's left edge (the recently-aired lead, or a long movie already underway) was positioned with a negative offset, so its rectangle — and the left-aligned title inside it — ran off the left of the lane, leaving a blank block against the rail. Such blocks are now **clamped to the rail** (left pinned to the lane start, width shrunk by the clipped amount), so the program and its title always butt flush against the channel rail. Blocks fully inside the window are unchanged.

## [0.3.43] - 2026-07-15

### Changed

- **Guide grid: the channel-accent left bar now marks only the live program.** Every program block previously carried a left border in the channel's accent color; now that "on air" cue is reserved for the program **actually airing right now** (server-time within its slot), so scanning the grid you can instantly see what's live per channel. Other blocks keep the plain hairline border; the D-pad focus ring is unchanged.

## [0.3.42] - 2026-07-15

### Changed

- **Guide rail polish.** The left channel cell now shows the **real channel icon** (resolved from the stored `lucide:Name` id — presets are lucide-only, so no phosphor catalog needed) in a tinted tile top-left with the **channel number pushed to the top-right** (same height, centered), and the **full channel name** pinned to the bottom, left-aligned, clamped to **2 lines**. Tighter cell padding and a slightly smaller name. (Genre-accurate tint from each channel's real `tint`/`icon` inheritance is a follow-up; the accent is still index-derived for now.)

## [0.3.41] - 2026-07-15

### Added

- **Redesigned bumper interstitial.** The between-programs card is no longer a plain black "Up next" — it's a full-screen **blurred cover art** of the upcoming program with a heavy dark overlay (always dark), a "**Coming up next**" label, the show/movie title + episode + **SxxEyy**, and a big **countdown** whose seconds **pop-grow** (Framer Motion spring). The countdown runs on a **local clock** (captured end-time), reconciling against the server-derived remaining only on real drift — so ticks stay smooth regardless of polling. `features/watch/bumper-card.tsx`.
- **Public artwork proxy** (`GET /img/:channelId?path=…&w=…`) — streams Plex cover art through the channel's media source with the admin token injected (a CSS/`<img>` background can't send a bearer token). Only proxies Plex image paths; optional `w`/`h` resize via Plex's photo transcoder. Also usable for guide thumbnails later.

### Changed

- **Scrubber eases instead of snapping** — CSS transitions on the segment left/width, thumb, live marker, and time label, so expanding/contracting when you scrub across a boundary glides.

## [0.3.40] - 2026-07-15

### Changed

- **Scrubber reworked to an anchored, expanded-focus layout.** The program you're in is now the **expanded middle** of the bar (fixed `[start…end]` mapping, so scrubbing moves the thumb through the wide middle — real motion, not a panning background), flanked by a **fixed left peek** (previous-program tail + bumper — always visible, even at live) and a **fixed right peek** (upcoming bumper + next-program head — so at live near a program's end the thumb never collides with the LIVE indicator). Rewind into a previous program and *it* becomes the expanded focus. Segment percentages are computed in the hook; the panel just renders them.

## [0.3.39] - 2026-07-15

The effectiveTime DVR machine — rewind across programs, like real TV.

### Added

- **Net-new `use-tv-player.ts`** — a REST + native-first channel-player state machine (a sibling of the admin's `use-channel-player.ts`, which is **untouched**). It drives the `<video>` off one clock (`effectiveTime`) on the **whole channel timeline** instead of the single current file, so you can **rewind out of the current program, through the bumper, into the previous program** — the timeline maps any instant to `(ratingKey, offset)`. Timeline-driven rollover (program → bumper card → next program), resume-on-reload, watch-session heartbeat, and the native-first delivery ladder (direct → progressive-http → hls.js last-resort + safety-catch) are all preserved. `watch.tsx` is now a thin shell over the hook.
- **Multi-segment sliding scrubber.** At/near live it's the **full current program** with the thumb at its relative position (as before). Rewind before the program start and it collapses to a **sliding ~13-min window** that pans with you and trims the right edge, rendering **one rounded segment per slot** (capped prev-program tail · bumper · current), the current slot filled to the thumb in the channel accent. **Restart** restarts the slot you're *in* (so rewound into Program A, it restarts Program A); in a live bumper it dims and acts as Jump-to-Live (no unaired program to restart).

## [0.3.38] - 2026-07-15

### Added

- **Back at the guide root now exits the app.** Bundled LG's **`webOSTV.js`** runtime (vendored into `public/`, loaded from `index.html`) so `window.webOS.platformBack()` is available — pressing Back on the guide triggers the platform exit (webOS 9 shows the "exit app?" prompt). Previously it was a no-op (you had to press Home). `@procot/webostv` is TS typings that still expect this runtime, so vendoring the actual library is what enables `platformBack`.

## [0.3.37] - 2026-07-15

### Fixed

- **The LG remote's Back button now closes overlays instead of jumping to the guide.** By default webOS routes the remote Back through the browser History API (the app gets a `popstate`, not a keydown) — so our router navigated away while a keyboard Backspace (a real keydown) worked. Set **`"disableBackHistoryAPI": true`** in `appinfo.json` (per LG's guide), so Back now arrives as **keyCode 461** and our handlers catch it: on the player it closes the open dropdown → info view → panel → then the guide; Settings returns to the guide; the guide root best-effort-exits the app. **Keyboard Backspace still works everywhere** (both `keyCode 461` and the `Backspace`/`GoBack`/`XF86Back` key names are handled).

## [0.3.36] - 2026-07-14

Player UI to match the reference design + **lucide icons everywhere** (no more tofu boxes on the C2).

### Changed

- **All icons are now lucide components** instead of unicode glyphs — the C2's system font has no glyphs for `☰ ⚙ ◄ ► ▲ ▼ ★ ⏸ ⟲` etc., so they rendered as empty boxes. Swapped across the player and the guide grid (nav, hints, rating star, all controls).
- **Redesigned the watch player** to match the reference: a **glass channel chip** top-right (tinted genre accent + number + name), just the **program title** bottom-left, a **minimal borderless scrubber** (accent-filled bar, white thumb, time centered under the thumb, LIVE far-right), a row of **glassmorphism control pills** (Pause · Restart · Channel Surf · Info · Continue Watching/Jump to Live), and **circular glass icon buttons** for Audio / Subtitles / Quality (base-lyra dropdowns). Removed the redundant focus outline (the thumb + button highlight show focus).
- **Info mode:** the **Info** button swaps the scrubber + controls for a full **details view** (summary, year/rating/★, genres, cast, director, studio); Back returns. The `now` payload already carries the full metadata.

## [0.3.35] - 2026-07-14

### Added

- **Glass DVR scrubber in the feature panel.** The panel now leads with a frosted (`backdrop-blur`) scrubber: a timeline bar with a **thumb** at the current position, the **elapsed / duration** time, a red **live marker** on the bar, and a **LIVE indicator** below-right that shows how far behind live you are (`-2:30 · LIVE`) or a bright **LIVE** when caught up. Focus model is two rows — **row 0 = scrubber** (◄ seek back, ► seek forward toward live but never past it, **OK pause/play**, ▼ to the controls), **row 1 = Restart + the audio/subtitle/quality dropdowns** (◄► move, ▲ back to the scrubber). Program **position is derived from a playback baseline** (offset + currentTime delta) so it's accurate across direct/http/hls — the first piece of the effectiveTime machine. Selecting the LIVE indicator jumps to live.

### Notes

- Seeking is reliable for direct-play (full-file); on a live transcode it's bounded by the buffer. Pausing correctly falls behind live (the gap grows), matching DVR intuition. The full machine (cross-program rewind, rollover-into-bumper, resume, position-preserving option changes) still follows.

## [0.3.34] - 2026-07-14

Burn-in-safe player with a Framer Motion feature panel.

### Changed

- **Nothing is drawn on the live video anymore** (OLED burn-in) — the always-on top bar, debug overlay, and hints are gone. Pressing **OK** now reveals transient chrome via **Framer Motion**: a **feature panel slides up** from the bottom (fade + slide) with the program details, **DVR controls** (Restart · −15s · Play/Pause · +15s · Jump to Live), and the audio / subtitle / quality selectors as **base-lyra (shadcn) dropdowns** that open upward; and a **slim top header slides in** (channel + back hint). Both **auto-hide after ~8s** of inactivity and on Back, so nothing sits burned on screen. D-pad ◄► moves across controls, OK activates, Back closes the open menu then the panel.

### Notes

- DVR controls are native seeks for now (pause / ±15s / restart / jump-to-live) — great for direct-play; the full effectiveTime/delaySeconds machine (cross-program rewind, rollover-into-bumper, resume, and position-preserving option changes) is the next arc. Added `framer-motion`.

## [0.3.33] - 2026-07-14

Parity player controls + watch sessions on the TV.

### Added

- **Audio-track / subtitle / quality controls on the watch screen** — matching the admin preview. Press **OK** while watching to open a D-pad control panel with three columns: **Audio** (switch track by language), **Subtitles** (Off + burn a language), **Quality** (the full Plex ladder). Selecting an option re-resolves the current program with it (the server forces the matching transcode); the native-first ladder + hls fallback are unchanged. `api.media` now takes an options object and `api.qualities()` was added.
- **Watch-session heartbeat** — the TV now drives the same `WatchSession` machinery as the admin preview: it heartbeats (`POST /api/v1/sessions/heartbeat`) ~every 10s with channel / state / ratingKey / transcode-session, and **ends the session** (`/sessions/end`) on leaving the player. This populates "Now Watching" and lets `watch-session-reap` stop orphaned transcodes.

### Notes

- Options re-resolve at the live edge for now (the minimal player has no DVR position yet — that lands with the effectiveTime state machine), so a change snaps to live. Subtitle burn follows the verified PUT-select recipe server-side.

## [0.3.32] - 2026-07-14

### Changed

- **Guide grid runs edge-to-edge — no gaps for bumpers.** Bumper interstitials (omitted from the grid) left an empty gap between a program's real end and the next program's start. `getGuideGrid` now **absorbs that trailing gap into the preceding program's shown duration** (broadcast-style: an inter-program break belongs to the program before it, like a commercial), so program blocks butt right up against each other. Channels with no bumpers are unaffected.

## [0.3.31] - 2026-07-14

### Changed

- **Featured panel leads with the show name for episodes** — renders `{Show Name} S1, E2 · {Episode Title}` (show name bold, SxxEyy + episode title in the lighter suffix) instead of using the episode title as the heading. Movies are unchanged.

## [0.3.30] - 2026-07-14

### Fixed

- **The guide grid's lead area is no longer blank.** `getGuideGrid` only returned currently-airing + upcoming programs, so the space to the left of "now" (recently-aired programs) rendered empty. It now takes a `backMinutes` window (default 60, exposed as `/api/v1/guide?backMinutes=`) and keeps programs that **ended within the recent past** — filling the grid's lead with the just-aired items (which are still rewindable via the DVR timeshift window). The broad 6h query still catches a long program that started before the window but is still airing.

## [0.3.29] - 2026-07-14

The **Aurora guide grid** — the 10-foot live-TV guide UI (from the Claude Design handoff).

### Added

- **`apps/tv-web` now opens on a real guide grid** instead of a plain channel list: a featured now-playing panel (channel, title + SxxEyy, year/rating/★, HD·5.1 badges, summary, progress + "Xm left") over a scrolling **time grid** — per-channel rows with program blocks positioned by air-time, a pulsing red **now-line**, and blue focus. D-pad: ◄► move program, ▲▼ move channel (preserving the horizontal time cursor), **OK tunes**. New `/settings` route (sign out + re-run diagnostic). Data via a `useGuide` Query hook over `/api/v1/guide`. Design tokens/spec captured in `.docs/tv-design-spec.md`.
- **Fluid, not fixed:** the layout is a flex column that fills the viewport (the grid expands into leftover height), the time-lane's px-per-minute is derived from the *measured* width, and text/spacing are `vw`-based — so it fits any screen. The featured panel is uniformly scaled down so the grid gets the majority of the vertical space.

### Notes

- Program still-art is a placeholder box (Plex images need a server-side proxy — a follow-up). Channel accent colors are index-based for now (mapping to genre/tint is next). Parity player controls (subtitles / audio / quality) are the next sub-arc.

## [0.3.28] - 2026-07-14

TV app foundation refactor — the webOS app now uses the admin's frontend paradigms.

### Changed

- **`apps/tv-web` is now on TanStack Router + TanStack Query + base-lyra shadcn**, instead of the slapped-together `useState` screen-switcher and raw `fetch`. File-based routes (`login` / `_auth/` guide / `_auth/watch/$channelId` / `_auth/diagnostic`) with a bearer-token auth gate (`_auth/route.tsx`), **in-memory history** (a packaged webOS app has no URL bar), and the `QueryClient` mounted via the router's `Wrap` — mirroring `apps/web`. Reads go through thin Query hooks (`useChannels`) over the existing REST chokepoint (`lib/api.ts`); the TV app stays on the **bearer `/api/v1` surface, not tRPC** (an installed app's unknown origin only the permissive bearer surface accepts). The **login flow is unchanged** (it works well) — just moved onto the `/login` route.
- **shadcn/base-lyra wired up** (`components.json` + `@ChannelGuide/ui` dependency + `lib/utils` `cn` re-export), so tv-web shares the admin's design system and `pnpm dlx shadcn add <component>` works. Chrome-108 CSS lowering (Lightning CSS) already covers the base-lyra oklch/color-mix tokens.

### Notes

- Behavior is preserved (login, guide list, tune-and-play, capability onboarding). The 10-foot **Aurora** guide-grid UI (`.docs/tv-design-spec.md`, from the Claude Design handoff — blue accent, channel rail, now-line) is the next step; this refactor is the foundation it builds on.

## [0.3.27] - 2026-07-14

Native-first playback, step 2 — the self-healing delivery ladder (hls.js is now a true last resort).

### Added

- **Progressive-HTTP transcode for TVs.** When a source *can't* be native raw-file direct-played (Hi10P, MPEG-2, AVI/FLV, or a forced transcode from a quality cap / audio switch), a capable panel now gets a **progressive HTTP transcode** (`protocol=http`, `start`, `container=mp4`) it plays with the **native `<video>` element** — not HLS/hls.js. Because native `<video>` isn't MSE, the transcode target can keep the **full native audio set** (Plex copies E-AC3/DTS/TrueHD instead of forcing it → aac). New `mode: "http"`; `clientProfileExtra(caps, protocol)` builds the per-protocol target.
- **Runtime native→hls safety-catch.** If a native attempt (`direct` or `http`) throws a `<video>` error at runtime, the client re-resolves the same program **once** with `forceHls`, and Plex serves an hls.js/MSE stream. So the full ladder is **raw-file direct → progressive-HTTP transcode → hls.js**, each rung native until the last — and even if progressive-HTTP misbehaves on a given panel, playback self-heals to hls.

### Notes

- The admin browser preview is unaffected — it passes no capability profile, so it always resolves to `direct`/`hls` (hls.js in the browser, by design). `mode: "http"` only ever occurs for a capability-reporting TV client.

## [0.3.26] - 2026-07-14

Native-first playback, step 1 — the measured capability map drives Plex's decision.

### Added

- **The onboarding diagnostic's measured results now build the Plex profile.** New `capabilities/native-caps.ts` (`getDeviceNativeCaps`) turns a device's `DeviceCapability` rows into its real native-decode set — a codec/container counts as supported only if a clip that *actually decoded* on the panel contains it. `resolveMedia` prefers this **measured** map over the client's `canPlayType` self-report (which lies on TVs); the report is now just a fallback until a device has onboarded. The media response carries `capsSource` (`measured` / `reported` / `default`), surfaced in the TV debug overlay.

### Why it matters

- On the real C2 the measured set is `video: h264/hevc/av1/vp9`, `audio: aac/ac3/eac3/dts/truehd/flac/alac/opus/pcm`, `containers: mp4/mkv/mov/ts/webm`. Because the profile now declares exactly that, Plex **direct-plays the raw file** (native `<video src>`, HDR preserved) for essentially the whole real-world library — including the **MKV + E-AC3/DTS/TrueHD** content that used to fail with `bufferAddCodecError` when it was wrongly routed through hls.js/MSE. hls.js drops toward a true last resort. The progressive-HTTP transcode fallback for the genuinely-native-incompatible tail (Hi10P / MPEG-2 / AVI / FLV) is step 2.

## [0.3.25] - 2026-07-14

Make the webOS app render on the LG C2's browser (Chromium 108).

### Fixed

- **Tailwind v4 styling silently dropped on the C2.** Tailwind v4 emits bleeding-edge CSS — `oklch()` theme variables and `color-mix()` — that landed in **Chrome 111**; the C2 is **Chrome 108**, so every `var(--color-*)` (defined in oklch) resolved to an invalid value and the UI lost its colors, while the desktop Simulator (Chrome 132) looked fine. Rather than downgrade to Tailwind v3, `apps/tv-web` now runs **Lightning CSS with a Chrome-108 target** (`css.transformer: "lightningcss"` + `browserslist("chrome >= 108")`): it lowers `oklch()` to hex fallbacks in `:root` (guarding the modern value behind `@supports`) and the `color-mix()` opacity utilities already ship an `@supports` hex fallback — so the shipped CSS has **zero unguarded modern color functions**. Verified on the C2: full styling. Build target also pinned to `chrome108` for JS. This is the pattern the future `packages/tv-ui` kit will follow.

## [0.3.24] - 2026-07-14

Fix the capability-probe test media — the diagnostic was giving false negatives on a real TV.

### Fixed

- **H.264 clips were accidental Hi10P/HDR, which real TV hardware rejects.** The master is a 10-bit HDR HEVC file, and the ffmpeg recipes never pinned a pixel format, so libx264/libx265 inherited 10-bit + BT.2020/PQ — emitting **H.264 High 10 (Hi10P)** tagged HDR. LG's *hardware* H.264 decoder refuses that (`error 4`), while desktop *software* decoders (the Simulator) accept it — so the panel failed the H.264 control clip and, because every audio/subtitle/edge clip rides on an H.264 carrier, all of those too (a real LG C2 scored 14/49). The matrix now pins `yuv420p` on the 8-bit codecs (10-bit stays only where intended), and the generator **tonemaps HDR→SDR BT.709** for every non-HDR clip while leaving the HDR10 clips untouched. Re-measured on the C2: **33/39 generatable clips**, and the six remaining failures are all genuine (Hi10P, MPEG-2, AVI/FLV containers, 8K) — including a clean pass of the full native audio set (E-AC3/DTS/TrueHD/FLAC).

## [0.3.23] - 2026-07-14

Capability diagnostic reworked into hands-off **onboarding**.

### Changed

- **Fully automatic diagnostic.** Plays each clip **muted** (so autoplay never blocks — the old run's "only HDR played" was largely an unmuted-autoplay artifact), and judges **only whether the video decodes** (`videoWidth×videoHeight`) — audio is switchable/transcodable, so it's no longer a manual verdict. No more thumbs-up/down, no confusing corner UI. Auto-advances through the whole matrix with a clean progress bar + results grid.
- **Runs as onboarding** — auto-fires once on first sign-in per device (localStorage flag; also set on skip/error so it never nags), establishing the baseline capability map. Still re-runnable from "Run diagnostic".

### Fixed

- Generated `.ts` MPEG-TS test clips no longer break `tsc` (excluded `capability-media` from the server build); the media dir is gitignored (large, regeneratable).

## [0.3.22] - 2026-07-14

**Capability diagnostic** — a self-test that *measures* exactly what a TV's native decoder handles, so playback can go native-first with hls.js as a true last resort.

### Added

- **Capability matrix** (`packages/api/.../capabilities/matrix.ts`) — the single source of truth: an axis-comprehensive set (every container, video codec, audio codec, HDR feature, a bitrate/fps ladder, subtitle types, edge cases; ~45 tests). `realSample` flags the few ffmpeg can't fabricate (Dolby Vision / Atmos / DTS-HD MA / HDR10+ / PGS).
- **Media generator** (`apps/server/scripts/gen-capability-media.ts`) — ffmpeg fabricates a 5s clip per entry from one master source, driven by the matrix.
- **Server-hosted probe** — the backend serves the clips as public static files at `/caps/media/*` (played via `<video src>`, which can't carry a token), plus `GET /api/v1/caps/manifest` and `POST /api/v1/caps/result`. New `DeviceCapability` table (upsert per device+test) stores the measured map.
- **Visual Diagnostic screen** (tv-web, "Run diagnostic" on Home) — plays each clip **full-screen**, auto-detects decode (`videoWidth×videoHeight`) + dropped frames (`getVideoPlaybackQuality`), and prompts a remote **👍/👎** for the subjective axes JS can't see (audio present? HDR triggered? subs shown?). Live results list down the side; everything saved to the device's capability map.

### Notes

- To run it: generate clips into the server's `CAP_MEDIA_DIR` (default `./capability-media`) with the generator + a master, drop the real-sample files, restart the server. Then "Run diagnostic" on the TV grinds the matrix and records the true, measured capability set. Native-first playback off that map is the next step.

## [0.3.21] - 2026-07-14

Playback logging (tests record themselves) + remote Back fix. Confirmed 4K HDR HEVC direct-stream on the real C2.

### Added

- **Playback log** — a `PlaybackLog` table + `POST /api/v1/playback/log`. Every tune records its full diagnostics to the DB (channel, source container/codec, Plex decision, advertised caps, **outcome** = playing / not_decoding / error, decoded `videoWidth×videoHeight`, `readyState`, error) ~6s after it settles, or immediately on error. Test results are now reviewable in the DB instead of squinting at the overlay.
- **Real device facts captured** — the webOS Luna probe now records the true panel: the C2 shows `OLED77C2AUA` / webOS `9.2.2` / `3840×2160` / UHD (vs the old bogus 1080p canvas).

### Fixed

- **Remote Back** now returns to the guide from a playing channel instead of triggering webOS's "close app?" prompt — `preventDefault` on the Back key (keyCode 461) in the capture phase.

## [0.3.20] - 2026-07-14

TV-client instrumentation & navigation — so we can *see* what's playing and drive it with the remote.

### Added

- **Rich playback debug overlay** (Watch view) — shows whether frames are actually decoding (`video.videoWidth×videoHeight`; **0×0 = not decoding**), Plex's real decision (video/audio `copy` vs `transcode` + output container), the source codec, `readyState`, `currentTime`, buffered seconds, and any error. **OK** toggles it, **Back** exits to the guide.
- **webOS Luna device probe** — via `PalmServiceBridge` (`com.webos.service.tv.systemproperty/getSystemInfo`) we now read the **real model / 4K (UHD) / firmware** and merge them into the device report, so `TvDevice` reflects the actual panel instead of the 1080p web canvas.
- **D-pad navigation** for the channel grid — arrow keys move a focus ring (with scroll-into-view), **OK** tunes. The channel list is finally usable with the remote instead of the Wii pointer.
- **Plex decision surfaced** — `getPlaybackInfo` parses `/decision` and returns `{ videoDecision, audioDecision, output codec/container }` through `/api/v1` media, feeding the debug overlay.

### Notes

- Confirms via the profile dump (`.docs/plex-profiles/`) that Plex's built-in TV profiles (e.g. **HTML TV App**) cap at **1080p/8-bit/h264-only** — inheriting them would cripple the C2, so our custom `-Extra` (HEVC copy → fMP4, HDR preserved) is the right path. Full spatial-nav (norigin) for the whole app is still a follow-up.

## [0.3.19] - 2026-07-14

**TV playback on real hardware (H2)** + **device-aware Plex profiles** — the app runs on a real LG C2 and direct-streams 4K HDR HEVC with no re-encode.

### Added

- **webOS TV app playback** — tune a channel → resolve what's on now at the live offset → play (hls.js / native) with an on-screen diagnostics readout; clickable channel list. `apps/tv-web/src/features/watch`.
- **Device capability reporting** — a `TvDevice` table + `POST /api/v1/devices/report`. On sign-in the TV probes its real `<video>.canPlayType` + `MediaSource.isTypeSupported` matrix (plus HDR / color-gamut / screen / UA / webOS version) and persists it (upsert by a stable `deviceId`). This is the data behind the codec probe — e.g. the real C2 reports HEVC-10/AV1/Dolby-Vision/AC3/E-AC3 while the desktop/Simulator don't.
- **Device-aware playback** — the TV sends its real codec caps with each media resolve; `getPlaybackInfo` uses those (not the hardcoded browser assumption) to choose direct-play / direct-stream / transcode and builds a matching `X-Plex-Client-Profile-Extra` with `X-Plex-Platform=Generic`. Crucially it packages HLS as **fMP4** (not MPEG-TS), so HEVC is **copied** rather than re-encoded — verified live: 4K HEVC + E-AC3 → `copy`, fMP4, **HDR (HLG) preserved**, zero transcode.
- **webOS packaging** — `appinfo.json` + icon, `base: "./"` relative assets; build → `ares-package --no-minify` → `ares-install`. Confirmed running on a real LG C2 (Chromium 108).

### Changed

- **CORS split for installed apps** — the **bearer** surface (`/api/v1`, `/api/tv/auth`) is now permissive (any origin, credentials off — safe, no cookies), so an installed webOS app (unknown / `file://` / null origin) can reach the API; the **cookie** surface (`/trpc`, web `/api/auth`) stays locked to the allowlist. New optional `TV_APP_ORIGIN` env for dev.

### Notes

- Caps are still a conservative `canPlayType` guess (misses DTS/TrueHD, and HDR/resolution come from the wrong web APIs) — real **webOS Luna `deviceInfo`** is next. **native vs hls.js** playback under evaluation. Plex has **no LG/webOS profile** and its generic TV profiles **re-encode HEVC**, so our custom `-Extra` is the better path — findings in `.docs/plex-profiles/`.

## [0.3.18] - 2026-07-13

The **second TV login flow** — ChannelGuide device-code — completing the auth story. Verified end-to-end.

### Added

- **"Log in with a code"** on the TV app — the ChannelGuide **device-code flow** (better-auth `deviceAuthorization`, RFC 8628) for **any** account (email/password, Google, GitHub, or Plex-linked), not just Plex-imported users. The TV shows a short **4-char code** + a **QR** (to the pre-filled approval page); the user approves on their phone; the TV polls and signs in with a bearer token. Parallel to the Plex `plex.tv/link` flow.
- **`/device` approval page** (`apps/web`) — a logged-in user confirms the TV's code. Does the two-step better-auth requires: **claim** the code (`GET /device?user_code=…`) then **approve**/deny.
- **QR codes** on the TV login (via `qrcode`) — to the device approval page (`verification_uri_complete`, code pre-filled) and to `plex.tv/link`.

### Changed

- `deviceAuthorization` now points `verificationUri` at the **web app's** `/device` (absolute, `${CORS_ORIGIN}/device`) so the QR/verification URL is reachable, and sets **`userCodeLength: 4`** for a Plex-style short code (default is 8).

### Notes

- **Verified end-to-end in-browser:** short code → approve at `/device` → TV polls → signed in → authenticated `/api/v1`.
- **Dev caveat:** the QR points at `CORS_ORIGIN` (`localhost:3001`), reachable only on the dev machine; set `CORS_ORIGIN` to the LAN IP to scan from a phone.

## [0.3.17] - 2026-07-13

The **webOS TV app is born** (`apps/tv-web`) — scaffold + working Plex login, verified in a browser.

### Added

- **`apps/tv-web`** — a plain Vite + React app (developed in-browser first, packaged for webOS later), auto-included in the monorepo `pnpm dev` (port **3002**). Bearer-token native (TV clients carry a token, not cookies): a better-auth client configured to capture the `set-auth-token` header → localStorage and send `Authorization: Bearer`, plus a thin `api.ts` for the custom REST/`/api/v1` + Plex-link endpoints.
- **TV login screen** with two paths: **"Log in with Plex"** (the `plex.tv/link` flow — shows a code, polls, signs in) and **"Log in with a code"** (ChannelGuide device-code, wired next once the `/device` approval page exists). After sign-in, a Home screen loads `/api/v1/channels` with the token to prove the authenticated API. **Verified end-to-end in a browser**: Plex login → bearer → 136 channels listed.
- **`TV_APP_ORIGIN`** (optional server env) — allowed through Hono CORS + better-auth `trustedOrigins` so the TV app's origin (dev `:3002`, later the webOS origin) can call `/api/auth`, `/api/tv/auth`, and `/api/v1`.

### Notes

- **CORS for installed webOS apps** (unknown/`file://` origin) will switch the **bearer** API surface to permissive CORS (safe — no cookies there); the per-origin allowlist is just for dev.
- **Next:** the login **QR code** (to the device page / plex.tv/link) + the ChannelGuide device-code flow, and the **`/device`** approval page on the admin web.

## [0.3.16] - 2026-07-13

**TV device-code login (H5)** — how the webOS app authenticates, reusing the existing Plex identity path.

### Added

- **TV login via Plex's `plex.tv/link` device flow.** New unauthenticated endpoints `POST /api/tv/auth/plex/start` (returns a short `code` + `verificationUrl` + `pinId`) and `POST /api/tv/auth/plex/poll` (`{ pinId }` → `pending` / `expired` / `unregistered` / `ok`). The TV shows the code, the user enters it at **plex.tv/link** against their logged-in Plex account, and the TV polls until approved. This reuses the **exact identity path** of the web "Sign in with Plex" (genericOAuth): Plex pin → user's Plex token → Plex account email → **match an existing ChannelGuide account by email** (login-only — an unregistered Plex email is rejected, provisioning stays "Import Plex Users"). The only difference from the web flow is acquisition (a typed code vs a browser redirect). On success we mint a better-auth session server-side (`auth.$context.internalAdapter.createSession`) and return its token; the TV carries it as `Authorization: Bearer <token>` on every `/api/v1` call. `services/auth/tv-plex-link.ts` + `apps/server/src/tv-auth.ts`.
- **`createLinkPin()`** (`packages/auth`) — creates a **non-strong** Plex pin (the plain 4-char code for plex.tv/link), distinct from the web login's strong pin (a long code for the `app.plex.tv/auth` redirect).

### Notes

- We do **not** use the RFC-8628 `deviceAuthorization` plugin for this — Plex's own device PIN replaces it (the plugin stays configured as a possible fallback for non-Plex accounts). The `bearer` plugin (v0.3.15) is what makes the minted session a token the TV sends.
- **Verified live end-to-end:** `start` → entered code at plex.tv/link → `poll` returned `ok` + a session token → that token authorized `/api/v1` (matched the admin by email; no-token requests 401). No TV UI drives it yet — that's H4.

## [0.3.15] - 2026-07-13

Opens the **TV-client arc (H1)** — a REST guide/playback API for the TV apps, sitting alongside the existing tRPC admin surface.

### Added

- **REST guide/playback API** at `/api/v1` (`apps/server/src/rest.ts`) for heterogeneous TV clients (webOS first) — the parallel to the admin tRPC surface. Endpoints: `GET /channels` (lineup), `GET /guide` (cross-channel grid), `GET /qualities`, `GET /channels/:id/timeline`, `GET /channels/:id/now`, `GET /channels/:id/media` (playable URL for a ratingKey+offset), `POST /channels/:id/stop` (transcode teardown), `POST /sessions/heartbeat`, `POST /sessions/end`, and `GET /sessions` (admin-only "Now Watching"). Auth is **viewer-level** (any authenticated user, not admin) via `Authorization: Bearer <token>` or a session cookie; playback still brokers the **admin's** media-source connection for everyone (architecture §10).
- **better-auth `bearer` plugin** — sessions can now be carried as a bearer token instead of a `sameSite:none` cookie, the auth model for native/TV clients. On sign-in the token comes back in the `set-auth-token` response header. This is also the missing half of the future TV device-code flow (the already-configured `deviceAuthorization` plugin mints the session; `bearer` makes it a token the TV app can send).

### Changed

- **Playback/guide logic extracted into shared services** (`services/errors.ts`, `services/playback/broker.ts`, `services/playback/sessions.ts`, `services/guide.ts`) so the tRPC admin router and the new REST API call **one** implementation — no duplication. The tRPC `playback.*` procedures and `channels.guide` are now thin wrappers over these services (behavior unchanged; the admin preview is unaffected). Services throw a transport-neutral `ApiError` that each transport maps (tRPC → `TRPCError`, REST → HTTP status).

### Notes

- **Transport decision:** the webOS client is a React app and *could* consume tRPC directly, but we keep tRPC for the in-monorepo admin and expose REST for the TV apps (and future non-JS / third-party clients / IPTV) — both over the shared services, so neither is gutted.
- **Verified live** (v0.3.16): `/channels`, `/guide`, `/qualities`, `/channels/:id/{now,timeline,media}`, and `/stop` all return correct data with a real bearer token minted via the TV Plex device-link flow; no-token requests 401; a resolved transcode was torn down cleanly via `/stop`.
- **Follow-up (H2/H4):** the global CORS still allows only the admin web origin; when the webOS/TV origin is known, add it to `CORS_ORIGIN` + auth `trustedOrigins` (bearer/native fetch isn't subject to CORS). Next arc is the **webOS capability probe (H2)** now that auth + API are proven.

## [0.3.14] - 2026-07-13

### Fixed

- **Subtitles now render for every subtitle format** — the 0.3.13 fix only covered text (SRT). Image subtitles (**PGS/VOBSUB**, common on Blu-ray rips) still showed nothing because Plex honors the URL `subtitleStreamID` param **inconsistently per codec** (text burns via `subtitles=burn`, image only via `subtitles=auto`, etc.), so the burn was silently dropped (`subtitleDecision: none`). The reliable, universal fix: **select the subtitle with a server-side PUT** (`PUT /library/parts/{partId}?subtitleStreamID={id}&allParts=1`) instead of the URL param, then `subtitles=burn` + `directStream=0`. Verified live that this yields `subtitleDecision: burn` for **both** text (SRT → Andor) and image (PGS → Fast X) subs; turning subtitles off clears the selection. NB: PUT-select is per-part *global* Plex state (shared across viewers of an item) — fine for the single-admin preview, to revisit for multi-user. Full matrix in `.docs/plex-subtitles-findings.md`.

## [0.3.13] - 2026-07-13

### Fixed

- **Subtitles now actually render when selected.** We set `subtitles=burn` but left `directStream=1`, so Plex **copied** the video and silently dropped the burn — nothing appeared. Burning requires the video to re-encode, so `directStream=0` is now set **only when a subtitle is selected** (normal, subtitle-off playback stays a video copy — no re-encode). Verified against the server: our request registers `subtitleDecision: "burn"` and decision→start returns 200. For **complex styled ASS** (anime karaoke/positioning) and **image subs** (PGS/VOBSUB), burning is exactly what **Plex Web itself does** — confirmed by a live Plex Web session on this content showing `subtitleDecision: "burn"`. Also prefers the full (non-forced) subtitle track for a language.

### Notes

- Simple text subs (SRT/VTT) *can* be delivered **soft** (no re-encode) via `subtitles=sidecar|segmented` + `advancedSubtitles=text` (per the Plex OpenAPI) — but that needs the exact Plex client-capability profile plus a client-side WebVTT renderer, so it's deferred to the real web/TV client. For complex ASS / image subs Plex burns regardless, so burn is the correct path there.

## [0.3.12] - 2026-07-13

### Added

- **Audio-track & subtitle selection + native player controls.** The player exposes each item's audio and subtitle **languages** (from Plex stream metadata) as dropdowns — switch the audio track (e.g. anime **Japanese → English dub**) or turn on **burned-in subtitles** in any language. Selection is **by language so it carries across episodes**, and prefers the full (non-forced) subtitle track. Changing it re-resolves the stream at your current spot — a brief reload, same as quality/rewind and exactly how Plex's own web player behaves (you can't hot-swap audio inside a running transcode). Verified against the server: audio switch and subtitle burn both return 200. Also added native **volume + mute** and **fullscreen** controls. All selections persist per-browser.

### Changed

- `getPlaybackInfo` now takes a `PlaybackOptions` object (`quality` / `audioLang` / `subtitleLang`) and returns the available `audioTracks` / `subtitleTracks`; `playback.media` passes them through. The player's `quality` param generalized to a single stream-params key, so a change to quality, audio, or subtitles re-resolves at the current position via the same mechanism.

## [0.3.11] - 2026-07-13

### Changed

- **Smoother player, fewer re-renders.** The 500ms player tick called `setState` unconditionally, re-rendering twice a second even when nothing visible changed — which, with dev-mode main-thread jitter, made the bumper countdown tick unevenly (a second would "stick" then jump). The tick now returns the same state object (React skips the re-render) unless a displayed value actually changed, so it re-renders ~once a second during a countdown instead of continuously. (All network calls — heartbeats, `media`/`timeline` resolves — were already non-blocking/async, and the bumper clock advances by real elapsed time, so the *timing* was always exact — only the on-screen number was jittery.)

## [0.3.10] - 2026-07-13

### Fixed

- **Quality dropdown did nothing.** Changing streaming quality re-resolves the current program at the same position, but the player's "already playing this here — skip the reload" guard only compared position, not quality, so it treated the quality change as a no-op and kept the old stream. The guard now also compares the resolved quality, so switching presets actually re-loads with the new cap. (Server-side capping was already correct — verified a preset drops the stream from ~10 Mbps/1080p to ~1.4 Mbps/720p.)

## [0.3.9] - 2026-07-13

### Added

- **Resume on reload.** The player remembers your exact spot on a channel — the **absolute timeline position** (not "seconds behind," since live keeps moving) — in `localStorage`, and resumes there on reload instead of snapping to live. So seeking back and reloading keeps your place (you just end up a little further behind live, DVR-style). Scoped to the **current channel** (switching channels overwrites it, so an old channel starts at live) and **capped**: if you were at the live edge, or walked away longer than ~6h, or the spot has aged out of the retained schedule window, a reload just goes live. The server `WatchSession` now also records `positionAt` (for the "Now Watching" view + future cross-device resume).

## [0.3.8] - 2026-07-13

### Fixed

- **Transcoded streams 400'd on reload / when starting at a large offset** (black player). We requested Plex's `transcode/universal/start.m3u8` directly, but for media that needs a real transcode decision (e.g. an mkv/DTS movie) Plex **400s `start` unless `…/transcode/universal/decision` is called first** to register the session — the documented two-step flow. `getPlaybackInfo` now calls `decision` (same session + params, `hasMDE=1`) before returning the `start` URL. Verified against the server: item 16151 at offset ≥600 went **400 → 200** with the decision step. This is why a channel played on first tune-in (small offset) but reloaded to black (fresh `start` at a large offset). Also added hls.js error surfacing (+ `[player] hls error` logging) so a failed stream shows an error instead of a silent black frame.

## [0.3.7] - 2026-07-13

### Fixed

- **Channel up/down now actually switches channels.** Navigating between `/watch/$channelId` values reused the same mounted component, so the player kept the previous channel's state and never re-bootstrapped. The player is now **keyed by `channelId`**, so each channel is a clean remount.
- **Reload / returning to a channel no longer leaves a black player.** A reload has no user gesture, so the browser blocked `video.play()` and we silently swallowed it. Autoplay-blocked is now surfaced as a **"Click to play"** overlay (and any user-gesture control clears it), so playback starts on the click instead of hanging black.

## [0.3.6] - 2026-07-13

### Added

- **Streaming quality selector** on the player — the same Plex-style ladder the Plex apps expose: **Original** plus standard presets (20/12/10/8 Mbps 1080p, 4/3/2 Mbps 720p, 1.5 Mbps 480p, 720/320 Kbps). "Original" keeps the existing path (direct-play when the file is browser-friendly, uncapped transcode otherwise); **selecting a preset forces a capped transcode** — `maxVideoBitrate` + `videoResolution` + `videoQuality` — and advertises a browser capability profile (`X-Plex-Client-Profile-Extra`), so we exercise the full Plex transcode-decision flow ahead of the TV app. Persisted per-browser; changing it re-resolves the current program in place. `plex/quality.ts` (`QUALITY_PRESETS`) + `playback.qualities` + `quality` on `playback.media`.

## [0.3.5] - 2026-07-13

The viewer half, proven in the browser — a full channel player, a cross-channel guide grid, and in-house watch-session tracking. **Verified live.**

### Added

- **Channel player** (`/watch/$channelId`): the `effectiveTime`/`delaySeconds` state machine from `.docs/playback-model.md` — plays what's on now at the live offset, **auto-rolls at boundaries** (program → interstitial "We'll be right back / Up Next" card with countdown → next program), controls (pause, −15s / −1m rewind, **Jump to Live**, Restart), a **no-future-seek** forward wall, a Live/behind-live badge, and **channel up/down** surfing. Direct-play for browser-friendly files (client seeks to the offset); `hls.js` for transcoded ones.
- **Cross-channel guide grid** (`/guide`): every enabled channel × a time window, program blocks sized by duration, a live "now" line, click-to-tune. Sidebar **Guide** entry.
- **In-house watch sessions** (`WatchSession`) — our own "Now Playing" since we don't report to Plex: heartbeat-based `playback.heartbeat` / `endSession` / `sessions`, a **Now Watching** strip on the guide, and a `watch-session-reap` job that clears stale sessions + stops their transcodes.
- **Playback brokering**: `playback.timeline` (window), `playback.media` (ratingKey + offset → playable URL), `playback.stop` (transcode teardown), `channels.guide` (one-query grid). `getPlaybackInfo` returns a **unique per-resolve session id** (+ `X-Plex-Session-Identifier`) so transcodes are stoppable; `stopTranscode`.

### Fixed

- **HLS playback position.** Plex timestamps HLS transcode segments at the *original media position*, so `video.currentTime` starts at the offset, not 0. The player now captures the true baseline from the first `playing` event and measures progress as a delta — fixing a rollover loop that re-resolved to live every ~1s on transcoded channels. Unique session ids also fixed a "stop the transcode we just started" collision.

## [0.3.4] - 2026-07-13

Playback spike — proves direct-play-from-Plex-at-offset in the browser (the go/no-go before the webOS client). **Verified live**: a channel started playing exactly at its live offset via Plex HLS transcode, no CORS issues.

### Added

- **`getPlaybackInfo`** (Plex client) — resolves a `ratingKey` + offset into a playable URL: `direct` (browser-friendly mp4/h264/aac → original file, client seeks to the offset) or `hls` (everything else → Plex's transcode-universal endpoint with the offset applied server-side).
- **`playback.resolve({channelId})`** tRPC — resolves `getNowNext` into `{ mode, url, offsetSeconds, guide, next }` for a program (or `bumper`/`off` state).
- **`/watch/$channelId`** admin preview page — a `<video>` that plays what's on now at the live offset (native + client-seek for direct, `hls.js` for transcode), with a now-playing/offset/codec readout and up-next. **Watch** button on the channel page. Added `hls.js`.

### Notes

- Playback does **not** report a Plex session/watch-state (intentional — no history pollution; all playback is via the admin connection). Transcode sessions currently linger until timeout; a clean stop-on-teardown lands with the real player. See `.docs/playback-model.md` §8a.

## [0.3.3] - 2026-07-13

### Added

- **Missing-media repair.** Removal detection already flagged vanished items `available = false`, but nothing acted on it — schedules built on now-gone media kept pointing at dead `ratingKey`s. New `repairChannelSchedule` + a `schedule-missing-media-repair` job (hourly) **splice-repair** the affected channels: find the earliest upcoming slot referencing unavailable media (a program pointing at gone media, or a bumper introducing one), then re-flow the timeline from that point with the current live pool — which no longer contains the removed items. What's on now and still-valid near-term slots are left untouched (a 5-min buffer), and a preceding intro bumper is spliced out so there's no "Up Next: <removed>" break. No-op when nothing's broken. Closes the missing-media reconciliation follow-up.

## [0.3.2] - 2026-07-13

### Added

- **Contextual break lengths.** Interstitial duration is now chosen per program transition instead of a single fixed value — a `breakSeconds(prev, next)` classifier (first match wins): same show continues → **quick**, after a movie → **afterMovie**, short episode up next → **quick**, after an episode → **afterEpisode**, else **default**. Every tier + the short-episode-minutes threshold is configurable on the Bumpers page. Verified: movie→movie 120s, same-show 10s, ep→short-ep 10s, ep→diff-show 30s, movie→short-ep still 120s (after-movie wins).
- **Immediate reconcile.** Changing a channel's bumper mode, or saving the Bumpers page, now fires the `schedule-bumper-sync` job right away (fire-and-forget) rather than waiting for its 10-min cron — it self-throttles and no-ops when nothing is stale.

### Changed

- **Bumper Sync now reconciles via a config-revision stamp** instead of comparing each slot to one length (which broke once break lengths legitimately vary). `BumperConfig.rev` bumps on every settings save; each schedule is stamped with the rev it was built under (full rebuild only, not `extend`), and the job rebuilds any channel whose stamp is behind — catching *any* settings change (tiers, threshold, style), not just length.

### Schema

- `BumperConfig`: `afterMovieSeconds` (120), `afterEpisodeSeconds` (30), `quickSeconds` (10), `shortEpisodeMinutes` (20), and `rev`. `Channel.bumperRev` — the config rev its schedule was last built under.

## [0.3.1] - 2026-07-13

### Changed

- **Bumper Sync now also reconciles break-length changes.** Previously the job only detected bumper *presence* mismatches (toggled on/off), so changing the interstitial length left already-built schedules on the old length until their next natural rebuild. It now also flags any channel whose existing interstitial slots' `durationSeconds` no longer match the configured length and rebuilds them. The duration check is restricted to `bumperKind: "interstitial"` slots so future commercial clips (which carry their own media durations) aren't falsely flagged.

## [0.3.0] - 2026-07-13

Opens the 0.3.x line. **Bumpers** — deterministic between-program interstitial breaks (the engine + admin half; the on-screen card lands with the viewer).

### Added

- **Interstitial breaks woven into the timeline.** `buildSchedule` now inserts a `BUMPER` slot before each program (never before the very first slot, so a mid-stream tune-in isn't preceded by a break). Each interstitial has no media of its own — it's a client-rendered *"We'll be right back → Up Next: {title}"* card with cover art + countdown — and references the **upcoming program's** `MediaItem` (`targetMediaItemId`) so the client has the title/art/start-time. Fully deterministic (fixed duration, target derived from the schedule) so every client stays aligned. Verified: 48 programs → 47 breaks, each targeting the next program, deterministic across builds.
- **Global bumper config (singleton) + thin per-channel override.** A new **Bumpers** page owns the content — `enabled` master switch, interstitial length (default 8s, "long enough to stretch"), and an optional music bed (wired for later). A channel only picks a **mode** (`INHERIT | OFF | INTERSTITIAL_ONLY | FULL`) on its edit page — never a source. `bumpers` tRPC router + `channels.bumperMode`.
- **Bumper Sync job** (`schedule-bumper-sync`, every 10 min): reconciles existing schedules when bumpers are toggled on/off (globally or per channel) — rebuilds the channels whose bumper presence is stale, a batch at a time, then idles.
- The channel Schedule card shows breaks inline (`▸ Break — Up Next: …`) and the generate summary reports programs + breaks separately.

### Schema

- `BumperConfig` is now a **global singleton** (`key = "global"`) with interstitial fields + future commercial/mid-program fields (nullable, unused). `Channel.bumperMode` enum. `ScheduleItem`: `ratingKey` nullable (interstitials play nothing), new `bumperKind` + `targetMediaItemId` (FK → `MediaItem`).

### Notes

- Between-programs only for now; the schema leaves room for **commercials-within-the-interstitial** and a **mid-program cadence** (both deferred). Rendering the card + playing media bumpers arrives with the viewer/playback half.

## [0.2.10] - 2026-07-13

### Fixed

- **Filter builder crashed when editing some auto-generated channels** (`Cannot read properties of undefined (reading 'map')`). Presets whose filter is a **single bare condition** (e.g. Quick Bites = `duration ≤ 45`, Movie Marquee, Just Added) store a `condition` node, but the builder's `GroupEditor` assumed a `group` root and read `.children`. Loaded filters are now normalized into a root group — a bare condition is wrapped in an AND group and missing `id`s are backfilled — before the builder renders. The resolver already accepted either shape, so resolution is unchanged; re-saving such a channel just upgrades its stored filter to the wrapped form.

## [0.2.9] - 2026-07-13

### Added

- **Job descriptions.** Every background job definition now carries a one-line `description`, threaded through `JobStatus` and shown on the **Settings → Jobs & Cache** page beneath the job name — so each job explains what it does at a glance. Descriptions live in code (`JOB_DEFINITIONS`) alongside `name`, not in the DB (the `Job` table stays editable-cron + last-run only).

### Docs

- `.docs/jobs.md` refreshed to document all **8** jobs (was 5): adds `schedule-backfill`, `schedule-prune`, and the manual `lineup-generate`, plus the new `description` field and the schedule-refresh/backfill interplay.

## [0.2.8] - 2026-07-12

### Added

- **Schedule Backfill** job (`schedule-backfill`, every 10 min): builds the **initial** schedule for enabled channels that don't have one yet — a small batch (10) per run, with progress — then idles when caught up. Fills the gap where the auto-generator creates channels but nothing built their schedules (Schedule Refresh only *extends* existing timelines; it no-ops on empty channels). Also picks up any newly-generated channels automatically.

## [0.2.7] - 2026-07-12

### Fixed

- **Schedule generation crashed** with "value out of range for type integer" — the shuffle-seed FNV-1a hash returned an *unsigned* 32-bit value (up to ~4.29B), overflowing Postgres `Int` (signed, max ~2.15B). `deriveSeed` now returns a **signed** 32-bit int; the PRNG re-normalizes with `>>> 0` at use, so shuffle output is unchanged.

## [0.2.6] - 2026-07-12

Channel **callsigns** (BunnyEars-style short codes, e.g. `EVRTV`).

### Added

- `Channel.callsign` — a short memorable code (uppercase, alphanumeric, ≤6). Every preset in the catalog now carries its BunnyEars callsign, and the generator writes it on created channels (de-duped against existing ones). A **Callsign** field on the channel form (auto-uppercases, capped at 6) and the code shown in the channel list.
- **`callsign.ts`** helpers (`normalizeCallsign`, `deriveCallsign`, `uniqueCallsign`) + a **backfill script** (`apps/server/scripts/backfill-callsigns.ts`): sets callsigns on generated channels missing one — by `presetKey` where possible, else derived — de-duped. Run with `bun --env-file=.env run scripts/backfill-callsigns.ts`.

### Verification

- All 184 preset callsigns are valid (≤6, uppercase) and unique. `pnpm check-types` passes.

## [0.2.5] - 2026-07-12

### Added

- **Progress bar on the Jobs page** — a running job (e.g. Auto-Generate Lineup, Metadata Sync) now shows its live progress (label + current/total bar), not just a spinner. The page also polls faster (1.5s) while any job is running.

## [0.2.4] - 2026-07-12

Grow the preset catalog (23 → 184 channels).

### Added

- The auto-lineup preset catalog now spans **15 packages / 184 channels** — every BunnyEars preset that maps to our real filter primitives: **Basic, Kids & Family, Comedy, Drama, Action & Sci-Fi, Crime, Horror, Documentary, International** (country-based), **Time Machine** (decades), **Director's Chair** (25 directors), **Star Power** (23 actors), **Studio Spotlight** (17 studios), **Curated & Mood**, **Special Purpose**. Rating/recency/"top" channels use the new **Sorted** ordering (e.g. Critics' Choice by critic rating desc, Just Added by date added desc). The analyzer auto-skips any preset your library can't fill.

### Notes

- Not yet included: the **keyword-driven** channels (heist, zombies, time-travel, franchises) — they need the deferred keyword/TMDB system — and the **68 music stations**, which need a music media-type + music filter fields.

## [0.2.3] - 2026-07-12

Granular lineup regeneration + a schedule-prune job.

### Added

- **Granular regen** — the generator now takes a **scope**: `all` (full rebuild, the Auto-generate button), `packages` (refresh only package styling/metadata), or a **single package** (rebuild just its channels). Packages upsert by key so ids stay stable across regens; empty generated packages are pruned. `generator.regeneratePackage` / `regeneratePackages` tRPC + buttons: **Regenerate channels** on a generated package's page, **Refresh styling** on the Packages list (with an "Auto" badge on generated packages).
- **Schedule Prune** job (`schedule-prune`, daily 02:00): deletes passed schedule slots (older than a 6h safety buffer, so a currently-playing long item is never cut).

### Verification

- `pnpm check-types` passes.

## [0.2.2] - 2026-07-12

Channel **sort ordering** — Plex's full sort set, not just shuffle.

### Added

- A channel is now **Shuffle** (seeded, as before) or **Sorted by…** a Plex sort field with a direction: **Title, Year, Release date, Critic rating, Audience rating, Personal rating, Content rating, Duration, Plays, Date added, Date viewed, Resolution, Bitrate**. `SORT_FIELDS` catalog + `channels.sortFields`; `Channel.sortField` + `sortDir` on the schema; sort controls on the channel form (shown when not shuffling).
- How it fits the engine: **Plex does the sort** (`resolveFilter` passes `sort=field:dir`), and the **schedule engine preserves that order** for non-shuffle channels (shuffle still reshuffles per pass, seeded). `resolveChannel` now shares `resolveFilter` and computes the sort via `channelSortParam`.

### Verified

- `year:desc` returns newest-first; sort-param building checked for all fields. `pnpm check-types` passes.

## [0.2.1] - 2026-07-12

**Auto-lineup generator** — foundation (BunnyEars' headline "machine-learned" feature, done as deterministic presets).

### Added

- **Provenance flags**: `Channel.generated` + `presetKey`, `ChannelPackage.generated`. Regeneration deletes + rebuilds only auto-generated content — manual channels/packages are never touched.
- **Preset catalog** (`services/generator/presets.ts`): packages of channel presets, each a filter tree + minimum-item threshold + icon/tint/number. Starter set = **Basic**, **Time Machine** (decades), and **Genres** (~23 channels); structured to grow toward the full 425.
- **Generator** (`services/generator/generate.ts`): for a source, evaluate every preset against the library (via the shared `resolveFilter`) and instantiate the ones with enough content — skipping presets your library can't fill (e.g. no 4K → no "Ultra HD Theater"). Channel numbers auto-avoid collisions with manual channels.
- Runs as a **manual background job** (`lineup-generate`) with live progress (reusing the sync-button pattern); an **Auto-generate** button on the Channels page (with confirm). Verified live: 3 packages / 23 channels in ~60s.
- Job scheduler gained a **`manual`** flag — such jobs are run-now only, never auto-scheduled.

### Notes

- Generated channels get schedules on the next Schedule Refresh (or manual generate). Granular regen (channels-only / one package) and the full 425-preset catalog are follow-ups.

## [0.2.0] - 2026-07-12

Opens the 0.2.x line. Channel **active/inactive** toggle.

### Added

- **Channel active flag** wired through (the `Channel.enabled` field already existed and the schedule-refresh job already skips disabled channels — it just had no UI): an **Active** checkbox on the channel form, a per-row **quick toggle** + dimmed "Inactive" state on the channels list, and `channels.setEnabled`. Inactive channels won't be selectable in the guide.

## [0.1.17] - 2026-07-12

Complete filter parity — every field Plex exposes in advanced filtering is now available.

### Added

- The remaining Plex advanced-filter fields, for completeness: **Personal rating**, **Play count**, **Last watched**, **Common Sense age**, **Edition**, **Folder location**, **Has unwatched episodes** (`unwatchedLeaves`, TV), **Episode year**, and the maintenance flags **Unmatched / Duplicate / In trash**. Each carries its level (`show.`/`episode.`) and applicable media types like the rest.

### Verification

- `pnpm check-types` passes.

## [0.1.16] - 2026-07-12

Filter catalog expanded to Plex parity (was a hardcoded subset).

### Added

- Filter fields now mirror Plex's advanced-filter set, each with the correct level + applicable media types:
  - **Show title vs Episode title** (the split Plex exposes for TV): `title` → movie title / `show.title`; new `episodeTitle` → `episode.title`.
  - **Network** (TV), **Writer**, **Producer**, **Audio language**, **Subtitle language**.
  - **Release / air date** (`originallyAvailableAt`, episode-level for TV) and **Added within N days** (`addedAt>=-Nd` — Plex relative-date recency, for "fresh/just added" channels).
  - **HDR**, **Dolby Vision**, **In progress** booleans (episode-level for TV).
- Fields carry an `appliesTo` so a filter that can't apply to a library type is skipped (e.g. Network on movies, Duration on TV — Plex has no TV duration filter). New `date` + `recency` field kinds (date-picker / days input in the builder).

### Verified

- Every new primitive checked live: `addedAt>=-30d` (3 movies / 379 eps), `originallyAvailableAt>=2020` (127 / 4304), `hdr` (228 / 619), `audienceRating`/`decade` on movies + TV, and dotted prefixing (`episode.hdr`, `show.network`, `episode.title`). `pnpm check-types` passes.

## [0.1.15] - 2026-07-12

**Fix TV filtering** (it was silently resolving to zero) + richer filter primitives.

### Fixed

- **TV filters now work.** Genre (and every show-level attribute) is stored on the *show* in Plex, but the resolver was querying *episodes* — so genre-filtered TV channels resolved to **0 items**. TV now resolves at `type=4` (episodes) using Plex's **dotted advanced-filter syntax** (`show.genre`, `episode.resolution`), which filters episodes by both show-level and episode-level fields in one query. Verified against the library (e.g. `Animation` TV → 7,276 episodes; `show.genre` + `episode.resolution` combine correctly). Each field carries a `tvScope` (`show` / `episode`); movies are self-contained and unprefixed.

### Added

- **String operators** — `contains` / `does not contain` on text fields, plus a **Title** field (Plex `title=value` is a substring match). Covers franchise/keyword-style channels the practical way.
- **Label** field — filter by your Plex labels (e.g. shows tagged `Anime` / `Kids`). `show.label` for TV.
- **Content rating** and **Resolution** are now **value-list dropdowns** (load the actual ratings/resolutions present, like genre/studio) instead of free-text — filtered by the value key (`contentRating=TV-G`, `resolution=1080`).
- Collection filtering already works as a tag field (`show.collection`), so collection-based channels need no extra machinery.

### Verification

- `pnpm check-types` passes; every primitive verified against the live Plex library via the filter-value + dotted-query diagnostics.

## [0.1.14] - 2026-07-12

### Added

- **Channel description** — the existing `Channel.description` field is now wired into the channel router (create / update / get) and a Description textarea on the channel form.

## [0.1.13] - 2026-07-12

Icon + tint system for channels and packages (virtualized picker over all of lucide + phosphor).

### Added

- **Icon picker** (`features/icons/`, adapted from GuideEngine): a virtualized (`@tanstack/react-virtual`) Base UI popover over the **full lucide + phosphor catalogs** with debounced search. Icons are stored as a single string id — **`lib:ExportName`** (`lucide:Sparkles`, `phosphor:Television`) — and resolved back via a lookup. **Phosphor renders solid** (`weight="fill"`).
- **`icon` + `tint` on `Channel` and `ChannelPackage`** (schema). A combined **`IconTintField`** (preview tile + tint swatches from the existing `TintedIconTile` tokens) on the channel and package forms.
- **Tint inheritance**: a channel's effective icon/tint follows override → its **package** → default, so tinting a package (e.g. "Kids & Family" violet) colors its channels automatically, with per-channel override + Reset.
- Tinted tiles now render in the channels and packages lists. Copied Base UI `popover` into `packages/ui`; exported `TINT_TOKENS`.

### Notes

- The lucide+phosphor catalog is a **code-split ~1.2 MB-gzip chunk** loaded only on icon pages (not in the main bundle). If that first-load cost matters, a follow-up can switch to per-icon dynamic imports.

### Verification

- `pnpm check-types` passes; schema pushed. Needs a live click-test of the picker popover.

## [0.1.12] - 2026-07-12

Channel **packages** — grouping channels into lineups (e.g. "Kids & Family").

### Added

- **`packages` tRPC router** (`list` / `get` / `create` / `update` / `remove`) over the existing `ChannelPackage` model. Create generates a unique slug `key` (so the future auto-lineup generator can upsert packages idempotently); delete leaves channels intact (unassigned) via `onDelete: SetNull`.
- **Packages UI**: `/packages` (list with channel counts) → `/packages/new` (create) → `/packages/$packageId` (rename / describe / see member channels / delete), with breadcrumbs + section icon.
- **Channel ↔ package assignment**: `channels.create`/`update`/`get` carry `packageId`; the channel form has a **Package** selector, and the channel list shows each channel's package tag.

### Verification

- `pnpm check-types` passes.

## [0.1.11] - 2026-07-12

Settings tabs + breadcrumbs (BasicTimeTracker parity).

### Added

- **Settings is now a tabbed section** (seerr-style): `/settings` redirects to **`/settings/main`** (General), with **Jobs & Cache** (`/settings/jobs`) and **About** (`/settings/about`). The tabs render into the SubHeader (HeaderLeft portal) from the settings layout route; the Jobs page moved under it.
- **Breadcrumbs** in the TopHeader (`TopHeaderLeft` portal), ported from BasicTimeTracker: `Breadcrumbs` component + `BreadcrumbProvider` / `useBreadcrumb`. Each route declares `staticData.breadcrumb` (+ section icon/tint matching the sidebar); detail pages publish a dynamic label (e.g. **Sources › _My Plex_**, **Channels › _90s Sitcoms_**, **Settings › Jobs & Cache**).

### Changed

- Sidebar "Settings" now links to `/settings/main`.

### Verification

- `pnpm check-types` passes (route tree regenerates clean).

## [0.1.10] - 2026-07-12

More jobs (incremental scan, removal detection, token check), job **progress**, and an async sync button.

### Added

- **Recently Added Scan** job (`recently-added-scan`, every 5 min): `syncRecentlyAdded` upserts just the most-recently-added items per library (movies, or episodes with their parent show backfilled via a per-item `getMetadata` call) — new content lands in the cache fast without a full scan.
- **Removal detection** folded into **Metadata Sync**: the full pass records a scan start time, and anything whose `lastSyncedAt` predates it is flagged `available = false` (not deleted) — so a schedule built on now-removed media still renders. `MediaItem.available` is now maintained.
- **Plex Token Check** job (`plex-token-check`, daily): verifies each source's owner token still works and logs if it's been revoked.
- **Job progress**: a job's `run(signal, ctx)` can call `ctx.progress({ current, total, label })`; the scheduler tracks it and `jobs.list` returns it. The sync services report per-library progress.
- Plex client: `getRecentlyAdded` (by `addedAt` desc) and `getMetadata` (single item, to backfill a missing parent show).

### Changed

- The **Sync metadata** button (source page) now **triggers the `metadata-sync` job** instead of running on the request thread — it polls `jobs.list` (2 s) to disable the button and show a **progress bar** while the job runs. Removed the synchronous `sources.syncMetadata` procedure.

### Verification

- `pnpm check-types` passes. Smoke-tested under Bun: all 5 jobs schedule with correct crons/next-run times.

## [0.1.9] - 2026-07-12

Background **job scheduler** — ported from seerr's pattern (`node-schedule`, in-process, single-instance).

### Added

- **Job scheduler** (`services/jobs/`): `node-schedule` in-process cron (no Redis / queue / external service — the right weight for a self-hosted single box). A **`Job` table** stores each job's editable cron + last-run bookkeeping; job *definitions* (name, cadence, the work) live in code. On boot, `startJobs()` registers each definition with node-schedule, seeding the default cron if absent. Runs guard against concurrency (skip if already running), record success/failure, and support cooperative **cancel** via an `AbortSignal`.
- **Three initial jobs**: **Metadata Sync** (daily 03:00 — full `syncMediaItems` across enabled sources), **Library Scan** (daily 04:00 — `syncLibraries`), **Schedule Refresh** (hourly — `extendChannelSchedule` tops up any channel running low). The registry is trivially extensible.
- **`jobs` tRPC router** (`list` / `run` / `cancel` / `setSchedule`) + a **Settings → Jobs** page (mirrors seerr's Jobs & Cache): each job with its human-readable frequency (`cronstrue`), next run, last run, **Run now** / **Cancel**, and an edit modal that builds the cron from an "every N minutes/hours/days" selector. Polls every 5s.

### Notes

- Single-instance by design (as is seerr) — on restart, jobs simply re-arm from their persisted cron. Next up: a cheap **recently-added incremental scan** (~5 min) and **removal detection** (full scan marks vanished items unavailable) — both slot into the registry.

### Verification

- `pnpm check-types` passes; schema pushed. Smoke-tested under Bun: 3 jobs schedule, next-run times compute, invalid cron rejected.

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
