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
import { fileURLToPath, pathToFileURL } from "node:url";
import { netstatOwnsPort, lsofOwnsPort, ssOwnsPort } from "./port-probe";

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
// PACKAGED = the installed app (no monorepo). Then everything is pre-baked in the bundle at
// `Resources/app/{server,views}`: the standalone server bundle + migrate runner + the SPAs. In dev we resolve
// the monorepo and build on demand. `APP_ROOT` = `Resources/app` in a bundle (dirname of `.../app/bun`).
const APP_ROOT = dirname(HERE);
const PACKAGED = !existsSync(join(REPO_ROOT, "pnpm-workspace.yaml"));

const SERVER_DIR = PACKAGED ? join(APP_ROOT, "server") : join(REPO_ROOT, "apps", "server");
// Dev runs the tsdown bundle from apps/server (cwd there for bunfig/.well-known). Packaged runs the
// self-contained `server.mjs` (all deps bundled; Prisma engine-less via the pg adapter).
const SERVER_ENTRY = PACKAGED ? join(SERVER_DIR, "server.mjs") : join(SERVER_DIR, "dist", "index.mjs");
const MIGRATE_ENTRY = join(SERVER_DIR, "migrate.mjs"); // packaged: the engine-less migration runner
const MIGRATIONS_DIR = join(SERVER_DIR, "migrations"); // packaged: the shipped prisma/migrations
const ADMIN_DIST = PACKAGED ? join(APP_ROOT, "views", "admin") : join(REPO_ROOT, "apps", "web", "dist");
const TVWEB_DIST = PACKAGED ? join(APP_ROOT, "views", "tvweb") : join(REPO_ROOT, "apps", "tv-web", "dist");
const SETUP_UI_DIST = PACKAGED ? join(APP_ROOT, "views", "setup") : join(REPO_ROOT, "apps", "desktop-setup", "dist");

/** The bun executable to spawn children with — the one we're already running (bundled bun when packaged). */
const bunBin = (): string => process.execPath;

// ── Config (the docker-compose knobs, persisted to user-data) ──────────────────────────────────────────
type Config = {
  ports: { server: number; admin: number; tvweb: number; pg: number; setup: number };
  /** false = localhost only; true = bind 0.0.0.0 + add LAN origins to CORS ("expose on my network"). */
  expose: boolean;
  workflowEnabled: boolean;
  tvwebEnabled: boolean;
  autoStart: boolean;
  /** Register an OS login item so the supervisor launches at user login (packaged only). */
  runOnStartup: boolean;
  /** On a configured boot, DON'T auto-open the admin in the browser — start quietly to the tray instead. */
  silentStartup: boolean;
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
  expose: true,
  workflowEnabled: true,
  tvwebEnabled: true,
  autoStart: true,
  runOnStartup: false,
  silentStartup: false,
  configured: false,
};

