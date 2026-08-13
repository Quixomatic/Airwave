import { Tray } from "electrobun/bun";
import { spawn, type Subprocess } from "bun";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Airwave Desktop — a tray-only Electrobun supervisor.
 *
 * Boots embedded Postgres + the Airwave server + the admin + tv-web on local ports (mirroring
 * `docker/entrypoint.sh`, minus root/gosu), next to Plex. The browser is the UI. See `.plans/desktop-server.md`.
 *
 * STATUS: DEV-mode build. It resolves the monorepo (repo-relative paths) and supervises the real stack:
 * embedded PG → `prisma migrate deploy` → the built server (`apps/server/dist/index.mjs`) → static admin +
 * tv-web. UNVERIFIED at author time (can't run Electrobun/PG here). Distribution bundling (paths, shipping the
 * server + deps inside the app) is Stage 5 — marked TODO(bundle).
 */

// ── Paths (DEV: resolve the monorepo from apps/desktop/src/bun) ─────────────────────────────────────────
const HERE = dirname(fileURLToPath(import.meta.url)); // …/apps/desktop/src/bun
const REPO_ROOT = join(HERE, "..", "..", "..", ".."); // TODO(bundle): detect bundled layout + shipped assets
const SERVER_DIR = join(REPO_ROOT, "apps", "server");
const SERVER_ENTRY = join(SERVER_DIR, "dist", "index.mjs"); // built by `turbo -F server build`
const ADMIN_DIST = join(REPO_ROOT, "apps", "web", "dist");
const TVWEB_DIST = join(REPO_ROOT, "apps", "tv-web", "dist");

// ── Config (the docker-compose knobs, persisted to user-data) ──────────────────────────────────────────
type Config = {
  ports: { server: number; admin: number; tvweb: number; pg: number; setup: number };
  /** false = localhost only; true = bind 0.0.0.0 + add LAN origins to CORS ("expose on my network"). */
  expose: boolean;
  workflowEnabled: boolean;
  tvwebEnabled: boolean;
  autoStart: boolean;
  /** Optional external Postgres; when set, the embedded engine is skipped (e.g. point at a dev DB). */
  databaseUrl?: string;
};

const DEFAULT_CONFIG: Config = {
  // Supervise (prod) ports = the docker-published range, so they don't clash with dev servers on 3000/1/2.
  ports: { server: 36020, admin: 36021, tvweb: 36022, pg: 54329, setup: 36029 },
  expose: false,
  workflowEnabled: false,
  tvwebEnabled: true,
  autoStart: true,
};

// TODO: prefer Electrobun's `Paths` API for the per-OS user-data dir; this is a safe fallback.
function userDataDir(): string {
  const app = "Airwave";
  if (process.platform === "win32")
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), app);
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", app);
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), app);
}

const DATA_DIR = userDataDir();
const CONFIG_PATH = join(DATA_DIR, "airwave-desktop.json");
const SECRET_PATH = join(DATA_DIR, "better-auth-secret");
const PG_DATA_DIR = join(DATA_DIR, "pgdata");
const BUMPER_MUSIC_DIR = join(DATA_DIR, "bumper-music");
// The TV capability diagnostic's ~430MB test clips (server serves them at /caps/media/*). Baked into the
// Docker image from the `media-v1` release; here: use the monorepo copy in dev, else a user-data dir the
// distribution fetches on first run. See docker/Dockerfile (CAP_MEDIA_URL).
const CAP_MEDIA_MONO = join(SERVER_DIR, "capability-media");
const CAP_MEDIA_USER = join(DATA_DIR, "capability-media");
function capMediaDir(): string {
  if (existsSync(join(CAP_MEDIA_MONO, "matrix.json")) || existsSync(CAP_MEDIA_MONO)) return CAP_MEDIA_MONO;
  return CAP_MEDIA_USER;
}
// TODO(dist): on first run, if CAP_MEDIA_USER is empty, fetch+extract the `media-v1` tarball into it (mirror
// the Dockerfile's `curl $CAP_MEDIA_URL | tar -xz`). Don't bundle 430MB into the installer.

