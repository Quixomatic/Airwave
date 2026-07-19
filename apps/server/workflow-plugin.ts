/**
 * Workflow SDK client-mode transform, as a Bun loader plugin.
 *
 * WHY THIS IS REQUIRED (not optional, despite what the docs imply): `start()` reads
 * `workflow.workflowId` off the function object — a field only the SWC plugin's CLIENT
 * mode attaches. Without this preload, `start(myWorkflow, [...])` throws
 * `start-invalid-workflow-function` even though `bunx workflow build` succeeded, because
 * the built bundles serve the flow/step HTTP handlers while the CALLER still holds an
 * untransformed plain function.
 *
 * Wired up via `preload` in bunfig.toml, so it applies to `bun run` and `bun test`.
 * Only files containing a directive are transformed; everything else passes through
 * untouched, so the cost on the rest of the server is a substring check.
 */
import { relative, sep } from "node:path";

import { transform } from "@swc/core";
import { plugin } from "bun";

plugin({
  name: "workflow-transform",
  setup(build) {
    build.onLoad({ filter: /\.(ts|tsx)$/ }, async (args) => {
      // Never touch dependencies. The docs' example filters on extension alone, which
      // pulls in node_modules — and returning `contents` without a loader there makes
      // Bun re-parse CJS as ESM ("Missing 'default' export in module 'ms'").
      const loader = args.path.endsWith(".tsx") ? ("tsx" as const) : ("ts" as const);
      const passthrough = async () => ({ contents: await Bun.file(args.path).text(), loader });
      if (args.path.includes("node_modules")) return passthrough();

      const source = await Bun.file(args.path).text();
      // Cheap bail-out: only files declaring a directive need the transform. Bun's
      // onLoad must return an object, so hand the source straight back with an explicit
      // loader (safe here — node_modules is excluded, so everything left is our TS).
      if (!source.match(/(use step|use workflow)/)) return { contents: source, loader };

      // The workflow id is derived from `filename`, and it must match the id the CLI
      // baked into the manifest — which the CLI produced from a path RELATIVE to the
      // app root. Passing the absolute path yields
      // `workflow//./C:/Users/.../workflows/spike//spikeWorkflow`, whose drive-letter
      // colon fails the SDK's own workflow-name validation. Relativize (and force
      // forward slashes, since we're on Windows) so ids line up with the manifest.
      const rel = relative(process.cwd(), args.path).split(sep).join("/");

      const result = await transform(source, {
        filename: rel,
        jsc: {
          parser: { syntax: "typescript", tsx: args.path.endsWith(".tsx") },
          target: "esnext",
          experimental: {
            plugins: [[require.resolve("@workflow/swc-plugin"), { mode: "client" }]],
          },
        },
      });

      return { contents: result.code, loader };
    });
  },
});
