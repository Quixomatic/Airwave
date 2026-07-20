/**
 * Dev entrypoint — builds the workflow handlers, starts the workflow **observability web UI**,
 * then runs the server with hot reload. Wired to `pnpm dev`.
 *
 * Why a script instead of a package.json one-liner: the web UI needs `NODE_OPTIONS`
 * (see below) and we need two long-lived children. Env-var prefixes and `&` backgrounding
 * in npm scripts both behave differently on Windows vs POSIX; spawning from Bun is portable.
 *
 * THE WEB UI GOTCHA: `workflow inspect --web` imports `node:sqlite`, which Node keeps behind
 * `--experimental-sqlite` until Node 23 (we're on 22.12). Without the flag the server starts
 * and reports SUCCESS, then 500s on every request with `ERR_UNKNOWN_BUILTIN_MODULE` buried in
 * its own log — it looks like the UI is up when nothing works.
 *
 * The UI reads our Postgres world directly, so it needs WORKFLOW_TARGET_WORLD /
 * WORKFLOW_POSTGRES_URL in the environment (`bun --env-file=.env` supplies them).
 */
const WORKFLOW_UI_PORT = process.env.WORKFLOW_UI_PORT ?? "3199";

/** Build the flow/step handlers. `bun --hot` does NOT re-run this — edits to workflows/ need a restart. */
const build = Bun.spawn(["bunx", "workflow", "build"], { stdio: ["ignore", "inherit", "inherit"] });
if ((await build.exited) !== 0) {
  console.error("[dev] workflow build failed");
  process.exit(1);
}

// Observability UI — runs, steps, events, streams. Optional: a failure here must never stop the
// server, so it's spawned fire-and-forget and its exit is only logged.
const ui = Bun.spawn(
  [
    "bunx",
    "workflow",
    "inspect",
    "runs",
    "--web",
    "--noBrowser",
    "--webPort",
    WORKFLOW_UI_PORT,
  ],
  {
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, NODE_OPTIONS: "--experimental-sqlite" },
  },
);
console.log(`[dev] workflow UI → http://localhost:${WORKFLOW_UI_PORT}?resource=run`);
ui.exited.then((code) => {
  if (code !== 0) console.warn(`[dev] workflow UI exited (${code}) — server unaffected`);
});

const server = Bun.spawn(["bun", "run", "--hot", "src/index.ts"], {
  stdio: ["inherit", "inherit", "inherit"],
});

// Take the UI down with the server so a restart doesn't leave the port held (an orphaned UI
// makes the next start fail with EADDRINUSE).
const shutdown = () => {
  ui.kill();
  server.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.exit(await server.exited);

export {};
