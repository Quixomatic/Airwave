import { BrowserWindow, Tray } from "electrobun/bun";
import { spawn, type Subprocess } from "bun";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
const HERE = dirname(fileURLToPath(import.meta.url)); // …/apps/desktop/src/bun (source) or …/Resources/app/bun (bundle)
/**
 * Resolve the monorepo root by walking up for `pnpm-workspace.yaml`. A fixed `../../../..` only works from the
 * SOURCE layout; under `electrobun dev` this file runs from the bundle
 * (`apps/desktop/build/dev-win-x64/…/Resources/app/bun`), where a fixed depth lands inside the build dir — which
 * is exactly why the server-dist check kept missing (→ endless rebuild) and admin wouldn't serve.
 * TODO(bundle prod): the installed binary has no monorepo — fall back to the server/assets shipped in Resources.
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(start, "..", "..", "..", ".."); // source-layout fallback
}
const REPO_ROOT = findRepoRoot(HERE);
const SERVER_DIR = join(REPO_ROOT, "apps", "server");
const SERVER_ENTRY = join(SERVER_DIR, "dist", "index.mjs"); // built by `turbo -F server build`
const ADMIN_DIST = join(REPO_ROOT, "apps", "web", "dist");
const TVWEB_DIST = join(REPO_ROOT, "apps", "tv-web", "dist");
const SETUP_UI_DIST = join(REPO_ROOT, "apps", "desktop-setup", "dist"); // TODO(bundle): views/setup in prod

// ── Config (the docker-compose knobs, persisted to user-data) ──────────────────────────────────────────
type Config = {
  ports: { server: number; admin: number; tvweb: number; pg: number; setup: number };
  /** false = localhost only; true = bind 0.0.0.0 + add LAN origins to CORS ("expose on my network"). */
  expose: boolean;
  workflowEnabled: boolean;
  tvwebEnabled: boolean;
  autoStart: boolean;
  /** First-run setup completed (admin account + options chosen in the browser). */
  configured: boolean;
  /** Public base URL the admin + TVs reach the SERVER at — e.g. a Cloudflare tunnel `https://tv.example.com`
   * (mirrors compose `SERVER_PUBLIC_URL`). Empty = local defaults (admin→localhost, tv-web→LAN IP). */
  serverAddress?: string;
  /** Public URL the ADMIN web is reached at → `CORS_ORIGIN` (mirrors compose `WEB_PUBLIC_URL`). Empty = the
   * local admin origin (`http://localhost:<adminPort>`). */
  webAddress?: string;
  /** Extra allow-listed admin origins (CORS + better-auth), comma-separated (mirrors `EXTRA_CORS_ORIGINS`). */
  extraCorsOrigins?: string;
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
  configured: false,
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

// ── File logging — a tray app has no attached console, and `electrobun dev` scrollback is painful to copy.
// Tee every supervisor + child line to <user-data>/desktop.log (append). ─────────────────────────────────
mkdirSync(DATA_DIR, { recursive: true });
const LOG_PATH = join(DATA_DIR, "desktop.log");
const logStream = createWriteStream(LOG_PATH, { flags: "a" });
for (const method of ["log", "error", "warn"] as const) {
  const orig = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    orig(...args);
    try {
      logStream.write(
        `[${new Date().toISOString()}] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`,
      );
    } catch {
      /* ignore */
    }
  };
}
/** Tee a child process's piped stdout/stderr to BOTH the terminal and the log file. */
function pipeToLog(stream: ReadableStream<Uint8Array> | null | undefined): void {
  if (!stream) return;
  void (async () => {
    for await (const chunk of stream) {
      process.stdout.write(chunk);
      logStream.write(chunk);
    }
  })().catch(() => {
    /* ignore */
  });
}
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
  // Load via the `views://` scheme (electrobun `build.copy` puts `assets/*` into `views/assets/`). The docs use
  // `views://` for tray images, and an absolute filesystem path did NOT render on the Windows tray.
  return "views://assets/airwave-tray.png";
}