// The Airwave mark for the system tray. DEV resolves the committed square PNG (falls back to the admin's
// apple-touch-icon). TODO(dist): switch to `views://assets/airwave-tray.png` (electrobun `build.copy`) so it
// resolves inside the bundle. `template:false` — it's a full-color mark, not a macOS monochrome mask.
function trayIcon(): string {
  const candidates = [
    join(REPO_ROOT, "apps", "desktop", "assets", "airwave-tray.png"),
    join(REPO_ROOT, "apps", "web", "public", "apple-touch-icon.png"),
  ];
  return candidates.find((p) => existsSync(p)) ?? "";
}

function loadConfig(): Config {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, "utf8")) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(c: Config): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2));
}

let config = loadConfig();

/** `attach` = a `pnpm dev` stack is already listening (probed at startup) → don't supervise, just point the
 * tray at the running dev servers (localhost:3000/1/2). Otherwise we're fully self-contained: build whatever's
 * missing, boot embedded Postgres + the server, and serve admin/tv-web on our OWN ports. This same code path
 * is what the eventual installed binary runs. */
let attach = false;

/** A stable BETTER_AUTH_SECRET (also the token/Plex-encryption key) — generate once, persist. */
function authSecret(): string {
  try {
    return readFileSync(SECRET_PATH, "utf8").trim();
  } catch {
    const s = randomBytes(32).toString("hex");
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(SECRET_PATH, s, { mode: 0o600 });
    return s;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────────────
function lanIp(): string {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return "127.0.0.1";
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url];
  spawn(cmd, { stdout: "ignore", stderr: "ignore" });
}

/** HEAD-probe a URL to see if something's already answering there (used to sniff a running `pnpm dev` stack). */
async function isServing(url: string): Promise<boolean> {
  try {
    await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(700) });
    return true;
  } catch {
    return false;
  }
}

/** Attach to an already-running `pnpm dev` stack when its admin (or server) dev port answers; else self-host. */
async function detectAttach(): Promise<boolean> {
  return (await isServing("http://localhost:3001")) || (await isServing("http://localhost:3000"));
}

// Dev points at the running `pnpm dev` stack (3000/1/2); supervise uses the desktop's own config ports.
const DEV_PORTS = { server: 3000, admin: 3001, tvweb: 3002 } as const;
const port = (name: "server" | "admin" | "tvweb") => (attach ? DEV_PORTS[name] : config.ports[name]);
const host = () => (config.expose ? "0.0.0.0" : "127.0.0.1");
// Vite dev servers bind `localhost` (often ::1 on Windows) → open via `localhost`, NOT 127.0.0.1 (IPv4 would
// fail to connect). Our own servers bind 127.0.0.1, so open those via 127.0.0.1.
const uiHost = () => (attach ? "localhost" : "127.0.0.1");
const adminUrl = () => `http://${uiHost()}:${port("admin")}`;
const tvwebUrl = () => `http://${uiHost()}:${port("tvweb")}`;
const setupUrl = () => `http://127.0.0.1:${config.ports.setup}`;
const serverLocalUrl = () => `http://${uiHost()}:${port("server")}`;
const serverLanUrl = () => `http://${lanIp()}:${port("server")}`;
/** Where the SPAs point their API calls: the LAN URL when exposed (so paired TVs work), else localhost. */
const serverPublicUrl = () => (config.expose ? serverLanUrl() : serverLocalUrl());

