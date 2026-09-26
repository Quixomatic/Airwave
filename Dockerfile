# syntax=docker/dockerfile:1
#
# Airwave — ONE image, roles selected at runtime by CG_ROLE:
#   CG_ROLE=server → applies DB migrations, then runs the Bun API server (prebuilt dist).
#   CG_ROLE=web    → builds the admin SPA with the deployment's VITE_SERVER_URL, then serves it.
#   CG_ROLE=tvweb  → builds the browser TV player with VITE_SERVER_URL, then serves it.
#
# Multi-stage + `turbo prune`: the image installs only the dependency closure of the server, web,
# and tv-web workspaces. Everything else in the monorepo (tv-native/Expo, tv-tauri, desktop,
# desktop-setup, site, mcp, tv-roku, tools/promo) is pruned out, so the ~4GB root install that
# pulled in every app's build tooling is gone.
#
# web and tv-web run their vite build at container startup (each self-host bakes in a different
# server URL), so their dev toolchain is kept in the image on purpose. Only the URL-independent
# server bundle (dist/index.mjs) + the workflow-SDK handlers are built here, once.
#
# Run the same image multiple times from docker-compose (server + web [+ tvweb]), different env.

# --- base: shared runtime + package tooling -----------------------------------------
FROM node:22-bookworm-slim AS base

# System deps:
#   gosu           — drop from root to PUID/PGID at runtime (TrueNAS datasets)
#   tzdata         — TZ support
#   openssl        — required by Prisma engines
#   ca-certificates
#   curl/unzip     — Bun install (+ the CAP_MEDIA_URL fallback fetch). tar ships with the base image.
RUN apt-get update && apt-get install -y --no-install-recommends \
      gosu tzdata openssl ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*

# Bun — the server runtime (the Prisma client is generated for runtime = "bun").
# Pin BUN_VERSION for a reproducible image; empty installs the latest.
ARG BUN_VERSION=
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash -s -- ${BUN_VERSION:+bun-v${BUN_VERSION}} \
    && bun --version

# pnpm at the repo's pinned version, via corepack.
ARG PNPM_VERSION=10.11.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# --- prune: reduce the monorepo to just the server/web/tv-web closure ----------------
# `turbo prune --docker` emits out/full (pruned source + root config), out/json (manifests), and
# a pruned out/pnpm-lock.yaml. Only the three roles and their internal packages survive.
FROM base AS prune
ARG TURBO_VERSION=2.10.2
COPY . .
RUN pnpm dlx turbo@${TURBO_VERSION} prune server web tv-web --docker

# --- build: install the pruned deps, generate Prisma, build the server ---------------
FROM base AS build
# A throwaway DATABASE_URL satisfies `prisma generate` (runs in @airwave/db's postinstall +
# db:generate); generate never connects, and the real URL is supplied at runtime by compose.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

# The pruned workspace source + lockfile. The install must see the source, because
# @airwave/db's postinstall runs `prisma generate` (which needs the schema on disk).
COPY --from=prune /app/out/full/ ./
COPY --from=prune /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Prisma client + the server bundle (dist/index.mjs) + the workflow-SDK handlers
# (apps/server/.well-known) — all built ONCE, so the container never rebuilds them at start.
RUN pnpm --filter @airwave/db db:generate \
 && pnpm --filter server build

# --- final: runtime image -----------------------------------------------------------
FROM base AS final

# Runtime user (remapped to PUID/PGID by the entrypoint). node:22 already ships uid/gid 1000
# (`node`), so don't force 1000 here — let the system pick; the entrypoint remaps at runtime.
RUN groupadd app && useradd -g app -d /home/app -m -s /bin/bash app

# The built, pruned workspace: source (web/tv-web build at startup), node_modules, the server
# dist bundle, and the generated Prisma client.
COPY --from=build /app /app

# The root docker/ helpers live outside the workspaces, so turbo prune doesn't carry them.
COPY docker/serve-web.ts /app/docker/serve-web.ts
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# --- Capability-probe test media (~430MB, generated once, frozen) -------------------
# Baked in so the TV capability diagnostic works out of the box — no ffmpeg, no runtime download.
# The tarball is bind-mounted for this RUN only (never COPY'd into a layer), so the ~430MB archive
# is not baked into the image — only the extracted media in the final destination is.
#
# Two sources, no token ever embedded in the image:
#   1. A tarball staged in the build context at docker/cap-media/capability-media.tar.gz.
#      CI (and local builds) place it there from the private release:
#        gh release download media-v1 -p capability-media.tar.gz -D docker/cap-media
#   2. Fallback: fetch CAP_MEDIA_URL (only works once the repo/release is public).
# If neither is present the image builds fine; the diagnostic clips are simply absent.
ARG CAP_MEDIA_URL=
RUN --mount=type=bind,source=docker/cap-media,target=/tmp/capmedia \
    mkdir -p /app/apps/server/capability-media && \
    if [ -f /tmp/capmedia/capability-media.tar.gz ]; then \
      echo "capability media: from build context" && \
      tar -xzf /tmp/capmedia/capability-media.tar.gz -C /app/apps/server/capability-media ; \
    elif [ -n "$CAP_MEDIA_URL" ]; then \
      echo "capability media: from $CAP_MEDIA_URL" && \
      curl -fsSL "$CAP_MEDIA_URL" | tar -xz -C /app/apps/server/capability-media ; \
    else \
      echo "capability media: NONE (diagnostic clips will be absent)" ; \
    fi && \
    echo "capability media files: $(find /app/apps/server/capability-media -type f | wc -l)"

ENV NODE_ENV=production \
    CAP_MEDIA_DIR=/app/apps/server/capability-media

# server → 3000, web → 3001, tvweb → 3002 (publish/remap in compose)
EXPOSE 3000 3001 3002

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