function loadConfig(): Config {
  try {
    const saved = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<Config>;
    // Ignore any persisted `ports`: the defaults moved to the 36020 range and resolvePorts() picks free ones
    // anyway, so a stale file must not pin old ports (e.g. 3001/3009 from an earlier build). Re-enable
    // per-field once /setup can actually edit ports.
    return { ...DEFAULT_CONFIG, ...saved, ports: { ...DEFAULT_CONFIG.ports } };
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

// The first-run admin (owner) for this local install. Public sign-up is disabled, so the fresh embedded DB
// needs a seeded owner; the setup page collects these, we persist them, and the server's seedAdmin creates the
// account from ADMIN_EMAIL/ADMIN_PASSWORD on boot. Plaintext on disk (like the auth secret) — localhost app.
const ADMIN_CREDS_PATH = join(DATA_DIR, "admin-credentials.json");
type AdminCreds = { email: string; password: string };
function loadAdminCreds(): AdminCreds | null {
  try {
    return JSON.parse(readFileSync(ADMIN_CREDS_PATH, "utf8")) as AdminCreds;
  } catch {
    return null;
  }
}
function saveAdminCreds(c: AdminCreds): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(ADMIN_CREDS_PATH, JSON.stringify(c, null, 2), { mode: 0o600 });
}

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
  // Skip virtual/VPN adapters (Docker/WSL/Hyper-V/Tailscale/etc.) — they hand out 10.x/172.x that TVs can't
  // reach. Then prefer a real home-LAN 192.168.x, then 172.16–31.x, then 10.x, then anything left.
  const VIRTUAL = /(vEthernet|VMware|VirtualBox|Hyper-?V|Radmin|Hamachi|ZeroTier|Tailscale|WSL|Loopback|Bluetooth|VPN|TAP|Docker|Npcap|Nord|WireGuard|Lynx|OpenVPN|Wintun)/i;
  const candidates: string[] = [];
  for (const [name, ifaces] of Object.entries(networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const i of ifaces ?? []) {
      if (i.family === "IPv4" && !i.internal) candidates.push(i.address);
    }
  }
  return (
    candidates.find((a) => a.startsWith("192.168.")) ??
    candidates.find((a) => /^172\.(1[6-9]|2\d|3[01])\./.test(a)) ??
    candidates.find((a) => a.startsWith("10.")) ??
    candidates[0] ??
    "127.0.0.1"
  );
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

// ── Dynamic ports (we share the host's port space — no container network — so never assume a port is free) ──
/** True if `port` can be bound on `host` right now. */
function portFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, host);
  });
}

/** Return `preferred` if free, else scan upward, else let the OS hand out any free port. */
async function freePort(preferred: number, host = "127.0.0.1"): Promise<number> {
  if (await portFree(preferred, host)) return preferred;
  for (let p = preferred + 1; p < preferred + 200; p++) {
    if (await portFree(p, host)) {
      console.log(`[desktop] port ${preferred} busy → using ${p}.`);
      return p;
    }
  }
  return await new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, host, () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
}

/** Resolve the ports we're about to bind to free ones (mutating `config.ports`) so nothing collides with an
 * existing service. PG + setup are loopback-internal; the server/admin/tv-web ports feed the browser URLs. */
async function resolvePorts(supervise: boolean): Promise<void> {
  config.ports.setup = await freePort(config.ports.setup);
  if (!supervise) return;
  const bind = host();
  config.ports.server = await freePort(config.ports.server, bind);
  config.ports.admin = await freePort(config.ports.admin, bind);
  if (config.tvwebEnabled) config.ports.tvweb = await freePort(config.ports.tvweb, bind);
  config.ports.pg = await freePort(config.ports.pg);
}

// Dev points at the running `pnpm dev` stack (3000/1/2); supervise uses the desktop's own config ports.
const DEV_PORTS = { server: 3000, admin: 3001, tvweb: 3002 } as const;
const port = (name: "server" | "admin" | "tvweb") => (attach ? DEV_PORTS[name] : config.ports[name]);
const host = () => (config.expose ? "0.0.0.0" : "127.0.0.1");
// Everything the browser touches uses `localhost` (both dev's Vite servers and our own) — a friendlier, and the
// "same-site as the server" host, so the admin's session cookie sticks (127.0.0.1 vs localhost are different
// hosts to the browser). Our servers bind 127.0.0.1/0.0.0.0, which localhost resolves to.
const uiHost = () => "localhost";
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
  initdbFlags?: string[];
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
  setPhase("database");
  mkdirSync(DATA_DIR, { recursive: true });
  const EmbeddedPostgres = await loadEmbeddedPostgres();
  pg = new EmbeddedPostgres({
    databaseDir: PG_DATA_DIR,
    user: "airwave",
    password: "airwave",
    port: config.ports.pg,
    persistent: true,
    // CRITICAL on Windows: initdb otherwise defaults to the system locale (WIN1252), so any non-Latin-1 title
    // (e.g. `Ō`) fails to insert — "no equivalent in encoding WIN1252". Force a UTF8 cluster (C collation).
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
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
    stdout: "pipe",
    stderr: "pipe",
  });
  pipeToLog(p.stdout);
  pipeToLog(p.stderr);
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

