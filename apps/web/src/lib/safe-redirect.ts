/**
 * Return `to` only if it's a safe LOCAL path — starts with a single "/", no scheme, no protocol-relative
 * "//". Used to honor a `?redirect=` return-path after login without opening an open-redirect hole (a
 * malicious `?redirect=https://evil.tld` is rejected → callers fall back to their default destination).
 */
export function safeRedirect(to: string | null | undefined): string | null {
  if (!to || typeof to !== "string") return null;
  if (!to.startsWith("/") || to.startsWith("//")) return null;
  return to;
}
