#!/usr/bin/env bash
#
# Airwave container entrypoint.
#
# Runs one of two ways, chosen automatically by whether the container starts as root:
#
#   • As ROOT (the default: Dockge / docker compose / the one-line installer) — sets the timezone,
#     remaps the unprivileged `app` user to PUID/PGID (so writes land as your dataset owner), then
#     drops privileges with gosu to run the selected role. This is the original behavior, unchanged.
#
#   • As a NON-ROOT user (e.g. TrueNAS `set_user`, Podman, rootless Docker, Kubernetes `runAsUser`) —
#     skips the root-only steps (tz symlink, user remap, chown, gosu) and runs the role directly as
#     that user. Mounted volumes must already be owned by it (TrueNAS's permissions sidecar handles
#     that). PUID/PGID are ignored in this mode.
#
#   CG_ROLE=server → prisma migrate deploy, then the Bun API server.
#   CG_ROLE=web    → vite build (bakes VITE_SERVER_URL), then serve the SPA.
#   CG_ROLE=tvweb  → vite build (browser player), then serve it.
#
set -euo pipefail

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
UMASK="${UMASK:-022}"
TZ="${TZ:-UTC}"
CG_ROLE="${CG_ROLE:-server}"

umask "${UMASK}"

if [ "$(id -u)" = "0" ]; then
  # ---- ROOT path (unchanged) ----
  IS_ROOT=1

  # Timezone
  if [ -f "/usr/share/zoneinfo/${TZ}" ]; then
    ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime
    echo "${TZ}" > /etc/timezone
  fi

  # Remap the `app` user/group to the requested PUID/PGID
  if [ "$(id -g app)" != "${PGID}" ]; then
    groupmod -o -g "${PGID}" app
  fi
  if [ "$(id -u app)" != "${PUID}" ]; then
    usermod -o -u "${PUID}" app
  fi
  usermod -g "${PGID}" app >/dev/null 2>&1 || true

  export HOME=/home/app
  chown "${PUID}:${PGID}" /home/app 2>/dev/null || true
  RUN_UID="${PUID}"; RUN_GID="${PGID}"
else
  # ---- NON-ROOT path (TrueNAS set_user / rootless) ----
  IS_ROOT=0
  # No tz symlink or chown without root; the app reads TZ from the env regardless. HOME must be
  # writable for the bun/pnpm/vite caches — the image makes /home/app world-writable; fall back to
  # a temp dir if it isn't.
  if [ -w /home/app ]; then export HOME=/home/app; else export HOME="${HOME:-/tmp}"; fi
  RUN_UID="$(id -u)"; RUN_GID="$(id -g)"
fi

# Run a command as the app user: drop with gosu on the root path, run directly on the non-root path.
run() {
  if [ "${IS_ROOT}" = "1" ]; then
    gosu app env HOME=/home/app "$@"
  else
    env HOME="${HOME}" "$@"
  fi
}
# Same, but replaces this process (so the long-lived server/serve is PID 1's child, signal-correct).
exec_run() {
  if [ "${IS_ROOT}" = "1" ]; then
    exec gosu app env HOME=/home/app "$@"
  else
    exec env HOME="${HOME}" "$@"
  fi
}

echo "[entrypoint] role=${CG_ROLE} uid=${RUN_UID} gid=${RUN_GID} tz=${TZ} umask=${UMASK} root=${IS_ROOT}"

cd /app

case "${CG_ROLE}" in
  server)
    echo "[entrypoint] applying database migrations (prisma migrate deploy)…"
    run pnpm --filter @airwave/db db:migrate:deploy

    # Durable workflow engine (AI lineup builder) keeps its state in its OWN Postgres schema
    # (drizzle-managed `workflow` + graphile-worker). Bootstrap it when enabled — the setup is a
    # migration runner (records what it applied, skips it next time), so this is idempotent and
    # safe on every start. Non-fatal: if it fails the API still boots (the engine self-disables).
    if [ "${WORKFLOW_ENABLED:-}" = "1" ]; then
      echo "[entrypoint] bootstrapping workflow engine schema…"
      run pnpm --filter server workflow:bootstrap \
        || echo "[entrypoint] WARNING: workflow schema bootstrap failed — the AI lineup engine may not start." >&2
    fi

    # Bumper-music library dir (§7.14) — user-uploaded/dropped-in audio persists here (mount a volume).
    BMDIR="${BUMPER_MUSIC_DIR:-/app/apps/server/bumper-music}"
    mkdir -p "$BMDIR" 2>/dev/null || true
    # Only root can chown; non-root relies on the volume already being owned correctly.
    if [ "${IS_ROOT}" = "1" ]; then
      chown -R "${PUID}:${PGID}" "$BMDIR" 2>/dev/null || true
    fi

    echo "[entrypoint] starting API server on :${PORT:-3000}…"
    # cwd = apps/server so Bun loads bunfig.toml (workflow preload) and resolves the generated
    # ./.well-known handlers relative to the bundle — same as `pnpm start`.
    cd /app/apps/server
    exec_run bun run dist/index.mjs
    ;;

  web)
    if [ -z "${VITE_SERVER_URL:-}" ]; then
      echo "[entrypoint] ERROR: VITE_SERVER_URL is required for CG_ROLE=web" >&2
      echo "             Set it to the address browsers reach the server at (e.g. http://192.168.1.10:36020)." >&2
      exit 1
    fi
    echo "[entrypoint] building admin web (VITE_SERVER_URL=${VITE_SERVER_URL})…"
    # Builds in place as the current user (root on the default path; the set_user on the non-root
    # path — the build output dirs are made writable in the image). The serve process runs below.
    pnpm --filter web build

    echo "[entrypoint] serving admin web on :${WEB_PORT:-3001}…"
    exec_run bun /app/docker/serve-web.ts
    ;;

  tvweb)
    # The 10-foot TV app, served as a browser web player. Same image; builds at startup with the
    # server URL baked in (so it connects without the device-onboarding step), then serves the SPA.
    if [ -z "${VITE_SERVER_URL:-}" ]; then
      echo "[entrypoint] ERROR: VITE_SERVER_URL is required for CG_ROLE=tvweb" >&2
      exit 1
    fi
    echo "[entrypoint] building TV web player (VITE_SERVER_URL=${VITE_SERVER_URL})…"
    # This is a browser web player, not a real TV → bake browser mode (smaller scale, mouse, inset sidebar).
    VITE_IS_BROWSER=true pnpm --filter tv-web build

    echo "[entrypoint] serving TV web player on :${TV_WEB_PORT:-3002}…"
    exec_run WEB_DIST=/app/apps/tv-web/dist WEB_PORT="${TV_WEB_PORT:-3002}" bun /app/docker/serve-web.ts
    ;;

  *)
    echo "[entrypoint] ERROR: unknown CG_ROLE '${CG_ROLE}' (expected 'server', 'web', or 'tvweb')" >&2
    exit 1
    ;;
esac