// ── Dev staleness: the desktop runs the BUILT bundles, so a stale dist ships old behavior (e.g. an old
// seedAdmin after a source fix). Rebuild when any relevant source is newer than the artifact. In the packaged
// binary these monorepo dirs don't exist → newestMtimeMs is 0 → never rebuilds (pre-baked). ─────────────────
function packageSrcDirs(): string[] {
  try {
    const pkgs = join(REPO_ROOT, "packages");
    return readdirSync(pkgs)
      .map((p) => join(pkgs, p, "src"))
      .filter((d) => existsSync(d));
  } catch {
    return [];
  }
}
function newestMtimeMs(dirs: string[]): number {
  let newest = 0;
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const rel of readdirSync(dir, { recursive: true }) as string[]) {
        try {
          const s = statSync(join(dir, rel));
          if (s.isFile() && s.mtimeMs > newest) newest = s.mtimeMs;
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
  return newest;
}
function artifactMtimeMs(file: string): number {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}
/** True if the artifact is missing or any source under `srcDirs` is newer than it. */
function stale(artifact: string, srcDirs: string[]): boolean {
  return !existsSync(artifact) || newestMtimeMs(srcDirs) > artifactMtimeMs(artifact);
}

/** Build the server + admin (+ tv-web) if missing, stale (source changed), or built for a different URL.
 * `adminServerUrl` (127.0.0.1) is baked into the admin; `tvwebServerUrl` (the LAN URL when exposed) into tv-web. */
async function ensureBuilds(adminServerUrl: string, tvwebServerUrl: string): Promise<void> {
  const marker = loadMarker();
  const pkgSrc = packageSrcDirs();
  // The server bundle inlines @airwave/* (noExternal), so ANY package source change means it's stale.
  if (stale(SERVER_ENTRY, [join(SERVER_DIR, "src"), ...pkgSrc])) {
    // `workflow build && tsdown` is non-idempotent — `workflow build` chokes on a stale dist/ from a prior
    // run (e.g. a half-built dist with no index.mjs). Clean it first. (Docker never hits this — fresh checkout.)
    setPhase("building-server");
    rmSync(join(SERVER_DIR, "dist"), { recursive: true, force: true });
    rmSync(join(SERVER_DIR, ".well-known"), { recursive: true, force: true });
    await build("server");
  }
  // The admin is only ever opened on THIS machine at 127.0.0.1 → bake the 127.0.0.1 server URL so the admin and
  // the server share a host (same-site) and better-auth's SameSite=Lax session cookie actually flows. Baking a
  // LAN IP here breaks login: admin @127.0.0.1 → server @<lan-ip> is cross-site, so the cookie is dropped and
  // get-session comes back null.
  const adminIndex = join(ADMIN_DIST, "index.html");
  if (marker.web !== adminServerUrl || stale(adminIndex, [join(REPO_ROOT, "apps", "web", "src"), ...pkgSrc])) {
    setPhase("building-admin");
    await build("web", { VITE_SERVER_URL: adminServerUrl });
    marker.web = adminServerUrl;
    saveMarker(marker);
  }
  // tv-web is for TVs on the LAN → bake the LAN URL when exposed (TVs authenticate via a bearer token, not a
  // cross-site cookie, so a different host is fine).
  const tvIndex = join(TVWEB_DIST, "index.html");
  if (
    config.tvwebEnabled &&
    (marker.tvweb !== tvwebServerUrl || stale(tvIndex, [join(REPO_ROOT, "apps", "tv-web", "src"), ...pkgSrc]))
  ) {
    setPhase("building-tvweb");
    await build("tv-web", { VITE_SERVER_URL: tvwebServerUrl });
    marker.tvweb = tvwebServerUrl;
    saveMarker(marker);
  }
}

/** Build the onboarding/settings UI (@airwave/desktop-setup) if missing or stale, so the setup window renders
 * the current version. Small Vite app → fast. (The packaged binary pre-bakes it into views/setup.) */
async function ensureSetupUiBuilt(): Promise<void> {
  const idx = join(SETUP_UI_DIST, "index.html");
  if (!stale(idx, [join(REPO_ROOT, "apps", "desktop-setup", "src"), join(REPO_ROOT, "packages", "ui", "src")])) return;
  await build("@airwave/desktop-setup");
}

async function startStack(): Promise<void> {
  mkdirSync(BUMPER_MUSIC_DIR, { recursive: true });

  // Public-URL model (mirrors docker-compose SERVER_PUBLIC_URL / WEB_PUBLIC_URL / EXTRA_CORS_ORIGINS):
  //  - serverAddress set (e.g. an HTTPS tunnel) → the admin + TVs call it; else admin→localhost, TVs→LAN IP.
  //  - webAddress set → the admin's public origin (CORS_ORIGIN); else the local admin origin.
  //  - the local + LAN admin origins are ALWAYS allow-listed too, so you can still browse there.
  const serverAddr = config.serverAddress?.trim();
  const webAddr = config.webAddress?.trim();
  const adminServerUrl = serverAddr || serverLocalUrl();
  const tvwebServerUrl = serverAddr || serverPublicUrl();
  await ensureBuilds(adminServerUrl, tvwebServerUrl);

  const DATABASE_URL = await startPostgres();

  setPhase("migrating");
  console.log("[desktop] prisma migrate deploy…");
  await run(pnpmArgs(["--filter", "@airwave/db", "db:migrate:deploy"]), {
    cwd: REPO_ROOT,
    env: { DATABASE_URL },
  });

  // The admin's primary origin (CORS_ORIGIN) + everything else we allow-list: local + LAN admin, the tv-web
  // origins, the tunnel admin/server, and the user's extra origins. All feed CORS + better-auth trustedOrigins.
  const lanAdmin = `http://${lanIp()}:${config.ports.admin}`;
  const lanTvweb = `http://${lanIp()}:${config.ports.tvweb}`;
  const corsPrimary = webAddr || adminUrl();
  const allowed = new Set<string>([adminUrl(), lanAdmin, lanTvweb, tvwebUrl()]);
  if (webAddr) allowed.add(webAddr);
  if (serverAddr) allowed.add(serverAddr);
  for (const o of (config.extraCorsOrigins ?? "").split(",").map((s) => s.trim()).filter(Boolean)) allowed.add(o);
  allowed.delete(corsPrimary);
  const extraOrigins = [...allowed].join(",");
  const tvAppOrigin = config.expose ? lanTvweb : tvwebUrl();

  // The server — built bundle, cwd apps/server (bunfig preload + .well-known handlers), same as the container.
  if (!existsSync(SERVER_ENTRY)) {
    console.error(`[desktop] server build missing at ${SERVER_ENTRY} — run \`turbo -F server build\`.`);
  } else {
    setPhase("server");
    console.log(`[desktop] starting server on ${host()}:${config.ports.server}…`);
    // The first-run admin — seedAdmin creates it from these on boot (no-op if unset / already present).
    const admin = loadAdminCreds();
    const srv = spawn(["bun", "run", "dist/index.mjs"], {
      cwd: SERVER_DIR,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        CG_ROLE: "server",
        PORT: String(config.ports.server),
        HOST: host(),
        DATABASE_URL,
        BETTER_AUTH_SECRET: authSecret(),
        // Anchor auth at the URL the admin actually calls: local (http → SameSite=Lax, same-host) or the
        // configured tunnel (https → SameSite=None;Secure, so cross-host origins work). CORS_ORIGIN is the
        // admin's primary origin; the rest are allow-listed via EXTRA_CORS_ORIGINS.
        BETTER_AUTH_URL: adminServerUrl,
        CORS_ORIGIN: corsPrimary,
        TV_APP_ORIGIN: tvAppOrigin,
        EXTRA_CORS_ORIGINS: extraOrigins,
        WORKFLOW_ENABLED: config.workflowEnabled ? "1" : "",
        BUMPER_MUSIC_DIR,
        CAP_MEDIA_DIR: capMediaDir(),
        ...(admin ? { ADMIN_EMAIL: admin.email, ADMIN_PASSWORD: admin.password } : {}),
      },
    });
    pipeToLog(srv.stdout);
    pipeToLog(srv.stderr);
    children.push(srv);
  }

  // Admin + tv-web static SPAs (already built for `serverUrl` by ensureBuilds above; rebuilt on URL change).
  const admin = serveDir(ADMIN_DIST, config.ports.admin);
  if (admin) servers.push(admin);
  if (config.tvwebEnabled) {
    const tv = serveDir(TVWEB_DIST, config.ports.tvweb);
    if (tv) servers.push(tv);
  }

  // Wait for the server to actually answer before declaring ready, so the onboarding progress is honest.
  for (let i = 0; i < 120; i++) {
    if (await isServing(`${serverLocalUrl()}/api/health`)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  setPhase("ready");
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

// ── Stack lifecycle (single-flight) ─────────────────────────────────────────────────────────────────────
let stackState: "idle" | "starting" | "up" = "idle";
// Granular provisioning phase for the onboarding UI's progress bar (surfaced via /status).
// Ordered keys: building-server → building-admin → building-tvweb → database → migrating → server → ready.
let stackPhase = "idle";
function setPhase(p: string): void {
  stackPhase = p;
  console.log(`[desktop] phase: ${p}`);
}
/** Start the supervised stack once; safe to call repeatedly. Returns whether the stack is up. */
async function ensureStackUp(): Promise<boolean> {
  if (stackState === "up") return true;
  if (stackState === "starting") return false;
  stackState = "starting";
  try {
    await startStack();
    stackState = "up";
    console.log("[desktop] stack up.");
    return true;
  } catch (err) {
    stackState = "idle";
    console.error("[desktop] failed to start the stack:", err);
    return false;
  }
}

// ── /setup page — first-run config (admin account + the docker-compose exposure knobs), served in the browser ──
function startSetupServer(): void {
  Bun.serve({
    port: config.ports.setup,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "POST" && url.pathname === "/save") {
        const body = (await req.json().catch(() => ({}))) as {
          adminEmail?: string;
          adminPassword?: string;
          expose?: boolean;
          tvwebEnabled?: boolean;
          workflowEnabled?: boolean;
          serverAddress?: string;
          webAddress?: string;
          extraCorsOrigins?: string;
        };
        const email = (body.adminEmail ?? "").trim();
        const password = body.adminPassword ?? "";
        // Admin creds are required on first run (none exist yet); on later edits they're optional.
        if (!config.configured || email || password) {
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            return Response.json({ ok: false, error: "Enter a valid admin email address." }, { status: 400 });
          }
          if (password.length < 8) {
            return Response.json({ ok: false, error: "Admin password must be at least 8 characters." }, { status: 400 });
          }
          saveAdminCreds({ email, password });
        }
        config = {
          ...config,
          expose: !!body.expose,
          tvwebEnabled: body.tvwebEnabled !== false,
          workflowEnabled: !!body.workflowEnabled,
          serverAddress: (body.serverAddress ?? "").trim().replace(/\/+$/, ""),
          webAddress: (body.webAddress ?? "").trim().replace(/\/+$/, ""),
          extraCorsOrigins: (body.extraCorsOrigins ?? "").trim(),
          configured: true,
        };
        saveConfig(config);
        if (!attach) {
          if (stackState === "up") {
            await stopStack();
            stackState = "idle";
          }
          // Long-running (build/PG/migrate). The setup UI polls /status for progress and shows a finish screen
          // with an "Open Airwave" button (→ /open-admin) — we do NOT auto-open/close (a clear, calm ending).
          void ensureStackUp();
        }
        return Response.json({ ok: true });
      }

      if (req.method === "POST" && url.pathname === "/open-admin") {
        openBrowser(adminUrl());
        hideSetupWindow(); // tuck the onboarding window away (kept alive) once you're headed to the admin
        return Response.json({ ok: true });
      }

      if (url.pathname === "/config") {
        // Initial state for the setup UI: first-run vs settings, current toggles, the admin email (no password).
        return Response.json({
          configured: config.configured,
          expose: config.expose,
          tvwebEnabled: config.tvwebEnabled,
          workflowEnabled: config.workflowEnabled,
          adminEmail: loadAdminCreds()?.email ?? "",
          serverLan: serverLanUrl(),
          serverAddress: config.serverAddress ?? "",
          webAddress: config.webAddress ?? "",
          extraCorsOrigins: config.extraCorsOrigins ?? "",
        });
      }

      if (url.pathname === "/status") {
        const up = attach ? true : stackState === "up" && (await isServing(`${serverLocalUrl()}/api/health`));
        return Response.json({
          state: attach ? "attached" : stackState,
          phase: up ? "ready" : stackPhase,
          up,
          adminUrl: adminUrl(),
        });
      }

      // Static: serve the built onboarding/settings UI (@airwave/desktop-setup) with SPA fallback.
      if (existsSync(join(SETUP_UI_DIST, "index.html"))) {
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === "/" || pathname === "") pathname = "/index.html";
        const filePath = normalize(join(SETUP_UI_DIST, pathname));
        if (
          (filePath === SETUP_UI_DIST || filePath.startsWith(SETUP_UI_DIST + sep)) &&
          existsSync(filePath) &&
          statSync(filePath).isFile()
        ) {
          return new Response(Bun.file(filePath));
        }
        return new Response(Bun.file(join(SETUP_UI_DIST, "index.html")), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      // Fallback before the UI is built (or if its build failed): the minimal inline page.
      return new Response(setupHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
}

function setupHtml(): string {
  const firstRun = !config.configured;
  const creds = loadAdminCreds();
  const chk = (b: boolean) => (b ? " checked" : "");
  // NOTE: the client <script> below uses NO backticks / ${} so it survives this template literal verbatim.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Airwave — Setup</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0f;color:#e7e7ea;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px}
  .card{width:100%;max-width:520px;background:#141420;border:1px solid #26263a;border-radius:16px;padding:32px}
  h1{margin:0 0 4px;font-size:22px}
  p.sub{margin:0 0 24px;color:#9a9aae;font-size:14px}
  label{display:block;font-size:13px;color:#b9b9c8;margin:16px 0 6px}
  input[type=text],input[type=email],input[type=password]{width:100%;padding:10px 12px;background:#0e0e18;border:1px solid #2b2b42;border-radius:9px;color:#fff;font-size:14px}
  input:focus{outline:none;border-color:#6366f1}
  .toggle{display:flex;align-items:center;gap:10px;margin:14px 0;font-size:14px;color:#d5d5e0}
  .toggle input{width:16px;height:16px;accent-color:#6366f1}
  .hint{font-size:12px;color:#75758a;margin-top:2px}
  button{margin-top:24px;width:100%;padding:12px;background:#6366f1;border:0;border-radius:10px;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  button:disabled{opacity:.6;cursor:default}
  #status{margin-top:16px;font-size:14px;color:#9a9aae;min-height:20px}
  #status.err{color:#f87171}
  a{color:#a5b4fc}
</style></head>
<body><div class="card">
  <h1>Airwave desktop</h1>
  <p class="sub">${firstRun ? "First-run setup — create your admin account and pick your options." : "Settings — update your options, then save to restart the server."}</p>
  <form id="f">
    ${
      firstRun
        ? `<label for="email">Admin email</label>
    <input id="email" type="email" value="${creds?.email ?? ""}" placeholder="you@example.com" autocomplete="username" required>
    <label for="password">Admin password</label>
    <input id="password" type="password" placeholder="at least 8 characters" autocomplete="new-password" required>
    <div class="hint">You'll log in to the admin with these. Change the password later in the admin UI.</div>`
        : `<div class="hint">Admin account is set (${creds?.email ?? "configured"}). Change credentials from the admin UI.</div>`
    }
    <div class="toggle"><input id="expose" type="checkbox"${chk(config.expose)}><label for="expose" style="margin:0">Expose on my network (let TVs on the LAN connect)</label></div>
    <div class="toggle"><input id="tvweb" type="checkbox"${chk(config.tvwebEnabled)}><label for="tvweb" style="margin:0">Enable the TV web player</label></div>
    <div class="toggle"><input id="workflow" type="checkbox"${chk(config.workflowEnabled)}><label for="workflow" style="margin:0">Enable AI lineup workflows</label></div>
    <button id="save" type="submit">${firstRun ? "Create & start Airwave" : "Save & restart"}</button>
  </form>
  <div id="status"></div>
</div>
<script>
  var f=document.getElementById('f'),st=document.getElementById('status');
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var btn=document.getElementById('save');btn.disabled=true;st.className='';st.textContent='';
    var em=document.getElementById('email'),pw=document.getElementById('password');
    var body={expose:document.getElementById('expose').checked,tvwebEnabled:document.getElementById('tvweb').checked,workflowEnabled:document.getElementById('workflow').checked};
    if(em)body.adminEmail=em.value; if(pw)body.adminPassword=pw.value;
    fetch('/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json();})
      .then(function(j){
        if(!j.ok){st.className='err';st.textContent=j.error||'Something went wrong.';btn.disabled=false;return;}
        st.textContent='Setting up — building and starting the server. First run can take a few minutes…';
        poll();
      })
      .catch(function(){st.className='err';st.textContent='Network error.';btn.disabled=false;});
  });
  function poll(){
    fetch('/status').then(function(r){return r.json();}).then(function(j){
      if(j.up){st.textContent='Ready — opening the admin…';setTimeout(function(){location.href=j.adminUrl;},700);return;}
      setTimeout(poll,2000);
    }).catch(function(){setTimeout(poll,2000);});
  }
</script>
</body></html>`;
}

// ── Native setup / settings window (desktop-only; the running app stays tray + browser-for-admin) ─────────
// The setup/settings window uses the SYSTEM webview (native renderer — see electrobun.config). We keep ONE
// reference and reuse it via the documented show()/hide() pattern: reopening re-loads the /setup URL (so it
// re-reads /config) and shows the window. (The earlier CEF-based approach segfaulted on window reuse.)
let setupWindow: BrowserWindow | null = null;
async function openSetupWindow(): Promise<void> {
  await ensureSetupUiBuilt(); // make sure the served UI exists before the window loads it
  if (setupWindow) {
    try {
      setupWindow.webview?.loadURL(setupUrl()); // reset the flow to its start (re-reads /config)
      setupWindow.show();
      return;
    } catch {
      setupWindow = null; // ref went stale (window destroyed) — fall through and recreate
    }
  }
  setupWindow = new BrowserWindow({
    title: "Airwave",
    url: setupUrl(),
    frame: { width: 560, height: 700, x: 160, y: 120 },
  });
  setupWindow.on("close", () => {
    setupWindow = null;
  });
}
/** Hide the setup window without closing it (documented reuse pattern) so it can be reopened from the tray. */
function hideSetupWindow(): void {
  try {
    setupWindow?.hide();
  } catch {
    /* ignore */
  }
}
/** Setup done + stack up: hand the admin UI off to the browser and hide (keep-alive) the onboarding window. */
function onStackReady(): void {
  console.log("[desktop] stack ready — opening the admin in your browser.");
  openBrowser(adminUrl());
  hideSetupWindow();
}

// ── Tray ────────────────────────────────────────────────────────────────────────────────────────────────
function buildTray(): Tray {
  // Tray needs the pixel size (defaults to 16×16); our icon is a 32×32 full-color PNG (template:false).
  const tray = new Tray({ title: "Airwave", image: trayIcon(), template: false, width: 32, height: 32 });
  tray.setMenu([
    { type: "normal", label: "Open Admin", action: "open-admin" },
    { type: "normal", label: "Open TV player", action: "open-tvweb", hidden: !config.tvwebEnabled },
    { type: "divider" },
    { type: "normal", label: "Settings", action: "settings" },
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
        void openSetupWindow(); // native settings window (system webview) — reused via show()/hide()
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

// Resolve to actually-free ports before anything binds or bakes a URL (no container network to isolate us).
await resolvePorts(!attach);

startSetupServer();
buildTray(); // show the tray immediately — builds/PG can take a while on first run.

process.on("SIGINT", () => void stopStack().finally(() => process.exit(0)));
process.on("SIGTERM", () => void stopStack().finally(() => process.exit(0)));

if (attach) {
  console.log("[desktop] attached to the running `pnpm dev` stack (localhost:3000/1/2) — not supervising.");
} else if (!config.configured) {
  console.log(`[desktop] first run — opening the setup window (${setupUrl()}) to configure the admin account + options.`);
  await openSetupWindow();
} else {
  console.log("[desktop] supervising the full Airwave stack (embedded PG + server + admin + tv-web).");
  if (await ensureStackUp()) onStackReady();
}

console.log(`[desktop] supervisor up. data=${DATA_DIR} attach=${attach} admin=${adminUrl()} setup=${setupUrl()}`);
