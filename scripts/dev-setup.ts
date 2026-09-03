/**
 * Airwave contributor dev setup wizard.
 *
 *   pnpm dev:setup            run it
 *   pnpm dev:setup --dry-run  walk the whole flow, touch nothing (no files, no DB)
 *
 * Gets a fresh clone from `git clone` to `pnpm dev:core` in one pretty pass:
 * checks prerequisites, writes the .env files from the .env.example templates,
 * generates the secrets, wires the workflow engine at your Postgres, tests the
 * connection, and applies migrations.
 *
 * Re-run safe: when a .env already exists its current values become the
 * defaults, and stable secrets (BETTER_AUTH_SECRET, PLEX_CLIENT_IDENTIFIER) are
 * KEPT — regenerating BETTER_AUTH_SECRET would make every stored encrypted
 * secret (Plex token, AI keys) undecryptable. The prior file is backed up to
 * .env.bak, and any extra vars you've tuned are preserved.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as p from "@clack/prompts";
import pc from "picocolors";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN =
  process.argv.includes("--dry-run") || process.argv.includes("-n");

const SERVER_ENV = join(ROOT, "apps", "server", ".env");
const SERVER_ENV_EXAMPLE = join(ROOT, "apps", "server", ".env.example");
const WEB_ENV = join(ROOT, "apps", "web", ".env");
const WEB_ENV_EXAMPLE = join(ROOT, "apps", "web", ".env.example");
// tv-web reads VITE_SERVER_URL from .env.local in dev; .env.production is left
// intentionally empty (same-origin build), so we only ever write .env.local.
const TVWEB_ENV_LOCAL = join(ROOT, "apps", "tv-web", ".env.local");
// tv-native (Expo) reads EXPO_PUBLIC_SERVER_URL from .env.local in dev.
const TVNATIVE_ENV_LOCAL = join(ROOT, "apps", "tv-native", ".env.local");
const TVNATIVE_ENV_EXAMPLE = join(ROOT, "apps", "tv-native", ".env.example");

// Localhost defaults — the .env.example files carry these too, but we set them
// explicitly so a fresh run always lands on a coherent dev config.
const BETTER_AUTH_URL = "http://localhost:3000";
const CORS_ORIGIN = "http://localhost:3001";
const TV_APP_ORIGIN = "http://localhost:3002";
const SERVER_URL = "http://localhost:3000"; // what web + TV clients point at
const WORKFLOW_LOCAL_BASE_URL = "http://127.0.0.1:3152";
const BUMPER_MUSIC_DIR = "./bumper-music";
const DEFAULT_DB_URL =
  "postgresql://postgres:postgres@localhost:5432/airwave?schema=public";

/** Parse `KEY=value` lines from an .env file (commented lines ignored). */
function parseEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Set `KEY=value` in an .env body: update an active line, uncomment a
 *  commented one in place, or append. Function-form replacer so `$` in
 *  secrets/URLs is never treated as a backreference. */
function setEnvVar(body: string, key: string, value: string): string {
  const active = new RegExp(`^${key}=.*$`, "m");
  if (active.test(body)) return body.replace(active, () => `${key}=${value}`);
  const commented = new RegExp(`^#\\s*${key}=.*$`, "m");
  if (commented.test(body)) return body.replace(commented, () => `${key}=${value}`);
  return `${body.trimEnd()}\n${key}=${value}\n`;
}

