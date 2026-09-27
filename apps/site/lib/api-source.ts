import { loader } from "fumadocs-core/source";
import { openapiPlugin, openapiSource } from "fumadocs-openapi/server";

import { openapi } from "@/lib/openapi";

// The API Reference is its own docs root at /api-reference — a VIRTUAL source generated from the OpenAPI spec
// (no MDX files, no codegen step). Operations nest under their tag ("Server", "Channels", …); the plugin adds
// the method badges / webhook + deprecation markers to the sidebar tree.
export const apiReference = loader({
  baseUrl: "/api-reference",
  source: await openapiSource(openapi, { per: "operation", groupBy: "tag", meta: true }),
  plugins: [openapiPlugin()],
});
