# Airwave Desktop (`apps/desktop`)

A **tray-only Electrobun supervisor** that runs the Airwave stack — embedded Postgres + the server + the
admin + tv-web — on local ports, next to Plex on a Win/Mac/Linux machine. **No embedded webview: the browser
is the UI** (the tray's "Open Admin" opens `localhost:<adminPort>`). Real TVs on the LAN connect to this
machine's LAN IP. It mirrors `docker/entrypoint.sh` (`CG_ROLE`) natively.

Full plan + open decisions: **`.plans/desktop-server.md`**. Reference impl:
`BasicTimeTracker/apps/desktop`. Electrobun docs: <https://framework.blackboard.sh/electrobun/>.

## Status — scaffold

Real: the tray (Electrobun `Tray` API), the config file (`airwave-desktop.json` in user-data), browser-open,
LAN detection, and the served `/setup` page. **Stubbed with TODOs** (see `src/bun/index.ts`): the actual
process supervision — embedded Postgres, `prisma migrate deploy`, spawning the server, and serving admin +
tv-web. In dev you can run the normal `pnpm dev` stack and the tray just opens it.

## Dev

```bash
pnpm install            # pulls electrobun (+ its runtime) and @types/bun
pnpm -F desktop dev     # electrobun dev --watch
```

## Build

```bash
pnpm -F desktop build   # turbo -F web build && turbo -F tv-web build && electrobun build
```

## Build order (staged — see the plan)

1. **Shell** (this scaffold): tray + config + /setup; tray opens the running admin.
2. **Supervise the server** against a dev/external Postgres.
3. **Embedded Postgres**: bundle + init/start/stop + migrate on first run → fully self-contained.
4. **tv-web + LAN**: bind `0.0.0.0`, LAN-URL bake, tray LAN address, pair a real TV.
5. **Package**: `electrobun build` per-OS, launch-at-login, updater, (mac) signing.
