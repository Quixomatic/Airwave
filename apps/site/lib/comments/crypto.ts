import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Small AES-256-GCM helper — SERVER ONLY. Used for two short-lived secrets:
 *   - the OAuth `state` (carries the return URL across the GitHub round-trip, with an expiry), and
 *   - the GitHub user access token stored in the httpOnly cookie.
 * The key is derived from `GITHUB_COMMENTS_TOKEN_SECRET` (any length) via SHA-256.
 * Output format: base64url of `iv(12) | authTag(16) | ciphertext`.
 */

function key(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decrypt(payload: string, secret: string): string {
  const buf = Buffer.from(payload, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

interface StatePayload {
  /** where to send the browser back to after auth */
  r: string;
  /** expiry (ms epoch) */
  e: number;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete the GitHub round-trip

export function encodeState(returnUrl: string, secret: string): string {
  const payload: StatePayload = { r: returnUrl, e: Date.now() + STATE_TTL_MS };
  return encrypt(JSON.stringify(payload), secret);
}

export function decodeState(state: string, secret: string): string {
  const payload = JSON.parse(decrypt(state, secret)) as StatePayload;
  if (typeof payload.e !== "number" || Date.now() > payload.e) {
    throw new Error("State expired");
  }
  if (typeof payload.r !== "string") throw new Error("Invalid state");
  return payload.r;
}
