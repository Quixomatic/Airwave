/**
 * Standalone entry for the embedded-Postgres wrapper, bundled by the `build:pg-launcher` script into
 * `pg/pg-launcher.mjs` (wrapper JS + `pg` + `async-exit-hook` inlined; the 8 `@embedded-postgres/<platform>`
 * binary packages left external). The PACKAGED supervisor imports the bundled file by absolute path — see
 * `loadEmbeddedPostgres()` in `src/bun/index.ts`. This exists because electrobun's own bundler can't resolve
 * node_modules deps at build time, so the wrapper is pre-bundled here instead of imported into the supervisor.
 */
export { default } from "embedded-postgres";
