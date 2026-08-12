import { defineDocs, defineConfig } from "fumadocs-mdx/config";

// The `/docs` content collection. MDX + meta.json files under `content/docs` are compiled by
// fumadocs-mdx (the `postinstall` + the `createMDX()` plugin in next.config.mjs generate `.source`).
export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig();
