/**
 * Standalone workflow-schema bootstrap for the packaged desktop app (no pnpm/CLI). Replicates
 * `@workflow/world-postgres`'s `setupDatabase()` (what `workflow:bootstrap` runs) — creates the `workflow.*`
 * schema via its drizzle migrations + graphile-worker's schema — in the DB at WORKFLOW_POSTGRES_URL.
 *
 * We replicate it (rather than call setupDatabase) for ONE reason: setupDatabase hardcodes its migrations path
 * as `<pkg>/src/drizzle/migrations`, which in the bundle becomes `.../server/wf/src/drizzle/migrations/<file>` —
 * over 100 chars for the longer migration filenames, which makes the tar writer emit PAX/long-name records that
 * electrobun's self-extractor can't read (`TarUnsupportedFileType` → the installer aborts mid-extract). Here the
 * migrations ship SHALLOW next to this file at `./m` (build:standalone copies them there), keeping every path
 * short. graphile-worker's own SQL is embedded in its JS, so it needs nothing on disk.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { makeWorkerUtils } from "graphile-worker";
import { Pool } from "pg";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const connectionString = process.env.WORKFLOW_POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[wf-bootstrap] WORKFLOW_POSTGRES_URL or DATABASE_URL is required");
  process.exit(1);
}
// Migrations copied next to this bundle (build:standalone → wf/m). Overridable for other layouts.
const migrationsFolder = process.env.WORKFLOW_MIGRATIONS_DIR || join(HERE, "m");

const pool = new Pool({ connectionString, max: 1 });
const db = drizzle(pool);
try {
  console.log(`[wf-bootstrap] running drizzle migrations from ${migrationsFolder}…`);
  await migrate(db, {
    migrationsFolder,
    migrationsTable: "workflow_migrations",
    migrationsSchema: "workflow_drizzle",
  });
  // graphile-worker schema (single-process here so later world.start() installSchema calls find it present).
  console.log("[wf-bootstrap] bootstrapping graphile-worker schema…");
  const workerUtils = await makeWorkerUtils({ pgPool: pool });
  try {
    await workerUtils.migrate();
  } finally {
    await workerUtils.release();
  }
  console.log("[wf-bootstrap] ✅ workflow schema ready");
  await pool.end();
  process.exit(0);
} catch (error) {
  await pool.end().catch(() => {});
  console.error("[wf-bootstrap] ❌ failed:", error);
  process.exit(1);
}
