import { createHmac, randomBytes } from "node:crypto";

/**
 * Rotating bind code (self-hosted side). A TOTP-style 6-digit code derived from a per-server secret and the
 * current 30s time step (HMAC-SHA1 + dynamic truncation). We generate the secret, register it with Airwave
 * Cloud, and DISPLAY the current code (rotating like a 2FA app); the cloud verifies the entered code against
 * the same secret. Runs SERVER-SIDE (node crypto) — never in the browser — so plain-HTTP self-host is fine;
 * the admin UI only shows the code the server computed. Mirrors the cloud's `rotating-code.ts`.
 */
const STEP_MS = 30_000;

/** A throwaway per-server secret the rotating code is derived from (NOT the auth secret). */
export function genBindSecret(): string {
  return randomBytes(20).toString("hex");
}

/** A long, server-only secret used to register/poll the cloud. */
export function genRegistrationToken(): string {
  return randomBytes(24).toString("hex");
}

export function rotatingCode(secret: string, at: number = Date.now()): string {
  const counter = Math.floor(at / STEP_MS);
  const h = createHmac("sha1", secret).update(String(counter)).digest();
  const offset = h[h.length - 1]! & 0x0f;
  const bin = ((h[offset]! & 0x7f) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return String(bin % 1_000_000).padStart(6, "0");
}

/** Seconds until the current code rolls over — for the countdown in the UI. */
export function codeSecondsRemaining(at: number = Date.now()): number {
  return Math.ceil((STEP_MS - (at % STEP_MS)) / 1000);
}
