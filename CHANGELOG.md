# Changelog

All notable changes to ChannelGuide are documented here.

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
