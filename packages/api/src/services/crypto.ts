import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * App-level encryption for secrets at rest — the AI provider API key AND the Plex owner token
 * (the §8 token-hardening decision). AES-256-GCM with a key derived from `BETTER_AUTH_SECRET`, so
 * no new env var is needed. Format: `ivB64:tagB64:ciphertextB64`.
 *
 * ⚠️ This runs SERVER-SIDE via `node:crypto` — it has no secure-context/HTTPS requirement (that
 * constraint only affects browser `crypto.subtle`/`randomUUID`), so plain-HTTP LAN deployments are
 * unaffected. The key is derived from `BETTER_AUTH_SECRET`: keep that stable, or every secret
 * encrypted with it (AI keys + the Plex token) becomes undecryptable and must be re-entered.
 */

function key(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to encrypt/decrypt secrets");
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivB, tagB, encB] = payload.split(":");
  if (!ivB || !tagB || !encB) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
}
