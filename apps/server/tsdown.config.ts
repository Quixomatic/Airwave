import { createRequire } from "node:module";
import { relative, sep } from "node:path";

import { transform } from "@swc/core";
import { defineConfig } from "tsdown";

const require = createRequire(import.meta.url);

/**
 * Apply the Workflow SDK CLIENT transform during the production bundle.
 *
 * WHY THIS EXISTS: prod runs the compiled `dist/index.mjs` (see docker/entrypoint.sh — `bun run
 * dist/index.mjs`), NOT `src` via bun + the bunfig preload. The preload (`workflow-plugin.ts`) is a
 * runtime `onLoad` hook for `.ts` files, so it does NOTHING for an already-bundled `.mjs` — everything
 * is inlined by the time it could run. Without the transform, the workflow functions in the bundle never
 * get their `workflowId`, and EVERY `start(workflow)` throws `start-invalid-workflow-function` in prod
 * (it works in dev only because dev runs the source through the preload). This mirrors workflow-plugin.ts
 * as a build-time rolldown transform so the bundle carries the same client transform. Keep the two in
 * sync — the id derivation in particular MUST match, or the caller's id won't line up with the manifest.
 */
const workflowClientTransform = {
  name: "workflow-swc-client",
  async transform(code: string, id: string) {
    if (id.includes("node_modules")) return null;
    if (!/\.tsx?$/.test(id)) return null;
    // Only files declaring a directive need it — everything else passes through untouched.
    if (!/(use step|use workflow)/.test(code)) return null;
    // The workflow id is derived from `filename` and must match the id the CLI baked into the manifest
    // (app-root-relative, forward slashes) AND the dev preload's runtime derivation. Both compute
    // `relative(process.cwd(), path)` with cwd = apps/server, so this stays consistent.
    const rel = relative(process.cwd(), id).split(sep).join("/");
    const result = await transform(code, {
      filename: rel,
      jsc: {
        parser: { syntax: "typescript", tsx: id.endsWith(".tsx") },
        target: "esnext",
        experimental: {
          plugins: [[require.resolve("@workflow/swc-plugin"), { mode: "client" }]],
        },
      },
    });
    return { code: result.code, map: result.map };
  },
};

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [/@ChannelGuide\/.*/],
  plugins: [workflowClientTransform],
});