// TODO: prefer Electrobun's `Paths` API for the per-OS user-data dir; this is a safe fallback.
function userDataDir(): string {
  // Dev (`pnpm -F desktop dev`) and the PACKAGED install must NOT share a data dir — they both default embedded
  // Postgres to the same port + `pgdata`, so a running dev instance and the installed app fight over one data
  // directory (→ `FATAL: pre-existing shared memory block is still in use`, a silent hang). Give dev its own
  // `Airwave-Dev` tree so the two can run side-by-side on a developer's machine. Packaged stays `Airwave`
  // (never rename it — that would orphan real users' data).
  const app = PACKAGED ? "Airwave" : "Airwave-Dev";
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
// The TV capability diagnostic's ~430MB test clips (server serves them at /caps/media/*). NOT bundled into the
// installer (that made it ~400MB + a minutes-long extract) — instead the packaged app FETCHES them on first run
// from the PUBLIC `airwave-assets` release into user-data (the code repo stays private; the asset is public).
// In dev, the monorepo copy at apps/server/capability-media is used; an optional bundled build (AIRWAVE_BUNDLE_MEDIA)
// ships them at server/capability-media for offline installs. Falls back to the user-data dir either way.
const CAP_MEDIA_MONO = join(SERVER_DIR, "capability-media");
const CAP_MEDIA_USER = join(DATA_DIR, "capability-media");
const CAP_MEDIA_URL =
  process.env.CAP_MEDIA_URL ||
  "https://github.com/Quixomatic/airwave-assets/releases/download/media-v1/capability-media.tar.gz";
function capMediaDir(): string {
  if (existsSync(join(CAP_MEDIA_MONO, "matrix.json")) || existsSync(CAP_MEDIA_MONO)) return CAP_MEDIA_MONO;
  return CAP_MEDIA_USER;
}
/** Progress of the first-run capability-media fetch, surfaced to the onboarding UI via /status. */
type MediaProgress = {
  state: "idle" | "downloading" | "extracting" | "ready" | "failed" | "skipped";
  downloaded: number;
  total: number;
  error?: string;
};
let mediaProgress: MediaProgress = { state: "idle", downloaded: 0, total: 0 };

/** Packaged first-run: fetch + extract the capability-probe clips into user-data (they're NOT in the installer).
 * Non-blocking, idempotent (a `.airwave-complete` marker), non-fatal — the server boots without them; the TV
 * codec-probe clips just 404 until this finishes, then serve (the server reads the dir per request). Streams the
 * download with byte progress (surfaced to onboarding via /status → `media`), then extracts via the system `tar`
 * (bsdtar on Win10+/mac/linux), like the Docker image's `tar -xz`. */
async function ensureCapMedia(): Promise<void> {
  if (!PACKAGED || existsSync(CAP_MEDIA_MONO)) {
    // dev uses the monorepo copy; an AIRWAVE_BUNDLE_MEDIA offline build baked them in.
    mediaProgress = { state: "skipped", downloaded: 0, total: 0 };
    return;
  }
  const marker = join(CAP_MEDIA_USER, ".airwave-complete");
  if (existsSync(marker)) {
    mediaProgress = { state: "ready", downloaded: 0, total: 0 };
    return;
  }
  console.log(`[desktop] fetching TV capability media (first run) from ${CAP_MEDIA_URL}…`);
  // Download INTO the target dir + extract with a RELATIVE filename (cwd = the dir, no `-C`), so no arg contains
  // a `C:\…` drive-colon — git's GNU `tar` (often first on Windows PATH) treats a leading `C:` as a REMOTE HOST
  // ("Cannot connect to C:") and 128s. bsdtar (Win/mac/linux) is happy either way.
  const tarName = "capability-media.tar.gz";
  const tmp = join(CAP_MEDIA_USER, tarName);
  try {
    mkdirSync(CAP_MEDIA_USER, { recursive: true });
    const res = await fetch(CAP_MEDIA_URL, { redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get("content-length")) || 0;
    mediaProgress = { state: "downloading", downloaded: 0, total };
    // Stream to disk explicitly (Bun.write(path, Response) buffers/stalls on a ~430MB body). Count bytes for
    // the onboarding progress bar.
    const sink = Bun.file(tmp).writer();
    const reader = res.body.getReader();
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sink.write(value);
      got += value.length;
      mediaProgress = { state: "downloading", downloaded: got, total };
      if (got % (16 * 1024 * 1024) < value.length) await sink.flush(); // periodic flush for backpressure
    }
    await sink.end();
    console.log(`[desktop] capability media downloaded (${(got / 1e6).toFixed(0)}MB) — extracting…`);
    mediaProgress = { state: "extracting", downloaded: got, total: total || got };
    const code = await run(["tar", "-xzf", tarName], { cwd: CAP_MEDIA_USER });
    if (code !== 0) throw new Error(`tar exit ${code}`);
    writeFileSync(marker, new Date().toISOString());
    mediaProgress = { state: "ready", downloaded: got, total: total || got };
    console.log("[desktop] capability media ready.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    mediaProgress = { state: "failed", downloaded: mediaProgress.downloaded, total: mediaProgress.total, error: msg };
    console.warn("[desktop] capability media fetch failed (codec-probe clips absent; non-fatal):", msg);
  } finally {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
  }
}

// The Airwave mark for the system tray. DEV resolves the committed square PNG (falls back to the admin's
// apple-touch-icon). TODO(dist): switch to `views://assets/airwave-tray.png` (electrobun `build.copy`) so it
// resolves inside the bundle. `template:false` — it's a full-color mark, not a macOS monochrome mask.
function trayIcon(): string {
  // Load via the `views://` scheme (electrobun `build.copy` puts `assets/*` into `views/assets/`). On Windows
  // the system tray is HICON-native, so a PNG doesn't render — use the multi-size `.ico`. mac/linux take the
  // PNG. (An absolute filesystem path also didn't render on the Windows tray.)
  return process.platform === "win32" ? "views://assets/icon.ico" : "views://assets/airwave-tray.png";
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

// ── Runtime state (who we spawned + on which ports) — the "reclaim our own ports" ledger ─────────────────
// Mirrors reapStalePostgres's postmaster.pid idea, but for the SERVER CHILD (and the supervisor itself). On a
// crash / force-quit, stopStack never runs, so the server child orphans and keeps holding its port; the next
// launch reads this file and — after PROVING the recorded pid still owns that exact port (pidOwnsPort) — reaps
// it and reclaims the stable port instead of drifting upward. It's also the single-instance guard: a second
// launch that finds a LIVE recorded supervisor (verified by port ownership) defers to it and exits.
const RUNTIME_PATH = join(DATA_DIR, "runtime.json");
type RuntimeState = {
  supervisorPid: number;
  serverPid?: number;
  pgPid?: number; // the embedded postmaster's PID (read from postmaster.pid after start) — reaped by port on next launch
  ports: Config["ports"];
  startedAt: string;
};
let runtime: RuntimeState | null = null;
function readRuntime(): RuntimeState | null {
  try {
    const r = JSON.parse(readFileSync(RUNTIME_PATH, "utf8")) as Partial<RuntimeState>;
    const p = r?.ports;
    // Validate the fields we actually dereference (supervisorPid + the ports we probe), so a truncated/corrupt
    // file becomes a clean `null` (→ normal startup) instead of a `prior.ports.setup` throw during boot.
    if (
      typeof r?.supervisorPid !== "number" ||
      !p ||
      typeof p.server !== "number" ||
      typeof p.admin !== "number" ||
      typeof p.setup !== "number"
    ) {
      return null;
    }
    return r as RuntimeState;
  } catch {
    return null;
  }
}
function persistRuntime(): void {
  if (!runtime) return;
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(RUNTIME_PATH, JSON.stringify(runtime, null, 2));
  } catch {
    /* best-effort */
  }
}

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

/**
 * The user-facing launcher to register for login-item autostart (NOT `process.execPath` — that's the inner
 * bundled Bun runtime). Derived from the bundle layout: `APP_ROOT` is `<bundle>/Resources/app`, so the launcher
 * lives two levels up. The resolved path is logged so it can be verified from a packaged install.
 *   Windows: `<install>\bin\launcher.exe`   macOS: `Airwave.app` (launched via `open`)   Linux: `<dir>/bin/launcher`
 */
function launcherPath(): string {
  // …/Airwave.app/Contents/Resources/app → up 3 = Airwave.app
  if (process.platform === "darwin") return dirname(dirname(dirname(APP_ROOT)));
  // …/<install>/Resources/app → up 2 = <install>; launcher under bin/
  const exe = process.platform === "win32" ? "launcher.exe" : "launcher";
  return join(dirname(dirname(APP_ROOT)), "bin", exe);
}

const LAUNCH_AGENT_PLIST = () => join(homedir(), "Library", "LaunchAgents", "tv.airwave.desktop.plist");
const LINUX_AUTOSTART = () => join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "autostart", "airwave.desktop");

function macLaunchAgentPlist(appPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>tv.airwave.desktop</string>
  <key>ProgramArguments</key>
  <array><string>/usr/bin/open</string><string>${appPath}</string></array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`;
}

function linuxAutostartEntry(exe: string): string {
  return `[Desktop Entry]
Type=Application
Name=Airwave
Exec=${exe}
Terminal=false
X-GNOME-Autostart-enabled=true
`;
}

/**
 * Register or remove an OS login item so the tray supervisor launches at user login. Per-user (no admin):
 * Windows = an HKCU `…\Run` value, macOS = a `~/Library/LaunchAgents` plist (GUI ⇒ LaunchAgent, launched via
 * `open`), Linux = a `~/.config/autostart/*.desktop` entry. PACKAGED-only (dev must never autostart) and
 * fail-soft — a login-item error must never break boot or /save.
 */
async function setRunOnStartup(enabled: boolean): Promise<void> {
  if (!PACKAGED) {
    console.log(`[desktop] runOnStartup=${enabled} — no-op in dev`);
    return;
  }
  const target = launcherPath();
  console.log(`[desktop] runOnStartup=${enabled} → ${target}`);
  try {
    if (process.platform === "win32") {
      const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
      await run(
        enabled
          ? ["reg", "add", key, "/v", "Airwave", "/t", "REG_SZ", "/d", `"${target}"`, "/f"]
          : ["reg", "delete", key, "/v", "Airwave", "/f"],
        {},
      );
    } else if (process.platform === "darwin") {
      const plist = LAUNCH_AGENT_PLIST();
      if (enabled) {
        mkdirSync(dirname(plist), { recursive: true });
        writeFileSync(plist, macLaunchAgentPlist(target));
      } else {
        rmSync(plist, { force: true });
      }
    } else {
      const entry = LINUX_AUTOSTART();
      if (enabled) {
        mkdirSync(dirname(entry), { recursive: true });
        writeFileSync(entry, linuxAutostartEntry(target));
      } else {
        rmSync(entry, { force: true });
      }
    }
  } catch (e) {
    console.error("[desktop] setRunOnStartup failed:", e);
  }
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

/** Return `preferred` if free, else scan upward, else let the OS hand out any free port. `taken` holds ports
 * we've ALREADY assigned this pass but not yet bound — critical because portFree() only checks the OS, so
 * without it two services whose preferred ports are both busy would each pick the same next-free port (they
 * aren't bound between calls). */
async function freePort(preferred: number, host = "127.0.0.1", taken?: Set<number>): Promise<number> {
  const usable = async (p: number) => !taken?.has(p) && (await portFree(p, host));
  if (await usable(preferred)) return preferred;
  for (let p = preferred + 1; p < preferred + 200; p++) {
    if (await usable(p)) {
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
 * existing service — or with each OTHER (track assigned ports in `taken`, since nothing is bound between the
 * freePort calls). PG + setup are loopback-internal; the server/admin/tv-web ports feed the browser URLs. */
async function resolvePorts(supervise: boolean): Promise<void> {
  const taken = new Set<number>();
  const pick = async (preferred: number, host?: string): Promise<number> => {
    const p = await freePort(preferred, host, taken);
    taken.add(p);
    return p;
  };
  config.ports.setup = await pick(config.ports.setup);
  if (!supervise) return;
  const bind = host();
  config.ports.server = await pick(config.ports.server, bind);
  config.ports.admin = await pick(config.ports.admin, bind);
  if (config.tvwebEnabled) config.ports.tvweb = await pick(config.ports.tvweb, bind);
  config.ports.pg = await pick(config.ports.pg);
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
// `runtimeEnv` = the "build once, deploy anywhere" recipe: a static SPA's `import.meta.env` is frozen at build
// time, but the admin must talk to whatever server port we resolved THIS launch (dynamic + proxy-aware). So we
// inject the runtime values into the served `index.html` as `window.__AIRWAVE_ENV__` — read first by
// apps/web/src/lib/runtime-env.ts, ahead of the baked value. It's recomputed each supervisor start, so a
// re-resolved port is always reflected. Only the ADMIN needs it (tv-web resolves its server at runtime on its
// own); pass `undefined` for tv-web. The HTML text (with the injected tag) is materialized once at startup.
function serveDir(dist: string, port: number, runtimeEnv?: Record<string, string>): ReturnType<typeof Bun.serve> | null {
  const index = join(dist, "index.html");
  if (!existsSync(index)) {
    console.error(`[desktop] no build at ${dist} (run \`turbo -F web build\` / \`-F tv-web build\`).`);
    return null;
  }
  const indexHtml = ((): string => {
    let html = readFileSync(index, "utf8");
    if (runtimeEnv) {
      // A classic (non-module) inline script runs during parse, before Vite's deferred module bundle — so the
      // global is set before the app reads it. Place it right after <head> to guarantee it's first.
      const tag = `<script>window.__AIRWAVE_ENV__=${JSON.stringify(runtimeEnv)};</script>`;
      html = html.includes("<head>") ? html.replace("<head>", `<head>${tag}`) : `${tag}${html}`;
    }
    return html;
  })();
  const htmlResponse = () =>
    new Response(indexHtml, { headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
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
        // Serve the injected HTML for index.html itself; other files (JS/CSS/assets) stream straight from disk.
        if (filePath === index) return htmlResponse();
        const headers = filePath.includes(`${sep}assets${sep}`)
          ? { "Cache-Control": "public, max-age=31536000, immutable" }
          : { "Cache-Control": "no-cache" };
        return new Response(Bun.file(filePath), { headers });
      }
      return htmlResponse(); // SPA fallback — the (injected) index
    },
  });
}

// ── Process supervision (mirrors docker/entrypoint.sh) ───────────────────────────────────────────────────
// embedded-postgres dynamically imports one of ~8 per-platform binary packages (only the current platform's is
// installed). It's loaded via a NON-LITERAL specifier because electrobun's bundler can't resolve node_modules
// deps at build time (it only knows `bun` builtins + `electrobun/bun`) — a literal `import "embedded-postgres"`
// fails the electrobun build outright. So:
//   • dev: resolve the wrapper from node_modules (`"embedded-postgres"`), same as the container.
//   • packaged: import the pre-bundled `pg/pg-launcher.mjs` by ABSOLUTE path (electrobun never resolves it at
//     build time). That file is the wrapper + `pg` + `async-exit-hook` bundled into one (via `build:pg-launcher`),
//     with the 8 platform pkgs left external; the current platform's binary pkg is copied to
//     `pg/node_modules/@embedded-postgres/<platform>` so the launcher's runtime `import()` of it resolves.
// See electrobun.config.ts + `.plans/desktop-server.md` §12.
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
  const spec = PACKAGED ? pathToFileURL(join(APP_ROOT, "pg", "pg-launcher.mjs")).href : "embedded-postgres";
  const mod = (await import(spec)) as { default: EmbeddedPostgresCtor };
  return mod.default;
}

let pg: EmbeddedPostgresLike | null = null;
const servers: { stop(): void }[] = [];
const children: Subprocess[] = [];

/** Run a command and capture its stdout (best-effort; empty string on any failure). `timeout` kills a wedged
 * system tool (netstat/lsof/ss) so a probe can never hang boot — a timeout just yields "" → we don't reap. */
async function execCapture(cmd: string[]): Promise<string> {
  try {
    const p = spawn(cmd, { stdout: "pipe", stderr: "ignore", timeout: 4000 });
    const out = await new Response(p.stdout).text();
    await p.exited;
    return out;
  } catch {
    return "";
  }
}

/** True if `pid` is the process currently LISTENING on `port` — the ownership proof before we reap or defer.
 * This guards against PID reuse (a recycled pid that isn't ours) AND against killing an unrelated app that
 * happens to hold the port: we only act when the recorded pid AND the live port-holder are the same process.
 * If NONE of the probes are available (rare) the result is `false` → we conservatively DON'T reap (ports drift
 * as they did before this feature, but we never kill the wrong thing). */
async function pidOwnsPort(pid: number, port: number): Promise<boolean> {
  if (process.platform === "win32") {
    return netstatOwnsPort(await execCapture(["netstat", "-ano", "-p", "tcp"]), pid, port);
  }
  // macOS + most Linux: lsof, filtered to the port and to LISTENers, terse (pids only). Authoritative when it
  // produces ANY output (that output is already scoped to this port). Empty output = nothing on the port OR
  // lsof isn't installed — so fall through to ss, which covers the minimal-Linux case (iproute2 is near-ubiquitous).
  const viaLsof = await execCapture(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  if (viaLsof.trim()) return lsofOwnsPort(viaLsof, pid);
  return ssOwnsPort(await execCapture(["ss", "-Htlnp"]), pid, port);
}

/** True if a process with `pid` currently exists (signal 0 probes liveness without killing it). */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process (dead). EPERM = it exists but we can't signal it (still alive).
    return (err as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

/** Kill a process AND its descendants. Windows has no process groups, so TerminateProcess of a postmaster would
 * orphan its backend children (leaving them attached to the shared-memory segment) — `taskkill /T` walks the tree
 * while they're still children of the live postmaster. On POSIX, SIGTERM the postmaster (PG takes its children
 * down), escalating to SIGKILL if it lingers. */
async function killTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    // `run` returns the exit code (never throws), and a single taskkill can silently miss (a race, or /T can't
    // reach a backend that just got reparented off a dying postmaster). VERIFY the process is actually gone and
    // retry — a swallowed miss here is exactly what previously stranded a live orphan postmaster.
    for (let attempt = 0; attempt < 3 && isAlive(pid); attempt++) {
      await run(["taskkill", "/PID", String(pid), "/T", "/F"], {});
      for (let i = 0; i < 10 && isAlive(pid); i++) await Bun.sleep(100); // up to 1s to observe the tree exit
    }
    if (isAlive(pid)) console.warn(`[desktop] taskkill could not terminate pid ${pid} (tree) after retries.`);
    return;
  }
  try {
    process.kill(pid);
  } catch {
    /* already gone */
  }
  for (let i = 0; i < 40 && isAlive(pid); i++) await Bun.sleep(100); // up to 4s for a graceful exit
  if (isAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
    await Bun.sleep(300);
  }
}

/** Reap a Postgres still attached to OUR `pgdata` before starting our own. A hard quit / crash leaves the
 * embedded `postgres` running against `pgdata`; because our port-probe then picks a DIFFERENT free port,
 * `pg.start()` would launch a SECOND postmaster on the same data dir and die with `FATAL: pre-existing shared
 * memory block is still in use` (surfacing to the user as a silent hang on "starting the database"). The owning
 * PID is in `postmaster.pid`'s first line — this is a single-instance app, so that postmaster is ours: stop it
 * (whole tree) and clear the stale pid file so we start clean. Best-effort; never throws. */
async function reapStalePostgres(): Promise<void> {
  const pidFile = join(PG_DATA_DIR, "postmaster.pid");
  if (!existsSync(pidFile)) return;
  let pid = 0;
  try {
    pid = Number.parseInt(readFileSync(pidFile, "utf8").split("\n")[0]?.trim() ?? "", 10);
  } catch {
    /* unreadable — treat as stale */
  }
  if (Number.isInteger(pid) && pid > 0 && isAlive(pid)) {
    console.warn(`[desktop] a leftover Postgres (pid ${pid}) is still attached to ${PG_DATA_DIR} — stopping it before start.`);
    try {
      await killTree(pid);
    } catch (err) {
      console.warn(`[desktop] could not stop leftover Postgres (pid ${pid}):`, errText(err));
    }
    if (isAlive(pid)) {
      console.warn(`[desktop] leftover Postgres (pid ${pid}) survived the kill — start may fail with 'shared memory block still in use'.`);
    }
  }
  // We intentionally do NOT delete postmaster.pid. Postgres owns that file: it removes a stale one itself on start
  // when the recorded owner is dead, and while the owner is ALIVE this file is the only breadcrumb to it. Deleting
  // it here unconditionally (even when the kill above silently failed) is exactly what previously stranded a live
  // orphan with no pid file — after which every later launch early-returned above and never reaped it. The
  // ledger-based reapStalePg (port-verified, runs before resolvePorts) is now the primary reap path.
}

/** Windows: PIDs of `postgres.exe` processes whose recorded PARENT is `ppid`. PG18 spawns `io_worker` (and backend)
 * children that can OUTLIVE a killed/crashed postmaster and keep holding pgdata's shared-memory block + its inherited
 * listening socket (netstat then still stale-attributes the port to the dead postmaster). Win32_Process retains
 * ParentProcessId after the parent exits, so we can find these orphans by the dead postmaster's pid. Empty on any
 * failure (no CIM, timeout) so a probe can never hang or break boot. */
async function postgresChildPids(ppid: number): Promise<number[]> {
  if (process.platform !== "win32") return [];
  const out = await execCapture([
    "powershell",
    "-NoProfile",
    "-Command",
    `Get-CimInstance Win32_Process -Filter "Name='postgres.exe' AND ParentProcessId=${ppid}" | ForEach-Object { $_.ProcessId }`,
  ]);
  return out
    .split(/\r?\n/)
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** Reap OUR OWN orphaned embedded Postgres from a prior unclean exit (the dev watcher SIGKILLs the supervisor, so
 * stopStack's graceful pg.stop() never runs and the postmaster orphans). Mirrors reapStaleStack: kill the recorded
 * postmaster pid when it's alive AND provably owns the recorded pg port (pidOwnsPort — safe against PID reuse).
 * Runs BEFORE resolvePorts so the freed port is reclaimed (no upward drift), and doesn't depend on postmaster.pid
 * (the very thing that goes missing). Best-effort; never throws.
 *
 * Two shapes of orphan, both handled:
 *  1) Postmaster still alive — killTree(/T) takes it AND its children in one shot.
 *  2) Postmaster DEAD but a PG18 io_worker/backend child lives on, still holding pgdata's shared-memory block (the
 *     block is keyed to the DATA DIR, so a fresh port doesn't dodge it — this is the "shared memory block still in
 *     use" restart failure). isAlive(ppid) is false here, so we find the survivors by their recorded parent pid and
 *     kill them. */
async function reapStalePg(prior: RuntimeState): Promise<void> {
  const ppid = prior.pgPid;
  if (!ppid) return;
  const pport = prior.ports.pg;
  // (1) Live postmaster still holding our port → kill the whole tree.
  if (isAlive(ppid) && (await pidOwnsPort(ppid, pport))) {
    console.warn(`[desktop] reaping orphaned embedded Postgres (pid ${ppid}) still holding port ${pport} (unclean prior exit).`);
    try {
      await killTree(ppid);
    } catch (err) {
      console.warn(`[desktop] could not reap orphaned Postgres (pid ${ppid}):`, errText(err));
    }
  }
  // (2) Orphaned children of a dead (or just-killed) postmaster — the io_worker/backend that actually pins pgdata.
  for (const cpid of await postgresChildPids(ppid)) {
    console.warn(`[desktop] reaping orphaned Postgres child (pid ${cpid}) of postmaster ${ppid} — still holding pgdata's shared memory.`);
    try {
      await killTree(cpid);
    } catch (err) {
      console.warn(`[desktop] could not reap orphaned Postgres child (pid ${cpid}):`, errText(err));
    }
  }
}

/** Reap OUR OWN orphaned server child from a prior unclean exit (crash / force-quit), so we can reclaim its
 * stable port instead of drifting upward. Only kills a pid we recorded spawning AND that provably still owns
 * that port (pidOwnsPort) — never a blind "whoever holds this port." Postgres orphans are handled separately,
 * anchored to pgdata's postmaster.pid (reapStalePostgres). Best-effort; never throws. */
async function reapStaleStack(prior: RuntimeState): Promise<void> {
  const spid = prior.serverPid;
  if (!spid || !isAlive(spid)) return;
  if (await pidOwnsPort(spid, prior.ports.server)) {
    console.warn(`[desktop] reaping orphaned server (pid ${spid}) still holding port ${prior.ports.server} (unclean prior exit).`);
    try {
      await killTree(spid);
    } catch (err) {
      console.warn(`[desktop] could not reap orphaned server (pid ${spid}):`, errText(err));
    }
  } else {
    console.log(`[desktop] recorded server pid ${spid} no longer owns port ${prior.ports.server} — leaving it (pid likely reused).`);
  }
}

/** Start embedded Postgres (or skip if an external DATABASE_URL is configured); returns the DATABASE_URL. */
async function startPostgres(): Promise<string> {
  if (config.databaseUrl) {
    console.log("[desktop] using external DATABASE_URL (embedded Postgres skipped).");
    return config.databaseUrl;
  }
  setPhase("database");
  mkdirSync(DATA_DIR, { recursive: true });
  await reapStalePostgres(); // clear any orphaned postmaster on our pgdata (crash / hard-quit leftover)
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
  try {
    if (!existsSync(join(PG_DATA_DIR, "PG_VERSION"))) {
      console.log("[desktop] initialising embedded Postgres…");
      await pg.initialise();
    }
    await pg.start();
  } catch (err) {
    // embedded-postgres can reject with a bare object (→ the useless `{}` we used to log). Wrap it so the boot
    // catch surfaces an actionable message (which port / data dir) to the setup UI instead of a blank hang.
    throw new Error(`embedded Postgres failed to start (port ${config.ports.pg}, data ${PG_DATA_DIR}): ${errText(err)}`);
  }
  // Record the postmaster's real PID (postgres just wrote it to postmaster.pid) so the NEXT launch can reap THIS
  // exact cluster by port even after the pid file is gone — the same ledger idea as serverPid. Best-effort.
  try {
    const ppid = Number.parseInt(readFileSync(join(PG_DATA_DIR, "postmaster.pid"), "utf8").split("\n")[0]?.trim() ?? "", 10);
    if (runtime && Number.isInteger(ppid) && ppid > 0) {
      runtime.pgPid = ppid;
      persistRuntime();
    }
  } catch {
    /* best-effort — reapStalePostgres's pid-file path still covers a crash if this record is missing */
  }
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
  if (PACKAGED) return; // pre-baked in the bundle — nothing to build
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
  if (PACKAGED) return; // pre-baked at views/setup
  const idx = join(SETUP_UI_DIST, "index.html");
  if (!stale(idx, [join(REPO_ROOT, "apps", "desktop-setup", "src"), join(REPO_ROOT, "packages", "ui", "src")])) return;
  await build("@airwave/desktop-setup");
}

async function startStack(): Promise<void> {
  mkdirSync(BUMPER_MUSIC_DIR, { recursive: true });
  void ensureCapMedia(); // fire-and-forget: download the codec-probe clips in the background (packaged first run)

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
  if (PACKAGED) {
    // No pnpm/prisma CLI in the bundle → apply migrations with the engine-less runner (see migrate-standalone.ts).
    console.log("[desktop] applying migrations (engine-less)…");
    await run([bunBin(), MIGRATE_ENTRY], { env: { DATABASE_URL, MIGRATIONS_DIR } });
  } else {
    console.log("[desktop] prisma migrate deploy…");
    await run(pnpmArgs(["--filter", "@airwave/db", "db:migrate:deploy"]), { cwd: REPO_ROOT, env: { DATABASE_URL } });
  }

  // Bootstrap the durable workflow engine's schema (the `workflow.*` tables — graphile-worker + step tracking).
  // Channel Import AND the AI lineup engine query it (`workflow.workflow_steps`), so it runs regardless of the
  // workflows toggle. Dev/attach: `pnpm workflow:bootstrap`. Packaged: the bundled standalone bootstrap
  // (server/wf/dist/bootstrap.mjs + the shipped drizzle SQL — same setupDatabase(), graphile-worker's own SQL
  // is embedded in the JS). Idempotent (records what it applied), non-fatal.
  setPhase("workflow-bootstrap");
  console.log("[desktop] workflow bootstrap…");
  const wfEnv = {
    DATABASE_URL,
    BETTER_AUTH_SECRET: authSecret(),
    WORKFLOW_ENABLED: "1",
    // Same connection the engine uses — this is what actually creates the `workflow.*` schema.
    WORKFLOW_POSTGRES_URL: DATABASE_URL,
    WORKFLOW_TARGET_WORLD: "@workflow/world-postgres",
    WORKFLOW_LOCAL_BASE_URL: "http://127.0.0.1:3152",
  };
  const wfCode = PACKAGED
    ? await run([bunBin(), join(APP_ROOT, "wf", "bootstrap.mjs")], { env: wfEnv })
    : await run(pnpmArgs(["--filter", "server", "workflow:bootstrap"]), { cwd: REPO_ROOT, env: wfEnv });
  if (wfCode !== 0) {
    console.warn(`[desktop] workflow bootstrap failed (exit ${wfCode}) — imports/workflows may error until it succeeds.`);
  }

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
    // Dev: `bun run dist/index.mjs` from apps/server (bunfig preload + .well-known). Packaged: run the
    // self-contained `server.mjs` directly with the bundled bun.
    const srv = spawn(PACKAGED ? [bunBin(), SERVER_ENTRY] : ["bun", "run", "dist/index.mjs"], {
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
        // The bootstrap above created the `workflow.*` schema (dev via pnpm, packaged via the bundled runner),
        // so the engine can run in both — honor the toggle.
        WORKFLOW_ENABLED: config.workflowEnabled ? "1" : "",
        // The durable workflow engine connects via its OWN url (mirrors compose) — point it at the embedded PG
        // so its `workflow.*` schema lives in the SAME database Prisma reads (else `workflow.workflow_steps`
        // is missing for the app's observability queries). Defaults match compose.
        WORKFLOW_POSTGRES_URL: DATABASE_URL,
        WORKFLOW_TARGET_WORLD: "@workflow/world-postgres",
        WORKFLOW_LOCAL_BASE_URL: "http://127.0.0.1:3152",
        BUMPER_MUSIC_DIR,
        CAP_MEDIA_DIR: capMediaDir(),
        ...(admin ? { ADMIN_EMAIL: admin.email, ADMIN_PASSWORD: admin.password } : {}),
      },
    });
    pipeToLog(srv.stdout);
    pipeToLog(srv.stderr);
    children.push(srv);
    if (runtime && typeof srv.pid === "number") {
      runtime.serverPid = srv.pid; // record the port-holder so the next launch can reap it after an unclean exit
      persistRuntime();
    }
  }

  // Admin + tv-web static SPAs. Both bake VITE_SERVER_URL at BUILD time in dev/Docker, but the packaged bundles
  // ship WITHOUT it — so we INJECT it at serve time (window.__AIRWAVE_ENV__, the runtime-config recipe) so each
  // prebuilt bundle talks to whatever port we resolved this launch. Admin → the localhost server (same-site
  // cookies). tv-web → its browser-player server URL (LAN when exposed) so it AUTO-POINTS at this server instead
  // of showing the "enter a server" onboarding (that screen is only for a real TV app running on another device).
  const admin = serveDir(ADMIN_DIST, config.ports.admin, { VITE_SERVER_URL: adminServerUrl });
  if (admin) servers.push(admin);
  if (config.tvwebEnabled) {
    const tv = serveDir(TVWEB_DIST, config.ports.tvweb, { VITE_SERVER_URL: tvwebServerUrl });
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
      // AWAIT the whole tree's death (not a fire-and-forget c.kill()) so a fast restart — e.g. Settings → Save,
      // which stops then immediately restarts the stack — doesn't race a still-draining server on the same port.
      if (typeof c.pid === "number") await killTree(c.pid);
      else c.kill();
    } catch {
      /* ignore */
    }
  }
  children.length = 0;
  if (runtime) {
    runtime.serverPid = undefined; // the server child is gone — don't let the next launch try to reap a dead pid
    persistRuntime();
  }
  if (pg) {
    try {
      await pg.stop();
    } catch {
      /* ignore */
    }
    pg = null;
    if (runtime) {
      runtime.pgPid = undefined; // postmaster stopped cleanly — don't let the next launch try to reap a dead pid
      persistRuntime();
    }
  }
}

// ── Stack lifecycle (single-flight) ─────────────────────────────────────────────────────────────────────
let stackState: "idle" | "starting" | "up" = "idle";
// Granular provisioning phase for the onboarding UI's progress bar (surfaced via /status).
// Ordered keys: building-server → building-admin → building-tvweb → database → migrating → server → ready.
let stackPhase = "idle";
// The last boot failure, surfaced to the onboarding UI via /status so it shows an actionable error + Retry
// instead of polling forever on the phase it died in. Cleared when a new start attempt begins.
let phaseError: string | null = null;
function setPhase(p: string): void {
  stackPhase = p;
  console.log(`[desktop] phase: ${p}`);
}
/** Extract a human message from an unknown throw — embedded-postgres (and others) can reject with a bare object
 * that would otherwise stringify to a useless `{}`. */
function errText(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || "Error";
  if (typeof err === "string") return err;
  try {
    const s = JSON.stringify(err);
    if (s && s !== "{}" && s !== "null") return s;
  } catch {
    /* not serialisable */
  }
  return String(err);
}
/** Start the supervised stack once; safe to call repeatedly. Returns whether the stack is up. */
async function ensureStackUp(): Promise<boolean> {
  if (stackState === "up") return true;
  if (stackState === "starting") return false;
  stackState = "starting";
  phaseError = null; // a fresh attempt clears any prior failure
  try {
    await startStack();
    stackState = "up";
    console.log("[desktop] stack up.");
    return true;
  } catch (err) {
    stackState = "idle";
    phaseError = errText(err);
    // Record which phase we died in so the log (and the UI, via /status) pinpoint it — no more blank `{}`.
    console.error(`[desktop] failed to start the stack (phase=${stackPhase}): ${phaseError}`);
    return false;
  }
}

// ── Diagnostics (the setup UI's "Report to developer" button) ────────────────────────────────────────────
/** The last N lines of desktop.log (the whole file is append-only across runs; the tail is what matters). */
function readLogTail(maxLines = 600): string {
  try {
    return readFileSync(LOG_PATH, "utf8").split(/\r?\n/).slice(-maxLines).join("\n");
  } catch {
    return "(no desktop.log found)";
  }
}
/** Redact secrets before a user shares logs on a PUBLIC issue: the home dir (username) → `~`, and any
 * token/secret/password/key value. Best-effort — better to over-redact than leak a Plex token. */
function scrubLog(text: string): string {
  let s = text;
  const home = homedir();
  if (home && home.length > 3) s = s.split(home).join("~");
  s = s.replace(
    /((?:x-plex-token|plex[_-]?token|token|secret|password|passwd|api[_-]?key|authorization|better[_-]?auth[_-]?secret)\s*["']?\s*[:=]\s*["']?)([^\s"'&,}]+)/gi,
    (_m, k: string) => `${k}[redacted]`,
  );
  return s;
}
/** The exact `install` dropdown option (must match apps/../.github/ISSUE_TEMPLATE/bug_report.yml) for prefill. */
function platformInstallLabel(): string {
  if (process.platform === "win32") return "Server — Desktop app, Windows";
  if (process.platform === "darwin")
    return process.arch === "arm64"
      ? "Server — Desktop app, macOS (Apple Silicon / M-series)"
      : "Server — Desktop app, macOS (Intel)";
  return "Server — Desktop app, Linux";
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
          runOnStartup?: boolean;
          silentStartup?: boolean;
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
          runOnStartup: !!body.runOnStartup,
          silentStartup: !!body.silentStartup,
          serverAddress: (body.serverAddress ?? "").trim().replace(/\/+$/, ""),
          webAddress: (body.webAddress ?? "").trim().replace(/\/+$/, ""),
          extraCorsOrigins: (body.extraCorsOrigins ?? "").trim(),
          configured: true,
        };
        saveConfig(config);
        void setRunOnStartup(config.runOnStartup); // apply the OS login item immediately on save
        refreshTray(); // onboarding done → enable Open Admin/TV player + relabel "Set up Airwave" → "Settings"
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
          runOnStartup: config.runOnStartup,
          silentStartup: config.silentStartup,
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
          error: up ? null : phaseError, // set → the boot failed at `phase`; the UI shows it + a Retry button
          adminUrl: adminUrl(),
          media: mediaProgress, // {state, downloaded, total} — the onboarding UI shows a capability-media step
        });
      }

      // Retry a failed provisioning run (the setup UI's "Try again" after a /status error). Config is already
      // saved by this point, so just kick the stack again — ensureStackUp clears the prior error.
      if (req.method === "POST" && url.pathname === "/retry") {
        if (!attach && stackState !== "up") void ensureStackUp();
        return Response.json({ ok: true });
      }

      // Diagnostics for the "Report to developer" button: the scrubbed log (the UI copies it to the clipboard)
      // + the exact `install` dropdown option so the setup UI can prefill the GitHub issue form.
      if (url.pathname === "/diagnostics") {
        return Response.json({ scrubbed: scrubLog(readLogTail()), install: platformInstallLabel() });
      }

      // Open a URL in the user's real browser (the setup UI runs in a webview; window.open there can't reach the
      // system browser). Restricted to our own repo's New-Issue links so it can't be turned into an open redirect.
      if (req.method === "POST" && url.pathname === "/open-url") {
        const body = (await req.json().catch(() => ({}))) as { url?: string };
        const u = (body.url ?? "").trim();
        if (u.startsWith("https://github.com/Quixomatic/Airwave/")) {
          openBrowser(u);
          return Response.json({ ok: true });
        }
        return Response.json({ ok: false, error: "url not allowed" }, { status: 400 });
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
      if(j.error){
        st.className='err';
        st.textContent='Setup failed at "'+(j.phase||'startup')+'": '+j.error+' — check the log, then retry.';
        var b=document.getElementById('save');if(b){b.disabled=false;b.textContent='Try again';}
        return;
      }
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
  const width = 560;
  const height = 700;
  setupWindow = new BrowserWindow({
    title: "Airwave",
    url: setupUrl(),
    frame: { width, height, x: 160, y: 120 },
  });
  setupWindow.on("close", () => {
    setupWindow = null;
  });
  // The webview mis-measures viewport height on first paint (content ends up off-center) — nudge the size once
  // and revert so it re-measures. Same trick BasicTimeTracker used for CEF; WebView2 needs it too.
  setTimeout(() => {
    setupWindow?.setSize(width, height + 1);
    setTimeout(() => setupWindow?.setSize(width, height), 16);
  }, 150);
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
  if (config.silentStartup) {
    console.log("[desktop] stack ready — silent startup, not opening the browser (open it from the tray).");
  } else {
    console.log("[desktop] stack ready — opening the admin in your browser.");
    openBrowser(adminUrl());
  }
  hideSetupWindow();
}

