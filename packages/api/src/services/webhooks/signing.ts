import crypto from "node:crypto";

const PREFIX = "whsec_";

/** A fresh Standard Webhooks signing secret: `whsec_` + base64 of 24 random bytes. Shown to the admin once. */
export function generateWebhookSecret(): string {
  return `${PREFIX}${crypto.randomBytes(24).toString("base64")}`;
}

/**
 * The Standard Webhooks signature for a delivery. Signed content is `${id}.${timestamp}.${body}`; the HMAC key
 * is the base64-decoded portion of the secret after the `whsec_` prefix; the header value is
 * `v1,<base64 HMAC-SHA256>` (space-separated versions allowed, but we send one). Consumers verify with any
 * Standard Webhooks library.
 */
export function signWebhook(secret: string, id: string, timestampSeconds: number, body: string): string {
  const keyB64 = secret.startsWith(PREFIX) ? secret.slice(PREFIX.length) : secret;
  const key = Buffer.from(keyB64, "base64");
  const signedContent = `${id}.${timestampSeconds}.${body}`;
  const sig = crypto.createHmac("sha256", key).update(signedContent).digest("base64");
  return `v1,${sig}`;
}
