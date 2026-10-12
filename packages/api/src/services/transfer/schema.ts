import { z } from "zod";

/**
 * The versioned lineup-exchange envelope — the single source of truth for the export/import format, shared
 * by the Transfer feature and (later) the Community Exchange + Cloud Marketplace. See
 * `.plans/export-import-schema-versioning.md`.
 *
 * `schemaVersion` is a semver-ish **"MAJOR.MINOR"** string, decoupled from the app version:
 *   - MINOR bump = additive / backward-compatible (new optional fields an old reader can ignore).
 *   - MAJOR bump = breaking (renamed/removed/restructured fields, changed semantics).
 *
 * Reader policy (see {@link migrateToCurrent}):
 *   - OLDER (same major, lower minor; or lower major) → run migrations up to CURRENT, then validate.
 *   - SAME major, NEWER minor → accept and ignore unknown fields (that's what "minor = additive" buys us).
 *   - NEWER major → reject cleanly ("needs a newer Airwave"), never silently mis-parse.
 *
 * Legacy: the pre-semver exports carried an integer `version: 1`. That maps to `"1.0"` (see
 * {@link readSchemaVersion}), so every lineup ever exported still imports.
 */
export const CURRENT_SCHEMA_VERSION = "1.1" as const;

/* ---------------- Envelope zod (tolerant: nested contents stay loose, extras pass through) ---------- */

export const definitionSchema = z
  .object({
    kind: z.string(),
    mode: z.string().optional(),
    sortIndex: z.number().optional(),
    plexFilter: z.unknown().optional(),
    plexLibraryTitle: z.string().nullish(),
  })
  .passthrough();

export const channelSchema = z
  .object({
    number: z.number(),
    name: z.string(),
    callsign: z.string().nullish(),
    description: z.string().nullish(),
    icon: z.string().nullish(),
    tint: z.string().nullish(),
    enabled: z.boolean().optional(),
    sortIndex: z.number().optional(),
    ordering: z.string().optional(),
    sortField: z.string().optional(),
    sortDir: z.string().optional(),
    bumperMode: z.string().optional(),
    // schema 1.1 — portable scheduling config (see export.ts).
    strategy: z.unknown().optional(),
    excludeSpecials: z.boolean().optional(),
    keepMultiPartTogether: z.boolean().optional(),
    shuffleSeed: z.number().nullish(),
    packageKey: z.string().nullish(),
    definitions: z.array(definitionSchema).optional(),
  })
  .passthrough();

export const packageSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    icon: z.string().nullish(),
    tint: z.string().nullish(),
    sortIndex: z.number().optional(),
  })
  .passthrough();

/**
 * The accepted *input* shape — deliberately lenient about the version field so a legacy integer `version`
 * (or a missing version) still parses; {@link readSchemaVersion} normalizes it. `packages`/`channels` are
 * the only hard requirements.
 */
export const lineupEnvelopeSchema = z
  .object({
    schemaVersion: z.string().optional(),
    version: z.number().optional(), // legacy pre-semver field
    exportedAt: z.string().optional(),
    packages: z.array(packageSchema),
    channels: z.array(channelSchema),
  })
  .passthrough();

export type LineupEnvelope = z.infer<typeof lineupEnvelopeSchema>;

/* ---------------- Version parsing + comparison ----------------------------------------------------- */

/** Parse "MAJOR.MINOR" → [major, minor]; tolerant of extra patch segments and junk (→ [0,0]). */
export function parseVersion(v: string): [number, number] {
  const m = /^(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return [0, 0];
  return [Number(m[1]), Number(m[2])];
}

/** The envelope's schema version, normalizing the legacy integer `version` (1 → "1.0", N → "N.0"). */
export function readSchemaVersion(doc: { schemaVersion?: unknown; version?: unknown }): string {
  if (typeof doc.schemaVersion === "string" && doc.schemaVersion.trim()) return doc.schemaVersion.trim();
  if (typeof doc.version === "number" && Number.isFinite(doc.version)) return `${doc.version}.0`;
  return CURRENT_SCHEMA_VERSION;
}

export type VersionRelation = "older" | "current" | "newer-minor" | "newer-major";

/** Where `version` sits relative to `against` (default CURRENT): older / current / newer within the same
 *  major (readable) / a newer major (not readable). */
export function classifyVersion(version: string, against: string = CURRENT_SCHEMA_VERSION): VersionRelation {
  const [maj, min] = parseVersion(version);
  const [curMaj, curMin] = parseVersion(against);
  if (maj > curMaj) return "newer-major";
  if (maj < curMaj) return "older";
  if (min > curMin) return "newer-minor";
  if (min < curMin) return "older";
  return "current";
}

/* ---------------- Migration chain ------------------------------------------------------------------ */

/** One ordered upgrade step: reading a doc at some version `< to`, bring it up to `to`. `up` receives (and
 *  returns) the loosely-typed envelope; it only fills gaps / renames, never validates. */
export type Migration = { to: string; up: (doc: LineupEnvelope) => LineupEnvelope };

/**
 * Ordered registry of upgrade steps, ascending by target version. Each step runs when the incoming doc's
 * version is below its `to` (and `to` ≤ CURRENT). A 1.0→1.1 step (defaulting the fields added in 1.1) lands
 * with the gap-fill work; today the chain is empty because CURRENT is still "1.0".
 */
export const MIGRATIONS: Migration[] = [
  {
    // 1.0 → 1.1: the scheduling-config fields were absent in 1.0; default them so a 1.0 channel reads as a
    // valid 1.1 channel (today's behavior: strategy off, toggles off, no fixed seed). Existing values win.
    to: "1.1",
    up: (doc) => ({
      ...doc,
      channels: doc.channels.map((c) => ({
        strategy: null,
        excludeSpecials: false,
        keepMultiPartTogether: false,
        shuffleSeed: null,
        ...c,
      })),
    }),
  },
];

export type MigrateResult =
  | { ok: true; doc: LineupEnvelope; fromVersion: string; relation: VersionRelation }
  | { ok: false; fromVersion: string; relation: "newer-major"; reason: string };

/**
 * Normalize + migrate an uploaded envelope to CURRENT. Reads the (possibly legacy) version, rejects a
 * newer-major file cleanly, runs the migration chain for an older file, and accepts a same-major newer-minor
 * file as-is (unknown fields ignored downstream by the lenient zod). Does NOT deep-validate here — callers
 * read the fields they need; the zod envelope already guarded the top-level shape at the router.
 */
export function migrateToCurrent(raw: LineupEnvelope): MigrateResult {
  const fromVersion = readSchemaVersion(raw);
  const relation = classifyVersion(fromVersion);

  if (relation === "newer-major") {
    return {
      ok: false,
      fromVersion,
      relation,
      reason: `This lineup was exported by a newer version of Airwave (format v${fromVersion}) and can't be imported here. Update Airwave and try again.`,
    };
  }

  // Apply ascending migration steps whose target is above the file's version and at or below CURRENT.
  let doc: LineupEnvelope = { ...raw, schemaVersion: fromVersion };
  if (relation === "older") {
    for (const step of MIGRATIONS) {
      if (classifyVersion(fromVersion, step.to) === "older") doc = step.up(doc);
    }
  }
  // Stamp the result as CURRENT (a newer-minor file keeps its own extra fields; we just read what we know).
  doc = { ...doc, schemaVersion: relation === "newer-minor" ? fromVersion : CURRENT_SCHEMA_VERSION };
  return { ok: true, doc, fromVersion, relation };
}