// ── Static SPA server (replicates docker/serve-web.ts) ───────────────────────────────────────────────────
function serveDir(dist: string, port: number): ReturnType<typeof Bun.serve> | null {
  const index = join(dist, "index.html");
  if (!existsSync(index)) {
    console.error(`[desktop] no build at ${dist} (run \`turbo -F web build\` / \`-F tv-web build\`).`);
    return null;
  }
  return Bun.serve({
    port,
    hostname: host(),
    idleTimeout: 30,
    fetch(req) {
      const url = new URL(req.url);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const filePath = normalize(join(dist, pathname));
      if (filePath !== dist && !filePath.startsWith(dist + sep)) return new Response("forbidden", { status: 403 });
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        const headers = filePath.includes(`${sep}assets${sep}`)
          ? { "Cache-Control": "public, max-age=31536000, immutable" }
          : { "Cache-Control": "no-cache" };
        return new Response(Bun.file(filePath), { headers });
      }
      return new Response(Bun.file(index), { headers: { "Cache-Control": "no-cache" } });
    },
  });
}

// ── Process supervision (mirrors docker/entrypoint.sh) ───────────────────────────────────────────────────
// embedded-postgres dynamically imports one of ~6 per-platform binary packages; only the current platform's
// is installed. Loading it via a NON-LITERAL specifier keeps the bundler from following those imports at
// build time (it resolves at runtime instead). Only used in the bundled/prod supervisor — dev never calls it.
type EmbeddedPostgresLike = {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  createDatabase(name: string): Promise<void>;
};
type EmbeddedPostgresCtor = new (opts: {
  databaseDir: string;
  user: string;
  password: string;
  port: number;
  persistent: boolean;
}) => EmbeddedPostgresLike;

async function loadEmbeddedPostgres(): Promise<EmbeddedPostgresCtor> {
  const spec = "embedded-postgres";
  const mod = (await import(spec)) as { default: EmbeddedPostgresCtor };
  return mod.default;
}

let pg: EmbeddedPostgresLike | null = null;
const servers: { stop(): void }[] = [];
const children: Subprocess[] = [];

/** Start embedded Postgres (or skip if an external DATABASE_URL is configured); returns the DATABASE_URL. */
async function startPostgres(): Promise<string> {
  if (config.databaseUrl) {
    console.log("[desktop] using external DATABASE_URL (embedded Postgres skipped).");
    return config.databaseUrl;
  }
  mkdirSync(DATA_DIR, { recursive: true });
  const EmbeddedPostgres = await loadEmbeddedPostgres();
  pg = new EmbeddedPostgres({
    databaseDir: PG_DATA_DIR,
    user: "airwave",
    password: "airwave",
    port: config.ports.pg,
    persistent: true,
  });
  if (!existsSync(join(PG_DATA_DIR, "PG_VERSION"))) {
    console.log("[desktop] initialising embedded Postgres…");
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase("channelguide");
  } catch {
    /* already exists */
  }
  return `postgresql://airwave:airwave@127.0.0.1:${config.ports.pg}/channelguide?schema=public`;
}

async function run(cmd: string[], opts: { cwd?: string; env?: Record<string, string> }): Promise<number> {
  const p = spawn(cmd, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdout: "inherit",
    stderr: "inherit",
  });
  return await p.exited;
}

/** Cross-platform `pnpm …` argv — Windows resolves the `pnpm.cmd` shim via `cmd /c`. */
function pnpmArgs(args: string[]): string[] {
  return process.platform === "win32" ? ["cmd", "/c", "pnpm", ...args] : ["pnpm", ...args];
}

// ── Build-on-demand (so a fresh `pnpm dev:desktop` is self-contained; the installed binary pre-bakes these) ──
// The admin (and, for the browser player, tv-web) bake VITE_SERVER_URL at *build* time, so a build is only
// valid for one server URL. We record the URL each SPA was built for and rebuild when it changes (or is
// missing). The server bundle has no URL dependence — just presence.
const BUILD_MARKER = join(DATA_DIR, "build-marker.json");
type BuildMarker = { web?: string; tvweb?: string };
function loadMarker(): BuildMarker {
  try {
    return JSON.parse(readFileSync(BUILD_MARKER, "utf8")) as BuildMarker;
  } catch {
    return {};
  }
}
function saveMarker(m: BuildMarker): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(BUILD_MARKER, JSON.stringify(m, null, 2));
}

