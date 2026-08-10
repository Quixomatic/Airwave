import { beforeAll, describe, expect, test } from "bun:test";

// The crypto key derives from BETTER_AUTH_SECRET (read at call time), so set it before use.
beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-for-token-crypto-abc123";
});

import { decryptToken, encryptToken, looksEncrypted, withDecryptedToken } from "./token";

// A realistic Plex owner token: ~20 chars, [A-Za-z0-9_-], no colons.
const PLAIN = "sxAB12cd_Ef3Gh4Ij5Kl";

describe("plex token encryption at rest", () => {
  test("round-trips: an encrypted token decrypts back to the original", () => {
    const enc = encryptToken(PLAIN);
    expect(enc).not.toBe(PLAIN); // actually transformed
    expect(enc.split(":")).toHaveLength(3); // iv:tag:ct
    expect(decryptToken(enc)).toBe(PLAIN);
  });

  test("encryption is non-deterministic (fresh IV) but both decrypt to the same plaintext", () => {
    const a = encryptToken(PLAIN);
    const b = encryptToken(PLAIN);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(PLAIN);
    expect(decryptToken(b)).toBe(PLAIN);
  });

  test("decrypt is tolerant of legacy plaintext (pre-encryption / pre-backfill)", () => {
    // A raw Plex token that was never encrypted must pass through unchanged.
    expect(decryptToken(PLAIN)).toBe(PLAIN);
    expect(decryptToken("")).toBe("");
  });

  test("looksEncrypted classifies the encrypted shape vs a raw token unambiguously", () => {
    expect(looksEncrypted(encryptToken(PLAIN))).toBe(true);
    expect(looksEncrypted(PLAIN)).toBe(false);
    expect(looksEncrypted("")).toBe(false);
    // Colons alone aren't enough — the IV/tag byte-lengths must match.
    expect(looksEncrypted("aaa:bbb:ccc")).toBe(false);
  });

  test("a tampered ciphertext throws (never silently returns garbage)", () => {
    const enc = encryptToken(PLAIN);
    const [iv, tag, ct] = enc.split(":");
    // Flip the ciphertext so the GCM auth tag no longer matches.
    const tampered = [iv, tag, Buffer.from("totally-different-bytes").toString("base64")].join(":");
    expect(() => decryptToken(tampered)).toThrow();
  });

  test("withDecryptedToken decrypts the token field and preserves the rest of the row", () => {
    const row = { id: "src1", baseUrl: "http://plex.local:32400", token: encryptToken(PLAIN), name: "Home" };
    const out = withDecryptedToken(row);
    expect(out.token).toBe(PLAIN);
    expect(out.id).toBe("src1");
    expect(out.baseUrl).toBe("http://plex.local:32400");
    expect(out.name).toBe("Home");
  });

  test("withDecryptedToken is a no-op on an already-plaintext row (idempotent decrypt path)", () => {
    const out = withDecryptedToken({ id: "s", token: PLAIN });
    expect(out.token).toBe(PLAIN);
  });
});
