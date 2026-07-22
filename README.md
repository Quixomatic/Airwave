# ChannelGuide

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Hono, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **tRPC** - End-to-end type-safe APIs
- **Bun** - Runtime environment
- **Prisma** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Turborepo** - Optimized monorepo build system

## Self-Hosting (Docker)

ChannelGuide self-hosts as a **single Docker image** that runs two ways — the API
**server** and the admin **web** (selected by `CG_ROLE`) — plus a Postgres database,
wired together by [`docker-compose.yml`](./docker-compose.yml).

### Quick start (Dockge or `docker compose`)

1. **Grab the stack files** — [`docker-compose.yml`](./docker-compose.yml) and
   [`.env.example`](./.env.example). In Dockge: create a stack, paste the compose, then the env.
2. **Copy `.env.example` to `.env`** and set at minimum:
   - `SERVER_PUBLIC_URL` / `WEB_PUBLIC_URL` — the addresses your **browser and TV** use
     (your host's LAN IP or a domain, plus the published ports), e.g.
     `http://192.168.1.10:36020` and `http://192.168.1.10:36021`. **Not** `localhost`
     unless you only ever browse from the host itself — these get baked into the admin
     build and used for auth/CORS.
   - `SERVER_PORT` / `WEB_PORT` — published host ports (must match the URLs above).
   - `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` (`openssl rand -base64 48`).
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — seeds the first admin on first boot.
   - `PUID` / `PGID` / `TZ` — for your host (TrueNAS datasets).
3. **Deploy:**
   ```bash
   docker compose up -d
   ```
   The server applies DB migrations (`prisma migrate deploy`) then starts. The web service
   builds the admin SPA against `SERVER_PUBLIC_URL` on first boot (takes a minute), then serves it.
4. **Open the admin** at `WEB_PUBLIC_URL`, sign in with the seeded admin, connect your Plex
   source, and run a metadata sync.
5. **On the TV**, launch the app → it scans your LAN for the server (or enter
   `SERVER_PUBLIC_URL` manually) → sign in.

### Image

Published to GHCR (multi-arch, amd64 + arm64): `ghcr.io/quixomatic/channelguide`.
Update with `docker compose pull && docker compose up -d` — migrations apply automatically on start.

### Building the image yourself

```bash
# stage the capability-probe media (baked in for the TV diagnostic), then build:
gh release download media-v1 -p capability-media.tar.gz -D docker/cap-media
docker build -t channelguide:local .
```
Set `CG_IMAGE=channelguide:local` in your `.env` to run the local build.

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Database Setup

This project uses PostgreSQL with Prisma.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database (runs the committed migrations):

```bash
pnpm run db:migrate
```

> The database is managed by **Prisma migrations**. Author schema changes with
> `pnpm db:migrate` (creates + applies a migration); `db:push` is for throwaway
> experiments only. Production/Docker runs `prisma migrate deploy` on start.

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@ChannelGuide/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Project Structure

```
ChannelGuide/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   └── server/      # Backend API (Hono, TRPC)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run dev:server`: Start only the server
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:push`: Push schema changes to database
- `pnpm run db:generate`: Generate database client/types
- `pnpm run db:migrate`: Run database migrations
- `pnpm run db:studio`: Open database studio UI