async function build(filter: string, env: Record<string, string> = {}): Promise<void> {
  console.log(`[desktop] building ${filter}${env.VITE_SERVER_URL ? ` (VITE_SERVER_URL=${env.VITE_SERVER_URL})` : ""}…`);
  const code = await run(pnpmArgs(["--filter", filter, "build"]), { cwd: REPO_ROOT, env });
  if (code !== 0) throw new Error(`build failed for "${filter}" (exit ${code})`);
}

/** Build the server + admin (+ tv-web) if missing or built for a different server URL. No-ops once built. */
async function ensureBuilds(serverUrl: string): Promise<void> {
  const marker = loadMarker();
  if (!existsSync(SERVER_ENTRY)) await build("server");
  if (!existsSync(join(ADMIN_DIST, "index.html")) || marker.web !== serverUrl) {
    await build("web", { VITE_SERVER_URL: serverUrl });
    marker.web = serverUrl;
    saveMarker(marker);
  }
  if (config.tvwebEnabled && (!existsSync(join(TVWEB_DIST, "index.html")) || marker.tvweb !== serverUrl)) {
    await build("tv-web", { VITE_SERVER_URL: serverUrl });
    marker.tvweb = serverUrl;
    saveMarker(marker);
  }
}

async function startStack(): Promise<void> {
  mkdirSync(BUMPER_MUSIC_DIR, { recursive: true });

  // Build the server + SPAs first (baking the SPAs for THIS server URL) so a fresh checkout just works.
  const serverUrl = serverPublicUrl();
  await ensureBuilds(serverUrl);

  const DATABASE_URL = await startPostgres();

  console.log("[desktop] prisma migrate deploy…");
  await run(pnpmArgs(["--filter", "@airwave/db", "db:migrate:deploy"]), {
    cwd: REPO_ROOT,
    env: { DATABASE_URL },
  });

  const lanOrigins = config.expose
    ? [serverLanUrl(), `http://${lanIp()}:${config.ports.admin}`, `http://${lanIp()}:${config.ports.tvweb}`].join(",")
    : "";

  // The server — built bundle, cwd apps/server (bunfig preload + .well-known handlers), same as the container.
  if (!existsSync(SERVER_ENTRY)) {
    console.error(`[desktop] server build missing at ${SERVER_ENTRY} — run \`turbo -F server build\`.`);
  } else {
    console.log(`[desktop] starting server on ${host()}:${config.ports.server}…`);
    children.push(
      spawn(["bun", "run", "dist/index.mjs"], {
        cwd: SERVER_DIR,
        stdout: "inherit",
        stderr: "inherit",
        env: {
          ...process.env,
          CG_ROLE: "server",
          PORT: String(config.ports.server),
          HOST: host(),
          DATABASE_URL,
          BETTER_AUTH_SECRET: authSecret(),
          BETTER_AUTH_URL: serverPublicUrl(),
          CORS_ORIGIN: adminUrl(),
          TV_APP_ORIGIN: tvwebUrl(),
          EXTRA_CORS_ORIGINS: lanOrigins,
          WORKFLOW_ENABLED: config.workflowEnabled ? "1" : "",
          BUMPER_MUSIC_DIR,
          CAP_MEDIA_DIR: capMediaDir(),
        },
      }),
    );
  }

  // Admin + tv-web static SPAs (already built for `serverUrl` by ensureBuilds above; rebuilt on URL change).
  const admin = serveDir(ADMIN_DIST, config.ports.admin);
  if (admin) servers.push(admin);
  if (config.tvwebEnabled) {
    const tv = serveDir(TVWEB_DIST, config.ports.tvweb);
    if (tv) servers.push(tv);
  }
}

