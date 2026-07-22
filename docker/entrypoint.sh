#!/usr/bin/env bash
#
# ChannelGuide container entrypoint. Runs as root: sets timezone, remaps the
# unprivileged `app` user to PUID/PGID (so writes land as your TrueNAS dataset
# owner), then drops privileges with gosu to run the selected role.
#
#   CG_ROLE=server → prisma migrate deploy, then the Bun API server.
#   CG_ROLE=web    → vite build (bakes VITE_SERVER_URL), then serve the SPA.
#
set -euo pipefail

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
UMASK="${UMASK:-022}"
TZ="${TZ:-UTC}"
CG_ROLE="${CG_ROLE:-server}"

# --- Timezone ---
if [ -f "/usr/share/zoneinfo/${TZ}" ]; then
  ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime
  echo "${TZ}" > /etc/timezone
fi

# --- Remap the `app` user/group to the requested PUID/PGID ---
if [ "$(id -g app)" != "${PGID}" ]; then
  groupmod -o -g "${PGID}" app
fi
if [ "$(id -u app)" != "${PUID}" ]; then
  usermod -o -u "${PUID}" app
fi
usermod -g "${PGID}" app >/dev/null 2>&1 || true

umask "${UMASK}"

# Bun/pnpm/vite caches for the `app` user must be writable.
export HOME=/home/app
chown "${PUID}:${PGID}" /home/app 2>/dev/null || true

echo "[entrypoint] role=${CG_ROLE} uid=${PUID} gid=${PGID} tz=${TZ} umask=${UMASK}"

cd /app

case "${CG_ROLE}" in
  server)
    echo "[entrypoint] applying database migrations (prisma migrate deploy)…"
    gosu app env HOME=/home/app pnpm --filter @ChannelGuide/db db:migrate:deploy

    echo "[entrypoint] starting API server on :${PORT:-3000}…"
    # cwd = apps/server so Bun loads bunfig.toml (workflow preload) and resolves the
    # generated ./.well-known handlers relative to the bundle — same as `pnpm start`.
    cd /app/apps/server
    exec gosu app env HOME=/home/app bun run dist/index.mjs
    ;;

  web)
    if [ -z "${VITE_SERVER_URL:-}" ]; then
      echo "[entrypoint] ERROR: VITE_SERVER_URL is required for CG_ROLE=web" >&2
      echo "             Set it to the address browsers reach the server at (e.g. http://192.168.1.10:36020)." >&2
      exit 1
    fi
    echo "[entrypoint] building admin web (VITE_SERVER_URL=${VITE_SERVER_URL})…"
    # Build as root (writes into root-owned /app); the long-lived serve process runs as `app`.
    pnpm --filter web build

    echo "[entrypoint] serving admin web on :${WEB_PORT:-3001}…"
    exec gosu app env HOME=/home/app bun /app/docker/serve-web.ts
    ;;

  *)
    echo "[entrypoint] ERROR: unknown CG_ROLE '${CG_ROLE}' (expected 'server' or 'web')" >&2
    exit 1
    ;;
esac
