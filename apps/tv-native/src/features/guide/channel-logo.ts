/**
 * Channel logos in the guide's rail. A channel can carry a `logo` (set in the admin): an `https://` address, or a path on the
 * Airwave server. With Channel marks set to Logos, a channel that has one shows it in place of its icon circle, and a logo
 * that cannot be loaded falls back to the circle. Both renderers load the address `logoSource` resolves.
 *
 * No react-native imports, so bun can load this file in tests.
 */

/**
 * Whether `v` (trimmed) is an address the server would store as a logo: an `https://` address (the scheme in any case) with no
 * credentials, or a path with a single leading `/`; no whitespace, control characters or backslashes (a backslash reads as a slash:
 * `/\host` is `//host`); at most 2048 characters. It is the server's rule (`parseChannelLogo`, packages/api), checked here on the
 * grammar alone (there is no WHATWG URL to lean on in a React Native runtime), so a bad value the server let through, or an old one,
 * can never make the guide ask for something odd. `packages/api/src/lib/channel-logo.test.ts` runs one list of addresses through both.
 */
export function isLogoAddress(v: string): boolean {
  if (!v || v.length > 2048) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f\\]/.test(v)) return false;
  if (v.startsWith("/")) return v[1] !== "/";
  return /^https:\/\/[^/?#@]/i.test(v) && !/^https:\/\/[^/?#]*@/i.test(v);
}

/**
 * The address to load a channel's logo from, or null when it has no usable one. An `https://` address is used as it is, with its scheme in lower
 * case: Fresco on Android matches only a lower-case `https`, and an address stored before the server normalised it (or by an older server) can
 * have `HTTPS://` (the rest of the address is left alone: the scheme is all Fresco is case-sensitive about). A path on the server (a single
 * leading `/`) is joined to `serverUrl`. Anything else (another scheme, `//host`, credentials, text with whitespace) is not a logo (see
 * {@link isLogoAddress}).
 */
export function logoSource(logo: string | null | undefined, serverUrl: string): string | null {
  const v = logo?.trim();
  if (!v || !isLogoAddress(v)) return null;
  if (v.startsWith("/")) return serverUrl ? `${serverUrl.replace(/\/+$/, "")}${v}` : null;
  return v.replace(/^https:/i, "https:");
}

/**
 * Whether the guide's `logoPlate` paints anything: a color other than `transparent` or one with no alpha. With a plate the logo is
 * also inset from the plate's edge.
 */
export function hasLogoPlate(plate: string): boolean {
  const c = plate.trim().toLowerCase();
  if (c === "" || c === "transparent") return false;
  const rgba = /^rgba\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([\d.]+)\s*\)$/.exec(c);
  if (rgba) return Number(rgba[1]) > 0;
  const hex = /^#[0-9a-f]{6}([0-9a-f]{2})$/.exec(c);
  if (hex) return hex[1] !== "00";
  return true;
}