// ── Tray ────────────────────────────────────────────────────────────────────────────────────────────────
let tray: Tray | null = null;

/** The menu, computed from current state. Until onboarding is done (and not attached to a dev stack), the app
 * has no running admin/tv-web yet — so "Open Admin"/"Open TV player" are DISABLED and the config item reads
 * "Set up Airwave" (reopens the onboarding window, which the user may have closed). Once configured it flips to
 * the normal enabled menu with "Settings". `refreshTray()` re-applies it when `configured` changes. */
function trayMenu() {
  const ready = attach || config.configured;
  return [
    { type: "normal", label: "Open Admin", action: "open-admin", enabled: ready },
    { type: "normal", label: "Open TV player", action: "open-tvweb", hidden: !config.tvwebEnabled, enabled: ready },
    { type: "divider" },
    // NO Unicode in labels (the native menu renders U+2026 "…" as garbage) — plain ASCII only.
    { type: "normal", label: ready ? "Settings" : "Set up Airwave", action: "settings" },
    { type: "normal", label: `Server: ${serverLanUrl()}`, action: "noop", enabled: false },
    { type: "divider" },
    { type: "normal", label: "Quit", action: "quit" },
  ] as const;
}

/** Re-apply the tray menu after state changes (e.g. onboarding finishes → enable Open Admin/TV, relabel). */
function refreshTray(): void {
  try {
    tray?.setMenu(trayMenu() as never);
  } catch {
    /* ignore */
  }
}

