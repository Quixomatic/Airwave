/**
 * Engine-less Prisma migration runner for the PACKAGED desktop app.
 *
 * `prisma migrate deploy` needs the Prisma CLI + the Rust schema-engine binary — neither of which we ship in
 * the packaged app (the app is a single bundled `.mjs` + the embedded-Postgres binary; Prisma runs engine-less
 * via the pg driver adapter). This applies the committed migration SQL files directly through `pg`, tracking
 * them in Prisma's own `_prisma_migrations` table the same way `migrate deploy` does — enough for a fresh,
 * single-user embedded database. In dev / Docker we still use the real `prisma migrate deploy`.
 *
 *   DATABASE_URL   — the target database (the embedded PG).
 *   MIGRATIONS_DIR — the shipped `prisma/migrations` directory.
 *
 * Bundled to a self-contained `migrate.mjs` via `bun build` (see apps/server `build:standalone`).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";

async function main(): Promise<void> {
  const DATABASE_URL = process.env.DATABASE_URL;
  const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR;
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!MIGRATIONS_DIR || !existsSync(MIGRATIONS_DIR)) {
    throw new Error(`MIGRATIONS_DIR missing or not found: ${MIGRATIONS_DIR}`);
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // Prisma's bookkeeping table (matches the shape `prisma migrate` creates).
    await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" varchar(36) NOT NULL PRIMARY KEY,
      "checksum" varchar(64) NOT NULL,
      "finished_at" timestamptz,
      "migration_name" varchar(255) NOT NULL,
      "logs" text,
      "rolled_back_at" timestamptz,
      "started_at" timestamptz NOT NULL DEFAULT now(),
      "applied_steps_count" integer NOT NULL DEFAULT 0
    )`);

    const done = new Set(
      (await client.query(`SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`)).rows.map(
        (r: { migration_name: string }) => r.migration_name,
      ),
    );

    const names = readdirSync(MIGRATIONS_DIR)
      .filter((d) => existsSync(join(MIGRATIONS_DIR, d, "migration.sql")))
      .sort(); // Prisma migration dirs are timestamp-prefixed → lexicographic = chronological.

    let applied = 0;
    for (const name of names) {
      if (done.has(name)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
      console.log(`[migrate] applying ${name}…`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count")
           VALUES ($1,$2,$3,now(),1)`,
          [crypto.randomUUID(), "standalone", name],
        );
        await client.query("COMMIT");
        applied++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${name} failed: ${(err as Error).message}`);
      }
    }
    console.log(`[migrate] up to date (${applied} applied, ${names.length - applied} already present).`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error("[migrate] FAILED:", (err as Error).message);
  process.exit(1);
});
