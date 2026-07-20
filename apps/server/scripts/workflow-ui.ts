/**
 * Launch the Workflow SDK's observability web UI on its own — runs, steps, events, streams,
 * read straight from our Postgres world. `pnpm dev` already starts this; use this script when
 * you want the UI without a dev server (e.g. inspecting a run made by scripts/run-lineup.ts).
 *
 *   bun --env-file=.env run scripts/workflow-ui.ts
 *
 * NODE_OPTIONS is set here rather than in package.json because the UI imports `node:sqlite`,
 * which Node keeps behind `--experimental-sqlite` until Node 23 (we're on 22.12). Without it the
 * server prints "started" and then 500s every request with ERR_UNKNOWN_BUILTIN_MODULE — it looks
 * up but serves nothing. Env-var prefixes in npm scripts aren't portable across Windows/POSIX,
 * hence a script.
 */
const port = process.env.WORKFLOW_UI_PORT ?? "3199";

const ui = Bun.spawn(
  ["bunx", "workflow", "inspect", "runs", "--web", "--noBrowser", "--webPort", port],
  {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env, NODE_OPTIONS: "--experimental-sqlite" },
  },
);

console.log(`workflow UI → http://localhost:${port}?resource=run`);
process.on("SIGINT", () => {
  ui.kill();
  process.exit(0);
});
process.exit(await ui.exited);

export {};