function buildTray(): Tray {
  // Tray needs the pixel size (defaults to 16×16); our icon is a 32×32 full-color PNG (template:false).
  tray = new Tray({ title: "Airwave", image: trayIcon(), template: false, width: 32, height: 32 });
  tray.setMenu(trayMenu() as never);
  tray.on("tray-clicked", (e) => {
    const action = (e as { data?: { action?: string } }).data?.action;
    switch (action) {
      case "open-admin":
        // Guard even though the item is disabled pre-onboarding — the stack isn't up yet.
        if (attach || config.configured) openBrowser(adminUrl());
        else void openSetupWindow();
        break;
      case "open-tvweb":
        if (attach || config.configured) openBrowser(tvwebUrl());
        else void openSetupWindow();
        break;
      case "settings":
        void openSetupWindow(); // onboarding (pre-config) OR settings (post-config) — the served UI picks by /config
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

// Single-instance + reclaim-our-own-ports, BEFORE anything binds. Only when we'd supervise our own stack (an
// attached dev stack owns 3000/1/2 and never writes runtime.json). Wrapped so NOTHING here can break boot: on
// a fresh install runtime.json doesn't exist yet (readRuntime → null → both branches skipped), and any
// unexpected failure just falls through to the normal "resolve to nearby free ports" path below.
if (!attach) {
  try {
    const prior = readRuntime();
    if (
      prior &&
      prior.supervisorPid !== process.pid &&
      isAlive(prior.supervisorPid) &&
      (await pidOwnsPort(prior.supervisorPid, prior.ports.setup))
    ) {
      // Another Airwave desktop is already running (its supervisor still owns the setup port) — true single
      // instance: surface the running one (open its admin) and exit instead of spinning up a parallel stack.
      console.log(`[desktop] another instance is already running (pid ${prior.supervisorPid}) — opening its admin and exiting.`);
      openBrowser(`http://localhost:${prior.ports.admin}`);
      await Bun.sleep(300); // let the detached browser launch dispatch before we exit
      process.exit(0);
    }
    if (prior) {
      await reapStaleStack(prior); // kill our own crash-orphan server child (verified by port ownership)
      await reapStalePg(prior); // kill our own crash-orphan embedded Postgres (verified by port ownership) — frees pgdata + its port
      config.ports = { ...config.ports, ...prior.ports }; // prefer the last-used ports so the admin URL stays stable across restarts
    }
  } catch (err) {
    // Belt-and-suspenders: never let the reclaim logic break startup — worst case we resolve nearby ports as before.
    console.warn("[desktop] single-instance/reap check failed (continuing to normal startup):", errText(err));
  }
}

// Resolve to actually-free ports before anything binds or bakes a URL (no container network to isolate us).
await resolvePorts(!attach);

// Record this run so the NEXT launch can detect us (single-instance) or reap our orphan (crash). !attach only —
// an attached dev stack isn't ours to supervise.
if (!attach) {
  runtime = { supervisorPid: process.pid, ports: config.ports, startedAt: new Date().toISOString() };
  persistRuntime();
}

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
  // Already configured — auto-start. ensureStackUp re-runs the stale-Postgres reap, so a crash/hard-quit leftover
  // self-heals here. If it STILL fails, don't die silently in the tray: open the window so the error + Retry show.
  if (await ensureStackUp()) onStackReady();
  else {
    console.warn("[desktop] stack failed to start on launch — opening the window to surface the error.");
    await openSetupWindow();
  }
}

console.log(`[desktop] supervisor up. data=${DATA_DIR} attach=${attach} admin=${adminUrl()} setup=${setupUrl()}`);
