# Airwave — Roku client (`tv-roku`)

The third 10-foot Airwave client, alongside `apps/tv-web` (webOS/browser) and `apps/tv-native`
(Apple TV / Android TV / iPad). **A direct port** — strict visual + functional parity with those two,
but its own separately-maintained codebase (Roku runs only BrighterScript + SceneGraph, so zero code is
shared). Parity is by discipline: track the tv-web/tv-native UI + the client-agnostic `/api/v1`.

Only two things are genuinely Roku-specific: the **capability diagnostic** (`roDeviceInfo.CanDecodeVideo`)
and the **`Video`-node player**. Everything else (guide, surf, DVR clock, bumpers, device-code auth,
sidebar lenses) is the same logic and look, re-expressed in SceneGraph — a hybrid of tv-web + tv-native.

Full plan: `.plans/roku.md`.

## Stack (all active OSS / Roku-official — no third-party framework)

- **BrighterScript** (`.bs` → `.brs`) — language (classes, namespaces, imports, async/await)
- **SceneGraph** — `.xml` components + `.bs` code-behind (no framework: Maestro is deprecated; jellyfin-roku,
  our reference, ships framework-less too)
- **roku-deploy** — zip + sideload to a Developer-Mode Roku
- **brighterscript-formatter** (`bsfmt`) + **@rokucommunity/bslint** — format + lint
- **@rokucommunity/bslib** — BrighterScript runtime shim
- (later) **rooibos** tests, **rLog** logging, **SGDEX** for higher-level components

## One-time setup

1. **Enable Developer Mode on the Roku:** on the remote press
   `Home Home Home Up Up Right Left Right Left Right` → enable dev mode → set a dev password → note the box IP.
2. **Install deps** (from the repo root — pnpm workspace):
   ```
   pnpm install
   ```
3. **Point the deployer at your box:** copy `rokudeploy.example.json` → `rokudeploy.json` (gitignored) and set
   your Roku's `host` (IP) + `password` (dev password).

## Dev loop

```
pnpm -F tv-roku build          # transpile .bs -> .brs into out/staging
pnpm -F tv-roku run sideload   # transpile + zip + sideload to the Roku (reads rokudeploy.json)
pnpm -F tv-roku format         # bsfmt --write
```

> ⚠️ The sideload script is `sideload`, NOT `deploy` — `pnpm deploy` is a **built-in pnpm command**
> (deploys a workspace pkg to a dir), so `pnpm -F tv-roku deploy` gets hijacked. Always use `run sideload`.

After `deploy`, "Airwave" should render on the TV. Watch logs over telnet: `telnet <roku-ip> 8085`
(the `ares-inspect` analog). For breakpoint debugging, use the RokuCommunity **BrightScript Language**
VS Code extension.

## Layout

```
manifest                 # app metadata (title, version [lockstep], icons/splash, ui_resolutions=fhd)
bsconfig.json            # BrighterScript build config (files, staging, bslint plugin)
rokudeploy.example.json  # copy -> rokudeploy.json (your box IP + dev password; gitignored)
source/                  # app entry + (later) API client, effectiveTime clock, caps probe, registry helpers
  main.bs                #   entry: create screen, show MainScene, run event loop
components/              # SceneGraph screens + widgets (.xml + .bs code-behind)
  MainScene.xml/.bs      #   boot scene (Stage 1) -> becomes onboarding/server-setup
images/                  # icons + splash (currently solid-navy placeholders — replace with real art)
```

## Assets TODO

`images/*.png` are placeholder solid-navy fills so the app sideloads clean. Replace with real branded art:
`icon_focus_hd` 336×210, `icon_focus_fhd` 540×405, `splash_hd` 1280×720, `splash_fhd` 1920×1080.

## Build order (see `.plans/roku.md` §9)

1. **Scaffold + boot** ← _you are here_ (prove the toolchain renders on a real Roku)
2. Onboard + device-code auth (registry-stored server URL + bearer)
3. Capability diagnostic (`CanDecodeVideo` → `ClientCaps` → `POST /devices/report` + `/caps/result`)
4. Playback spike (`Video` node + `GET /channels/:id/media` direct-play → the `effectiveTime` clock)
5. Guide + surf + player chrome
6. Sessions / favorites / recents / bumpers
7. Polish + Channel Store submission
