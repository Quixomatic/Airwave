# syntax=docker/dockerfile:1
#
# ChannelGuide — ONE image, TWO roles selected at runtime by CG_ROLE:
#   CG_ROLE=server → applies DB migrations, then runs the Bun API server.
#   CG_ROLE=web    → builds the admin SPA with the deployment's VITE_SERVER_URL
#                    (each self-host lives at a different address), then serves it.
#
# Everything URL-independent — the server bundle AND the workflow-SDK handlers
# (apps/server/.well-known) — is built ONCE here, never at container start. Only the
# admin web is (re)built at startup, because it's the only artifact that bakes in the
# per-deployment server URL.
#
# Run it twice from docker-compose (server + web services), same image, different env.

FROM node:22-bookworm-slim AS base

# System deps:
#   gosu           — drop from root to PUID/PGID at runtime (TrueNAS datasets)
#   tzdata         — TZ support
#   openssl        — required by Prisma engines
#   curl/unzip/tar — Bun install + capability-media fetch/extract
#   ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
      gosu tzdata openssl ca-certificates curl unzip tar \
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

# --- Capability-probe test media (~430MB, generated once, frozen) -------------------
# Placed EARLY so this large layer stays cached across ordinary source changes. Baked in
# so the TV capability diagnostic works out of the box — no ffmpeg, no runtime download.
#
# Two sources, no token ever embedded in the image:
#   1. A tarball staged in the build context at docker/cap-media/capability-media.tar.gz.
#      CI (and local builds) place it there from the private release:
#        gh release download media-v1 -p capability-media.tar.gz -D docker/cap-media
#   2. Fallback: fetch CAP_MEDIA_URL (only works once the repo/release is public).
# If neither is present the image builds fine; the diagnostic clips are simply absent.
COPY docker/cap-media/ /tmp/capmedia/
ARG CAP_MEDIA_URL=
RUN mkdir -p /app/apps/server/capability-media && \
    if [ -f /tmp/capmedia/capability-media.tar.gz ]; then \
      echo "capability media: from build context" && \
      tar -xzf /tmp/capmedia/capability-media.tar.gz -C /app/apps/server/capability-media ; \
    elif [ -n "$CAP_MEDIA_URL" ]; then \
      echo "capability media: from $CAP_MEDIA_URL" && \
      curl -fsSL "$CAP_MEDIA_URL" | tar -xz -C /app/apps/server/capability-media ; \
    else \
      echo "capability media: NONE (diagnostic clips will be absent)" ; \
    fi && \
    rm -rf /tmp/capmedia && \
    echo "capability media files: $(find /app/apps/server/capability-media -type f | wc -l)"

# --- Install + build ----------------------------------------------------------------
# A throwaway DATABASE_URL satisfies `prisma generate` (runs in postinstall + db:generate);
# generate never connects, and the real URL is supplied at runtime by compose.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

# capability-media is .dockerignore'd, so this COPY won't clobber the media fetched above.
COPY . .

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Prisma client + the server bundle (dist/index.mjs) + the workflow-SDK handlers
# (apps/server/.well-known) — all built ONCE, so the container never rebuilds at start.
RUN pnpm --filter @ChannelGuide/db db:generate \
 && pnpm --filter server build

# --- Runtime user (remapped to PUID/PGID by the entrypoint) -------------------------
RUN groupadd -g 1000 app && useradd -u 1000 -g app -d /home/app -m -s /bin/bash app

RUN cp /app/docker/entrypoint.sh /usr/local/bin/entrypoint.sh \
 && chmod +x /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production \
    CAP_MEDIA_DIR=/app/apps/server/capability-media

# server → 3000, web → 3001 (publish/remap in compose)
EXPOSE 3000 3001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