async function stopStack(): Promise<void> {
  for (const s of servers) {
    try {
      s.stop();
    } catch {
      /* ignore */
    }
  }
  servers.length = 0;
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* ignore */
    }
  }
  children.length = 0;
  if (pg) {
    try {
      await pg.stop();
    } catch {
      /* ignore */
    }
    pg = null;
  }
}

// ── /setup page — the exposure/ports/workflow config (friendly docker-compose knobs) ────────────────────
function startSetupServer(): void {
  Bun.serve({
    port: config.ports.setup,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "POST" && url.pathname === "/save") {
        const body = (await req.json().catch(() => ({}))) as Partial<Config>;
        config = { ...config, ...body };
        saveConfig(config);
        if (!attach) {
          await stopStack();
          await startStack();
        }
        return Response.json({ ok: true });
      }
      return new Response(setupHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
}

function setupHtml(): string {
  // TODO: real form (toggle expose / edit ports / workflows) POSTing JSON to /save. Placeholder for now.
  return `<!doctype html><meta charset="utf-8"><title>Airwave — Setup</title>
  <body style="font-family:system-ui;max-width:640px;margin:48px auto;padding:0 16px;line-height:1.5">
    <h1>Airwave desktop — setup</h1>
    <p><strong>Point your TVs at:</strong> <code>${serverLanUrl()}</code></p>
    <p><strong>Expose on my network:</strong> ${config.expose ? "ON" : "off — localhost only"}</p>
    <pre style="background:#f4f4f5;padding:12px;border-radius:8px;overflow:auto">${JSON.stringify(config, null, 2)}</pre>
    <p style="color:#888">TODO: real controls (POST to <code>/save</code>).</p>
  </body>`;
}

// ── Tray ────────────────────────────────────────────────────────────────────────────────────────────────
function buildTray(): Tray {
  const tray = new Tray({ title: "Airwave", image: trayIcon(), template: false });
  tray.setMenu([
    { type: "normal", label: "Open Admin", action: "open-admin" },
    { type: "normal", label: "Open TV player", action: "open-tvweb", hidden: !config.tvwebEnabled },
    { type: "divider" },
    { type: "normal", label: "Settings…", action: "settings" },
    { type: "normal", label: `Server: ${serverLanUrl()}`, action: "noop", enabled: false },
    { type: "divider" },
    { type: "normal", label: "Quit", action: "quit" },
  ]);
  tray.on("tray-clicked", (e) => {
    const action = (e as { data?: { action?: string } }).data?.action;
    switch (action) {
      case "open-admin":
        openBrowser(adminUrl());
        break;
      case "open-tvweb":
        openBrowser(tvwebUrl());
        break;
      case "settings":
        openBrowser(setupUrl());
        break;
      case "quit":
        void stopStack().finally(() => process.exit(0));
        break;
    }
  });
  return tray;
}

// ── Main ────────────────────────────────────────────────────────────────────────────────────────────────
mkdirSync(DATA_DIR, { recursive: true });
saveConfig(config);

// Attach to a running `pnpm dev` stack if one's up; otherwise supervise our own full stack.
attach = await detectAttach();

startSetupServer();
buildTray(); // show the tray immediately — builds/PG can take a while on first run.

process.on("SIGINT", () => void stopStack().finally(() => process.exit(0)));
process.on("SIGTERM", () => void stopStack().finally(() => process.exit(0)));

if (attach) {
  console.log("[desktop] attached to the running `pnpm dev` stack (localhost:3000/1/2) — not supervising.");
} else {
  console.log("[desktop] no dev stack detected — supervising the full Airwave stack (embedded PG + server + admin + tv-web).");
  try {
    await startStack();
    console.log("[desktop] stack up — opening admin.");
    openBrowser(adminUrl());
  } catch (err) {
    console.error("[desktop] failed to start the stack:", err);
  }
}

console.log(`[desktop] supervisor up. data=${DATA_DIR} attach=${attach} admin=${adminUrl()} setup=${setupUrl()}`);
