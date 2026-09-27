/**
 * Emit the public API's OpenAPI 3.1 spec to a file, so getairwave.tv (fumadocs-openapi) can render the API
 * reference. The site build can't import the server (no DB there), so we generate the spec here — in the
 * server context, with env — and commit the result.
 *
 *   bun --env-file=.env run scripts/gen-openapi.ts            # → apps/site/openapi/spec.json
 *   bun --env-file=.env run scripts/gen-openapi.ts <out.json> # custom path
 *
 * Re-run after changing the public API (a version:bump-adjacent step / CI later).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { openApiConfig, publicApi } from "../src/public";

const out = process.argv[2] ?? resolve(import.meta.dir, "../../site/openapi/spec.json");
const doc = publicApi.getOpenAPI31Document(openApiConfig);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
const paths = Object.keys((doc as { paths?: Record<string, unknown> }).paths ?? {}).length;
console.log(`wrote ${out} (${paths} paths, v${(doc as { info?: { version?: string } }).info?.version})`);
