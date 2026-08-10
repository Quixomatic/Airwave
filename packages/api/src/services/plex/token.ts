import type { PrismaClient } from "@airwave/db";

import { decryptSecret, encryptSecret } from "../crypto";

/**
 * Encryption at rest for the Plex **owner token** (`MediaSource.token`).
 *
 * INVARIANT: the token is stored ENCRYPTED and used DECRYPTED. Encrypt at the one write site
 * (`plex.saveConnection`); decrypt at every boundary where a DB-loaded source row is about to make
 * a Plex call — i.e. always run a loaded source through {@link withDecryptedToken} (or
 * {@link decryptToken} on the field) before handing it to `plex/client.ts`. Clients never receive
 * the bare token (the server bakes it into `X-Plex-Token=…` URLs), so this is a server-only concern.
 *
 * Decryption is TOLERANT of legacy plaintext: a value that isn't in the encrypted shape is returned
 * as-is, so a deployment keeps working the moment the new build boots, before the one-time backfill
 * ({@link encryptExistingSourceTokens}) runs — and even if it never does.
 */

// An encrypted secret is `ivB64:tagB64:ctB64` (see ../crypto). A raw Plex token is a single
// ~20-char [A-Za-z0-9_-] string with no colons, so the 3-segment base64 shape — with a 12-byte IV
// and 16-byte GCM tag — is an unambiguous marker that a raw token can never accidentally match.
const ENC_SHAPE = /^[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/;

export function looksEncrypted(value: string): boolean {
  if (!value || !ENC_SHAPE.test(value)) return false;
  const [ivB, tagB] = value.split(":");
  try {
    return Buffer.from(ivB, "base64").length === 12 && Buffer.from(tagB, "base64").length === 16;
  } catch {
    return false;
  }
}

export function encryptToken(plain: string): string {
  return encryptSecret(plain);
}

/** Decrypt a stored token; pass legacy plaintext through unchanged. Throws loudly (never returns
 *  ciphertext) if a value LOOKS encrypted but can't be decrypted — the usual cause is a rotated
 *  `BETTER_AUTH_SECRET`. */
export function decryptToken(stored: string): string {
  if (!stored || !looksEncrypted(stored)) return stored;
  try {
    return decryptSecret(stored);
  } catch {
    throw new Error(
      "Failed to decrypt the Plex owner token. Has BETTER_AUTH_SECRET changed since the source " +
        "was connected? Re-connect the Plex source to fix.",
    );
  }
}

/** Return a copy of a loaded source row with its `token` field decrypted, ready for a Plex call. */
export function withDecryptedToken<T extends { token: string }>(source: T): T {
  return { ...source, token: decryptToken(source.token) };
}

/**
 * One-time, idempotent backfill: encrypt any `MediaSource.token` still stored as plaintext.
 * Safe to run on every boot — it skips rows already in the encrypted shape. Called at server
 * startup and exposed as a standalone script (`scripts/encrypt-source-tokens.ts`).
 */
export async function encryptExistingSourceTokens(prisma: PrismaClient): Promise<number> {
  const sources = await prisma.mediaSource.findMany({ select: { id: true, token: true } });
  let migrated = 0;
  for (const s of sources) {
    if (!s.token || looksEncrypted(s.token)) continue;
    await prisma.mediaSource.update({ where: { id: s.id }, data: { token: encryptToken(s.token) } });
    migrated++;
  }
  if (migrated > 0) {
    console.log(`[crypto] encrypted ${migrated} plaintext Plex source token(s) at rest`);
  }
  return migrated;
}
