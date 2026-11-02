/**
 * The admin form's check of a channel's logo address, as you type. It is the server's rule (`parseChannelLogo` in
 * `packages/api/src/lib/channel-logo.ts`, which is what decides on save), line for line: an `https://` address with no credentials
 * in it, or a path on this server that starts with a single `/`; no whitespace, control characters or backslashes; at most 2048
 * characters, of the address as it is stored (`URL.href`: an IDN host as punycode, a non-ASCII character as percent-encoding, so it can be
 * longer than what was typed). `packages/api/src/lib/channel-logo.test.ts` runs one list of addresses through both, so they cannot drift apart.
 *
 * No React imports, so a test can load it.
 */

/** The longest logo address a channel stores (the server's `CHANNEL_LOGO_MAX_LENGTH`). */
const MAX_LENGTH = 2048;

export const LOGO_ADDRESS_HINT = "Use an https:// image address, or a path on this server that starts with a single /.";

/** What the logo's file type has to be for a TV: Android TV draws PNG, JPG and WebP, not SVG. */
export const LOGO_FORMAT_HINT = "Use a PNG, JPG or WebP image; an SVG shows here and on web clients but not on Android TV.";

/** Whether `value` (already trimmed) is a usable logo address. */
export function isLogoAddress(value: string): boolean {
  const v = value;
  if (!v || v.length > MAX_LENGTH) return false;
  // Whitespace, control characters and any backslash (a browser reads "\" as "/", so "/\host" is "//host").
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f\\]/.test(v)) return false;
  // A path on this server: one leading "/" and not another.
  if (v.startsWith("/")) return v[1] !== "/";
  // `https://` in any case, a host that does not start with a slash (so no "https:///host"), and no "@" before the path: no credentials.
  if (!/^https:\/\/[^/?#@]/i.test(v) || /^https:\/\/[^/?#]*@/i.test(v)) return false;
  try {
    const url = new URL(v);
    return url.protocol === "https:" && !url.username && !url.password && !!url.hostname && url.href.length <= MAX_LENGTH;
  } catch {
    return false;
  }
}
