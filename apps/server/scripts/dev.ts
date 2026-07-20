/**
 * Dev entrypoint — rebuilds the workflow handlers IF they're stale, then runs the server
 * with hot reload. Wired to `pnpm dev`.
 *
 * Why a script rather than a package.json one-liner: the staleness check needs real logic,
 * and shell differences between Windows and POSIX make conditional builds in npm scripts
 * unportable.
 *
 * The observability UI is a separate concern — `pnpm workflow:ui`.
 */

/**
 * Rebuild the flow/step handlers — but ONLY when something they're built from has changed.
 *
 * `workflow build` takes ~10-20s, and running it on every `pnpm dev` delayed server startup
 * enough that the admin frontend's first fetch timed out. Most restarts don't touch a
 * workflow, so compare mtimes and skip when the bundle is already current.
 *
 * The bundle inlines `packages/api` too, so that has to be part of the staleness check —
 * a change to a service the workflow calls is just as invalidating as one to workflows/.
 * `bun --hot` never re-runs this, so a missed rebuild means silently running old code.
 */
async function newestMtime(dir: string): Promise<number> {
  const glob = new Bun.Glob("**/*.{ts,tsx,js}");
  let newest = 0;
  for await (const file of glob.scan({ cwd: dir, absolute: true })) {
    const { mtimeMs } = await Bun.file(file).stat().catch(() => ({ mtimeMs: 0 }));
    if (mtimeMs > newest) newest = mtimeMs;
  }
  return newest;
}

const bundle = Bun.file("./.well-known/workflow/v1/flow.js");
const bundleMtime = (await bundle.exists()) ? (await bundle.stat()).mtimeMs : 0;
const sourceMtime = Math.max(await newestMtime("./workflows"), await newestMtime("../../packages/api/src"));

if (bundleMtime > sourceMtime) {
  console.log("[dev] workflow handlers up to date — skipping build");
} else {
  console.log("[dev] workflow sources changed — rebuilding handlers…");
  const build = Bun.spawn(["bunx", "workflow", "build"], { stdio: ["ignore", "inherit", "inherit"] });
  if ((await build.exited) !== 0) {
    console.error("[dev] workflow build failed");
    process.exit(1);
  }
}

// The observability UI is deliberately NOT started here — run it separately with
// `pnpm workflow:ui` when you want it. Baking a second long-lived process into `dev`
// slowed startup and coupled two unrelated things.

const server = Bun.spawn(["bun", "run", "--hot", "src/index.ts"], {
  stdio: ["inherit", "inherit", "inherit"],
});

const shutdown = () => {
  server.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.exit(await server.exited);

export {};
