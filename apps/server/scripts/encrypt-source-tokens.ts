/**
 * One-time, idempotent backfill: encrypt any `MediaSource.token` still stored as plaintext.
 * The server also runs this automatically at startup, so you normally never need it — it's here
 * for manual/dev use. Safe to run repeatedly (skips rows already encrypted).
 *
 *   bun --env-file=.env run scripts/encrypt-source-tokens.ts
 */
import { encryptExistingSourceTokens } from "@airwave/api/services/plex/token";
import prisma from "@airwave/db";

const n = await encryptExistingSourceTokens(prisma);
console.log(n > 0 ? `Encrypted ${n} plaintext token(s).` : "Nothing to do — all source tokens are already encrypted.");

process.exit(0);