/** Probe host:port with a bare TCP connect — no pg client dependency. */
function tcpProbe(host: string, port: number, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function cmdVersion(cmd: string): string | null {
  const r = spawnSync(`${cmd} --version`, { shell: true, encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout.trim().split("\n")[0].replace(/^v/, "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run a shell command, resolving with combined output + exit code. */
function runShell(command: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true });
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
    child.on("error", (e) => resolve({ code: 1, out: String(e) }));
  });
}

// The official rustup one-liner (macOS/Linux). Windows uses detect + guide.
const RUSTUP_UNIX =
  "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile default";

const rustPhase = (pct: number): string =>
  pct < 20
    ? "downloading rustup-init"
    : pct < 55
      ? "installing stable toolchain"
      : pct < 80
        ? "unpacking components"
        : pct < 100
          ? "configuring cargo + PATH"
          : "done";

/** Animated Rust install. simulate=true → a fake timeline (dry run); otherwise
 *  the real macOS/Linux rustup install, with the bar easing while it runs. */
async function installRustWithBar(simulate: boolean): Promise<boolean> {
  const pr = p.progress({ style: "block", max: 100, size: 28 });
  let cur = 0;
  const to = (pct: number) => {
    pr.advance(pct - cur, rustPhase(pct));
    cur = pct;
  };
  pr.start(rustPhase(0));

  if (simulate) {
    for (let pct = 0; pct <= 100; pct += 4) {
      to(pct);
      await sleep(55);
    }
    pr.stop(`${pc.green("✓")} Rust installed ${pc.dim("(simulated — dry run)")}`);
    return true;
  }

  let done = false;
  let result: { code: number; out: string } = { code: 1, out: "" };
  const work = runShell(RUSTUP_UNIX)
    .then((r) => {
      result = r;
    })
    .finally(() => {
      done = true;
    });
  // Ease toward 88% while the installer runs, then snap to 100 on success.
  while (!done) {
    const inc = cur < 55 ? 4 : cur < 88 ? 1 : 0;
    if (inc) to(Math.min(88, cur + inc));
    await sleep(200);
  }
  await work;
  if (result.code === 0) {
    to(100);
    pr.stop(`${pc.green("✓")} Rust installed`);
    return true;
  }
  pr.error(`${pc.red("✗")} rustup install failed`);
  const tail = result.out.trim().split("\n").slice(-6).join("\n");
  if (tail) p.log.error(pc.dim(tail));
  return false;
}

/** Platform-specific non-Rust deps tv-tauri needs (rustup can't install these). */
function tauriDepsNote(): string {
  if (process.platform === "win32")
    return [
      `${pc.dim("Build tools")}  MSVC C++ Build Tools — Visual Studio Build Tools,`,
      `             "Desktop development with C++" (Rust compiles through it)`,
      `${pc.dim("WebView2")}     runtime (preinstalled on Windows 11)`,
      `${pc.dim("libmpv")}       bundled per-platform by tv-tauri`,
    ].join("\n");
  if (process.platform === "darwin")
    return [
      `${pc.dim("Xcode CLT")}   xcode-select --install`,
      `${pc.dim("libmpv")}      bundled per-platform by tv-tauri`,
    ].join("\n");
  return [
    `${pc.dim("System")}   webkit2gtk + build tools, e.g. Debian/Ubuntu:`,
    `         sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libmpv-dev`,
  ].join("\n");
}

function bail(message: string): never {
  p.cancel(message);
  process.exit(1);
}

/** Clack returns a cancel symbol on Ctrl-C; treat it as an abort everywhere. */
function guard<T>(value: T | symbol): T {
  if (p.isCancel(value)) bail("Setup cancelled. Nothing was written.");
  return value as T;
}

async function main() {
  console.log("");
  p.intro(`${pc.bgMagenta(pc.black(" Airwave "))} ${pc.bold("dev setup")}`);

  if (DRY_RUN) {
    p.log.warn(
      pc.yellow(
        "Dry run — walking the whole flow, but no files will be written and no migrations will run.",
      ),
    );
  }

  // Existing values become the defaults on a re-run.
  const prev = parseEnv(SERVER_ENV);
  if (Object.keys(prev).length > 0) {
    p.log.info(
      pc.dim("Found an existing apps/server/.env — using its values as defaults."),
    );
  }

  // 1. Prerequisites -------------------------------------------------------
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const bunVersion = cmdVersion("bun");
  const pnpmVersion = cmdVersion("pnpm");

  p.note(
    [
      `${nodeMajor >= 22 ? pc.green("✓") : pc.red("✗")} Node    ${pc.dim(process.versions.node)}${nodeMajor >= 22 ? "" : pc.red("  (need 22+)")}`,
      `${bunVersion ? pc.green("✓") : pc.red("✗")} Bun     ${pc.dim(bunVersion ?? "not found")}`,
      `${pnpmVersion ? pc.green("✓") : pc.red("✗")} pnpm    ${pc.dim(pnpmVersion ?? "not found")}`,
    ].join("\n"),
    "Prerequisites",
  );

  if (nodeMajor < 22) bail("Node 22 or newer is required. Upgrade Node and re-run.");

  // 2. Postgres ------------------------------------------------------------
  p.note(
    [
      `${pc.dim("format")}  postgresql://${pc.cyan("user")}:${pc.cyan("password")}@${pc.cyan("host")}:${pc.cyan("port")}/${pc.cyan("database")}?schema=${pc.cyan("public")}`,
      `${pc.dim("local")}   ${DEFAULT_DB_URL}`,
      "",
      pc.dim("Point it at a running Postgres. The database is created by the migration if it"),
      pc.dim("does not exist yet, but the server/port must be reachable."),
      pc.dim("Keep ?schema=public unless you deliberately use another schema — Airwave's"),
      pc.dim("workflow engine lives in its own schema in the same database."),
    ].join("\n"),
    "Postgres connection",
  );

  let dbUrl = guard(
    await p.text({
      message: "Postgres connection string",
      placeholder: DEFAULT_DB_URL,
      initialValue: prev.DATABASE_URL || DEFAULT_DB_URL,
      validate(value) {
        if (!value) return "Required.";
        let u: URL;
        try {
          u = new URL(value);
        } catch {
          return "That is not a valid URL.";
        }
        if (!/^postgres(ql)?:$/.test(u.protocol))
          return "Must start with postgresql:// (or postgres://).";
        if (!u.hostname) return "Missing host.";
        return undefined;
      },
    }),
  );

  const parsed = new URL(dbUrl);
  const host = parsed.hostname;
  const port = Number(parsed.port || "5432");

  // Fill in ?schema=public only when no schema was specified at all — never
  // override a schema you set on purpose.
  if (!parsed.searchParams.has("schema")) {
    dbUrl += (dbUrl.includes("?") ? "&" : "?") + "schema=public";
    p.log.info(pc.dim("Added ?schema=public (Airwave's known-good default)."));
  }

  const probe = p.spinner();
  probe.start(`Reaching ${host}:${port}`);
  const reachable = await tcpProbe(host, port);
  if (reachable) {
    probe.stop(`${pc.green("✓")} Postgres is reachable at ${host}:${port}`);
  } else {
    probe.stop(`${pc.yellow("!")} Could not reach ${host}:${port}`);
    const proceed = guard(
      await p.confirm({
        message:
          "Postgres did not answer. Continue anyway? (migrations will fail if it never comes up)",
        initialValue: false,
      }),
    );
    if (!proceed) bail("Start Postgres and re-run `pnpm dev:setup`.");
  }

  // 3. Workflow engine -----------------------------------------------------
  p.note(
    pc.dim(
      "The durable engine behind Build with AI / AI lineup + import. It runs in\nyour Postgres (its own schema in the same database). Optional — leave it off\nif you're not touching the AI features.",
    ),
    "AI workflow engine",
  );
  const workflowEnabled = guard(
    await p.confirm({
      message: "Enable the AI workflow engine?",
      initialValue: prev.WORKFLOW_ENABLED ? prev.WORKFLOW_ENABLED === "1" : true,
    }),
  );

  // 4. First admin ---------------------------------------------------------
  p.note(
    pc.dim("There is no public sign-up. This seeds the one account you log in with."),
    "First admin",
  );

  const adminEmail = guard(
    await p.text({
      message: "Admin email",
      placeholder: "admin@example.com",
      initialValue: prev.ADMIN_EMAIL || "admin@example.com",
      validate(value) {
        if (!value) return "Required.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "That is not a valid email.";
        return undefined;
      },
    }),
  );

  let adminPassword = "";
  let adminPasswordKept = false;
  if (prev.ADMIN_PASSWORD) {
    const keep = guard(
      await p.confirm({ message: "Keep the existing admin password?", initialValue: true }),
    );
    if (keep) {
      adminPassword = prev.ADMIN_PASSWORD;
      adminPasswordKept = true;
    }
  }
  if (!adminPassword) {
    adminPassword = guard(
      await p.password({
        message: "Admin password",
        validate(value) {
          if (!value) return "Required.";
          if (value.length < 8) return "Use at least 8 characters.";
          return undefined;
        },
      }),
    );
  }

  // 5. Secrets — keep stable ones, generate what's missing -----------------
  const authSecretKept = !!prev.BETTER_AUTH_SECRET;
  const authSecret = prev.BETTER_AUTH_SECRET || randomBytes(48).toString("base64");
  const plexIdKept = !!prev.PLEX_CLIENT_IDENTIFIER;
  const plexId = prev.PLEX_CLIENT_IDENTIFIER || randomUUID();

  // Values inherited from the existing file where present.
  const workflowBaseUrl = prev.WORKFLOW_LOCAL_BASE_URL || WORKFLOW_LOCAL_BASE_URL;
  const bumperDir = prev.BUMPER_MUSIC_DIR || BUMPER_MUSIC_DIR;
  const tvAppOrigin = prev.TV_APP_ORIGIN || TV_APP_ORIGIN;

  // 6. Confirm the plan ----------------------------------------------------
  const serverExists = existsSync(SERVER_ENV);
  const webExists = existsSync(WEB_ENV);
  const tvwebExists = existsSync(TVWEB_ENV_LOCAL);
  const tvnativeExists = existsSync(TVNATIVE_ENV_LOCAL);
  const flag = (exists: boolean) =>
    exists ? pc.yellow("exists → back up to .env.bak, overwrite") : pc.green("create");
  const kept = (was: boolean) => (was ? pc.dim("kept existing") : pc.green("generated"));

  p.note(
    [
      `${pc.cyan("apps/server/.env")}          ${flag(serverExists)}`,
      `${pc.cyan("apps/web/.env")}             ${flag(webExists)}`,
      `${pc.cyan("apps/tv-web/.env.local")}    ${flag(tvwebExists)}`,
      `${pc.cyan("apps/tv-native/.env.local")} ${flag(tvnativeExists)}`,
      "",
      `DATABASE_URL             ${pc.dim(dbUrl)}`,
      `BETTER_AUTH_SECRET       ${kept(authSecretKept)} ${pc.dim(`(${authSecret.slice(0, 6)}… ${authSecret.length} chars)`)}`,
      `BETTER_AUTH_URL          ${pc.dim(BETTER_AUTH_URL)}`,
      `CORS_ORIGIN              ${pc.dim(CORS_ORIGIN)}`,
      `TV_APP_ORIGIN            ${pc.dim(tvAppOrigin)}`,
      `ADMIN_EMAIL              ${pc.dim(adminEmail)}`,
      `ADMIN_PASSWORD           ${pc.dim("•".repeat(adminPassword.length))} ${adminPasswordKept ? pc.dim("(kept)") : pc.green("(set)")}`,
      `PLEX_CLIENT_IDENTIFIER   ${kept(plexIdKept)} ${pc.dim(`(${plexId.slice(0, 8)}…)`)}`,
      `BUMPER_MUSIC_DIR         ${pc.dim(bumperDir)}`,
      `Workflow engine          ${workflowEnabled ? pc.green("enabled") + pc.dim(" → WORKFLOW_POSTGRES_URL = same database") : pc.dim("disabled (WORKFLOW_ENABLED=0)")}`,
      `VITE_SERVER_URL          ${pc.dim(SERVER_URL)}`,
      `EXPO_PUBLIC_SERVER_URL   ${pc.dim(SERVER_URL)}`,
    ].join("\n"),
    DRY_RUN ? "Would write" : "About to write",
  );

  if (serverExists || webExists || tvwebExists || tvnativeExists) {
    const ok = guard(
      await p.confirm({
        message: `Existing .env file(s) will be backed up to .env.bak and overwritten. Continue?`,
        initialValue: true,
      }),
    );
    if (!ok) bail("Left your existing .env files untouched.");
  }

  // 7. Render + write ------------------------------------------------------
  // Base a re-run on the EXISTING file (preserves comments + any extra vars
  // you've tuned); a fresh run starts from the .env.example template.
  const render = (target: string, fallbackBody: string, vars: Record<string, string>) => {
    let body = existsSync(target) ? readFileSync(target, "utf8") : fallbackBody;
    for (const [k, v] of Object.entries(vars)) body = setEnvVar(body, k, v);
    return body;
  };
  const commit = (target: string, body: string) => {
    if (DRY_RUN) return;
    if (existsSync(target)) copyFileSync(target, `${target}.bak`);
    writeFileSync(target, body);
  };

  const serverVars: Record<string, string> = {
    DATABASE_URL: dbUrl,
    BETTER_AUTH_SECRET: authSecret,
    BETTER_AUTH_URL: BETTER_AUTH_URL,
    CORS_ORIGIN: CORS_ORIGIN,
    TV_APP_ORIGIN: tvAppOrigin,
    ADMIN_EMAIL: adminEmail,
    ADMIN_PASSWORD: adminPassword,
    PLEX_CLIENT_IDENTIFIER: plexId,
    BUMPER_MUSIC_DIR: bumperDir,
    WORKFLOW_ENABLED: workflowEnabled ? "1" : "0",
  };
  if (workflowEnabled) {
    serverVars.WORKFLOW_TARGET_WORLD = "postgres";
    serverVars.WORKFLOW_POSTGRES_URL = dbUrl; // same database, its own schema
    serverVars.WORKFLOW_LOCAL_BASE_URL = workflowBaseUrl;
    // 0 = build the full lineup per run (unset also means full).
    serverVars.AI_LINEUP_BUILD_LIMIT = prev.AI_LINEUP_BUILD_LIMIT || "0";
  }

  const tvwebBody = [
    "# ============================================================================",
    "#  Airwave tv-web (webOS TV app) — LOCAL DEVELOPMENT",
    "#  Points the TV app at your dev API. The production build uses",
    "#  .env.production, which is left intentionally empty (same-origin).",
    "# ============================================================================",
    `VITE_SERVER_URL=${SERVER_URL}`,
    "",
  ].join("\n");

  const serverBody = render(SERVER_ENV, readFileSync(SERVER_ENV_EXAMPLE, "utf8"), serverVars);
  const webBody = render(WEB_ENV, readFileSync(WEB_ENV_EXAMPLE, "utf8"), {
    VITE_SERVER_URL: SERVER_URL,
  });
  const tvwebBodyOut = render(TVWEB_ENV_LOCAL, tvwebBody, { VITE_SERVER_URL: SERVER_URL });
  const tvnativeBody = render(
    TVNATIVE_ENV_LOCAL,
    readFileSync(TVNATIVE_ENV_EXAMPLE, "utf8"),
    { EXPO_PUBLIC_SERVER_URL: SERVER_URL },
  );

  const skip = (label: string) => (DRY_RUN ? `${label} (skipped — dry run)` : `${label} written`);

  await p.tasks([
    {
      title: "Writing apps/server/.env",
      task: async () => {
        commit(SERVER_ENV, serverBody);
        return skip("apps/server/.env");
      },
    },
    {
      title: "Writing apps/web/.env",
      task: async () => {
        commit(WEB_ENV, webBody);
        return skip("apps/web/.env");
      },
    },
    {
      title: "Writing apps/tv-web/.env.local",
      task: async () => {
        commit(TVWEB_ENV_LOCAL, tvwebBodyOut);
        return skip("apps/tv-web/.env.local");
      },
    },
    {
      title: "Writing apps/tv-native/.env.local",
      task: async () => {
        commit(TVNATIVE_ENV_LOCAL, tvnativeBody);
        return skip("apps/tv-native/.env.local");
      },
    },
    {
      title: "Applying database migrations (pnpm db:migrate)",
      task: async () => {
        if (DRY_RUN) return "migrations (skipped — dry run)";
        const r = spawnSync("pnpm db:migrate", {
          shell: true,
          cwd: ROOT,
          encoding: "utf8",
        });
        if (r.status !== 0) {
          const tail = (r.stderr || r.stdout || "").trim().split("\n").slice(-8).join("\n");
          p.log.error(pc.red("Migration failed:\n") + pc.dim(tail));
          throw new Error("migration-failed");
        }
        return "migrations applied";
      },
    },
  ]);

  // 8. Optional: tv-tauri desktop client -----------------------------------
  p.note(
    pc.dim(
      "A native desktop client (Rust + Tauri + libmpv). Not needed for pnpm dev:core —\nonly set this up if you want to run or build the desktop app.",
    ),
    "Desktop client (tv-tauri)",
  );
  const doTauri = guard(
    await p.confirm({ message: "Set up the tv-tauri desktop client too?", initialValue: false }),
  );

  if (doTauri) {
    const cargoV = cmdVersion("cargo");
    const rustcV = cmdVersion("rustc");
    const isWindows = process.platform === "win32";

    p.note(
      [
        `${cargoV ? pc.green("✓") : pc.red("✗")} cargo   ${pc.dim(cargoV ?? "not found")}`,
        `${rustcV ? pc.green("✓") : pc.red("✗")} rustc   ${pc.dim(rustcV ?? "not found")}`,
      ].join("\n"),
      "Rust toolchain",
    );

    if (cargoV && !DRY_RUN) {
      p.log.success("Rust is already installed.");
    } else if (isWindows && !DRY_RUN) {
      // Windows: detect + guide (auto-install needs MSVC we can't provision).
      p.note(
        [
          "Rust isn't installed. On Windows, install it manually:",
          "",
          `  1. ${pc.cyan("https://rustup.rs")} → run rustup-init.exe`,
          `  2. Install the ${pc.bold("MSVC C++ Build Tools")} (Visual Studio Build Tools,`,
          `     "Desktop development with C++") — Rust needs them to compile`,
          "  3. WebView2 runtime (preinstalled on Windows 11)",
        ].join("\n"),
        "Install Rust (Windows — manual)",
      );
    } else {
      // macOS/Linux real auto-install, or a dry-run simulation on any OS.
      const go = guard(
        await p.confirm({
          message: DRY_RUN
            ? "Simulate installing Rust via rustup (dry run)?"
            : "Install Rust via rustup now?",
          initialValue: true,
        }),
      );
      if (go) {
        const ok = await installRustWithBar(DRY_RUN);
        if (ok && !DRY_RUN) {
          p.log.success("Rust installed. Open a NEW terminal so cargo lands on your PATH.");
        }
      }
    }

    p.note(tauriDepsNote(), "Also required for tv-tauri");
    p.log.info(`Run the desktop client with ${pc.cyan("pnpm -F tv-tauri dev")}.`);
  }

  // 9. Done ----------------------------------------------------------------
  if (DRY_RUN) {
    p.outro(
      `${pc.green("Dry run complete.")} Nothing was written. Re-run without ${pc.cyan("--dry-run")} to apply.`,
    );
  } else {
    p.outro(
      `${pc.green("All set.")} Start the core dev stack with ${pc.cyan("pnpm dev:core")} ${pc.dim("(server + admin + tv-web)")}.`,
    );
  }
}

main().catch((err) => {
  if (err?.message === "migration-failed") {
    bail("Setup stopped at migrations. Fix the Postgres connection and re-run.");
  }
  p.log.error(String(err?.stack ?? err));
  process.exit(1);
});
