import { z } from "zod";

/** The longest logo address a channel stores. */
export const CHANNEL_LOGO_MAX_LENGTH = 2048;

export const CHANNEL_LOGO_HINT = "Use an https:// image address, or a path on this server that starts with a single /.";

/**
 * A channel's logo is an address the TV loads straight into the guide's channel column: an `https://` URL, or a path on
 * the Airwave server itself (it starts with a single `/`, and the TV adds the server's address). Returns the address as it
 * should be stored, or null when it is not a usable logo: another scheme, credentials in the URL, whitespace or control characters, a
 * backslash, a protocol-relative `//host`, or something too long. An https address is stored in its canonical form (`URL.href`: the
 * scheme and host in lower case, an empty path as `/`): Fresco on Android matches only a lower-case `https` scheme, so an `HTTPS://` address
 * stored as typed would be accepted and then never load on Android TV. A path is stored as it is (trimmed).
 *
 * The admin form (apps/web `channel-logo.ts`) and the TV (apps/tv-native `channel-logo.ts`) check the same rule as you type or
 * before they load an address; `channel-logo.test.ts` runs one list of addresses through all three, so they cannot drift apart.
 * (The TV has no WHATWG URL to lean on, so it checks the rule's grammar only; the server and the form also parse the URL.)
 */
export function parseChannelLogo(value: string): string | null {
  const v = value.trim();
  if (!v || v.length > CHANNEL_LOGO_MAX_LENGTH) return null;
  // Whitespace, control characters and any backslash. A browser reads a backslash as a slash, so "/\host" is "//host": another host.
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f\\]/.test(v)) return null;
  // A path on this server: one leading "/" and not another ("//host" names a host).
  if (v.startsWith("/")) return v[1] === "/" ? null : v;
  // `new URL` is forgiving about extra slashes ("https:///host" reads as "https://host"): the address must say what it means.
  // And no "@" before the path: that is where credentials go ("https://user:pw@host", and the empty "https://@host" too).
  if (!/^https:\/\/[^/?#@]/i.test(v) || /^https:\/\/[^/?#]*@/i.test(v)) return null;
  try {
    const url = new URL(v);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) return null;
    return url.href.length <= CHANNEL_LOGO_MAX_LENGTH ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * What a channel's logo exports as. An https address travels with the channel; a path on THIS server (`/img/<channelId>?…`, or a
 * file it serves) names something that exists only here, so on another server it would be a broken image: it is left out, and the
 * channel imports with its icon.
 */
export function portableChannelLogo(logo: string | null | undefined): string | null {
  const v = logo ? parseChannelLogo(logo) : null;
  return v !== null && !v.startsWith("/") ? v : null;
}

/**
 * The `logo` field of a channel input. Absent stays absent (an update leaves the logo as it is); null or blank clears it;
 * anything else has to pass {@link parseChannelLogo}, or the request is rejected with the hint, so a typo is caught where
 * it is made.
 */
export const channelLogoField = z
  .string()
  .nullish()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null || v.trim() === "") return null;
    const logo = parseChannelLogo(v);
    if (logo === null) {
      ctx.addIssue(`Not a usable logo address. ${CHANNEL_LOGO_HINT}`);
      return z.NEVER;
    }
    return logo;
  });
