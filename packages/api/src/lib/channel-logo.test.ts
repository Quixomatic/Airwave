import { describe, expect, test } from "bun:test";

import { isLogoAddress as formAccepts } from "../../../../apps/web/src/features/channels/channel-logo";
import { logoSource } from "../../../../apps/tv-native/src/features/guide/channel-logo";
import cases from "./channel-logo-cases.json";
import { CHANNEL_LOGO_MAX_LENGTH, channelLogoField, parseChannelLogo, portableChannelLogo } from "./channel-logo";

describe("parseChannelLogo", () => {
  test("accepts an https URL", () => {
    expect(parseChannelLogo("https://logos.example.com/news.png")).toBe("https://logos.example.com/news.png");
    expect(parseChannelLogo("https://logos.example.com:8443/a/b.svg?v=2")).toBe("https://logos.example.com:8443/a/b.svg?v=2");
  });

  test("accepts a path on the server", () => {
    expect(parseChannelLogo("/img/ch1?path=%2Flibrary%2Fmetadata%2F42%2Fthumb")).toBe("/img/ch1?path=%2Flibrary%2Fmetadata%2F42%2Fthumb");
    expect(parseChannelLogo("/logos/news.png")).toBe("/logos/news.png");
  });

  test("trims the address it stores", () => {
    expect(parseChannelLogo("  https://logos.example.com/a.png \n")).toBe("https://logos.example.com/a.png");
  });

  test("rejects anything but https and a server path", () => {
    for (const bad of [
      "http://logos.example.com/a.png",
      "ftp://logos.example.com/a.png",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "//logos.example.com/a.png", // protocol-relative: it would name another host
      "/\\logos.example.com/a.png", // a browser reads the backslash as a slash: this is "//logos.example.com/a.png"
      "\\\\logos.example.com\\a.png",
      "logos.example.com/a.png",
      "a.png",
      "https://",
      "https:///a.png",
    ]) {
      expect(parseChannelLogo(bad), bad).toBeNull();
    }
  });

  test("rejects credentials in the URL", () => {
    expect(parseChannelLogo("https://user:pw@logos.example.com/a.png")).toBeNull();
    expect(parseChannelLogo("https://user@logos.example.com/a.png")).toBeNull();
    expect(parseChannelLogo("https://@logos.example.com/a.png")).toBeNull(); // empty credentials still say "@"
    expect(parseChannelLogo("https://logos.example.com/a@b.png")).not.toBeNull(); // an "@" in the path is only a character
  });

  test("rejects any backslash, and a path whose second character is a slash or a backslash", () => {
    for (const bad of ["/\\host/a.png", "/\\\\host/a.png", "//host/a.png", "/a\\b.png", "https://logos.example.com\\@evil.example/", "https:\\\\host/a.png"]) {
      expect(parseChannelLogo(bad), bad).toBeNull();
    }
    expect(parseChannelLogo("/a/b.png")).toBe("/a/b.png");
  });

  test("the scheme can be in any case, and is stored in lower case", () => {
    expect(parseChannelLogo("HTTPS://logos.example.com/a.png")).toBe("https://logos.example.com/a.png");
  });

  test("rejects whitespace and control characters inside the address", () => {
    expect(parseChannelLogo("https://logos.example.com/a b.png")).toBeNull();
    expect(parseChannelLogo("/logos/a\tb.png")).toBeNull();
    expect(parseChannelLogo("https://logos.example.com/a.png\u0000")).toBeNull();
  });

  test("rejects an empty or over-long address", () => {
    expect(parseChannelLogo("")).toBeNull();
    expect(parseChannelLogo("   ")).toBeNull();
    const longPath = `/${"a".repeat(CHANNEL_LOGO_MAX_LENGTH)}`;
    expect(parseChannelLogo(longPath)).toBeNull();
    expect(parseChannelLogo(`/${"a".repeat(CHANNEL_LOGO_MAX_LENGTH - 1)}`)).not.toBeNull();
  });
});

describe("portableChannelLogo", () => {
  test("an https logo travels with the channel", () => {
    expect(portableChannelLogo("https://logos.example.com/news.png")).toBe("https://logos.example.com/news.png");
    expect(portableChannelLogo("  https://logos.example.com/news.png ")).toBe("https://logos.example.com/news.png");
  });

  test("a path on this server does not: on another server it names nothing", () => {
    expect(portableChannelLogo("/img/ch1?path=%2Flibrary%2Fmetadata%2F42%2Fthumb")).toBeNull();
    expect(portableChannelLogo("/logos/news.png")).toBeNull();
  });

  test("no logo, and a stored value that is not a usable address, export as none", () => {
    for (const v of [null, undefined, "", "   ", "http://logos.example.com/a.png", "//logos.example.com/a.png"]) expect(portableChannelLogo(v), String(v)).toBeNull();
  });
});

describe("the server, the admin form and the TV agree on every address", () => {
  const server = "https://tv.example.test:3000";

  test("addresses a channel's logo may be: what the server stores, and what the TV loads from it", () => {
    for (const [v, stored] of cases.accept as [string, string][]) {
      expect(parseChannelLogo(v), `server: ${JSON.stringify(v)}`).toBe(stored);
      expect(formAccepts(v), `form: ${JSON.stringify(v)}`).toBe(true);
      // Stored, an address is loaded as it is (a path joined to the server's address); the stored form is itself a good address.
      expect(logoSource(stored, server), `tv, stored: ${JSON.stringify(stored)}`).toBe(stored.startsWith("/") ? `${server}${stored}` : stored);
      expect(parseChannelLogo(stored), `stored again: ${JSON.stringify(stored)}`).toBe(stored);
      // An address stored before the server normalised it still loads: the TV lowercases the scheme, the one thing Fresco is case-sensitive about.
      expect(logoSource(v, server), `tv, as typed: ${JSON.stringify(v)}`).toBe(v.startsWith("/") ? `${server}${v}` : v.replace(/^https:/i, "https:"));
    }
  });

  test("an https address is stored with a lower-case scheme (Fresco matches no other), and a path as it is", () => {
    expect(parseChannelLogo("HTTPS://Logos.Example.com/A.png")).toBe("https://logos.example.com/A.png"); // only the scheme and host fold
    expect(parseChannelLogo("Https://logos.example.com")).toBe("https://logos.example.com/");
    expect(parseChannelLogo("/Logos/A.png")).toBe("/Logos/A.png");
    expect(channelLogoField.parse(" HTTPS://Logos.example.com/a.png ")).toBe("https://logos.example.com/a.png");
    expect(portableChannelLogo("HTTPS://Logos.example.com/a.png")).toBe("https://logos.example.com/a.png");
  });

  test("an address that is within the limit as typed but not once it is canonical is not stored", () => {
    // A host with a trailing dot or an IDN grows when parsed: this one is exactly at the limit as typed and over it as an href.
    const long = `https://logos.example.com/${"a".repeat(CHANNEL_LOGO_MAX_LENGTH - "https://logos.example.com/".length)}`;
    expect(long.length).toBe(CHANNEL_LOGO_MAX_LENGTH);
    expect(parseChannelLogo(long)).toBe(long);
    const wide = `https://m\u00fcnchen.example/${"a".repeat(CHANNEL_LOGO_MAX_LENGTH - "https://m\u00fcnchen.example/".length)}`;
    expect(wide.length).toBe(CHANNEL_LOGO_MAX_LENGTH);
    expect(parseChannelLogo(wide)).toBeNull(); // punycode makes the host longer
    expect(formAccepts(wide), "the form says what the server will").toBe(false);
    expect(formAccepts(long)).toBe(true);
  });

  test("addresses it may not be", () => {
    for (const v of cases.reject) {
      expect(parseChannelLogo(v), `server: ${JSON.stringify(v)}`).toBeNull();
      expect(formAccepts(v.trim()), `form: ${JSON.stringify(v)}`).toBe(false);
      expect(logoSource(v, server), `tv: ${JSON.stringify(v)}`).toBeNull();
    }
  });

  test("the length limit is the same", () => {
    const edge = `/${"a".repeat(CHANNEL_LOGO_MAX_LENGTH - 1)}`;
    for (const v of [edge, `${edge}a`, `https://logos.example.com/${"a".repeat(CHANNEL_LOGO_MAX_LENGTH)}`]) {
      const ok = parseChannelLogo(v) !== null;
      expect(formAccepts(v), `form: ${v.length}`).toBe(ok);
      expect(logoSource(v, server) !== null, `tv: ${v.length}`).toBe(ok);
    }
  });

  test("the limit is on the address as it is stored, for the server and the admin form alike", () => {
    // Typed lengths well under 2048, canonical lengths either side of it: an "é" is "%C3%A9" (6 characters) once stored; an IDN host is punycode.
    const prefix = "https://logos.example.com/";
    const addresses = [
      `${prefix}${"\u00e9".repeat(300)}`, // 326 typed, 1826 stored: fits
      `${prefix}${"\u00e9".repeat(337)}`, // 363 typed, 2048 stored: the limit exactly
      `${prefix}${"\u00e9".repeat(338)}`, // 364 typed, 2054 stored: over
      `${prefix}${"\u00e9".repeat(500)}`, // 526 typed, 3026 stored: over
      `https://m\u00fcnchen.example/${"\u00e9".repeat(337)}`, // an IDN host as well
    ];
    for (const v of addresses) {
      const stored = parseChannelLogo(v);
      expect(formAccepts(v), `form: ${v.length} typed`).toBe(stored !== null);
      if (stored !== null) expect(stored.length, "what is stored is within the limit").toBeLessThanOrEqual(CHANNEL_LOGO_MAX_LENGTH);
    }
    expect(parseChannelLogo(addresses[0]!)).not.toBeNull();
    expect(parseChannelLogo(addresses[1]!)).not.toBeNull();
    expect(parseChannelLogo(addresses[2]!)).toBeNull();
    expect(parseChannelLogo(addresses[3]!)).toBeNull();
    expect(parseChannelLogo(addresses[4]!)).toBeNull();
    // (The TV has no URL parser to measure the stored form with; it only ever sees what the server stored, which already passed this.)
  });

  test("the TV adds its server's address to a path, and has none to add to without one", () => {
    expect(logoSource("/logos/a.png", "https://tv.example.test:3000/")).toBe("https://tv.example.test:3000/logos/a.png");
    expect(logoSource("/logos/a.png", "")).toBeNull();
    expect(logoSource(null, server)).toBeNull();
  });
});

describe("channelLogoField", () => {
  test("null, empty and blank clear the logo; absent stays absent", () => {
    for (const v of [null, "", "  "]) expect(channelLogoField.parse(v)).toBeNull();
    expect(channelLogoField.parse(undefined)).toBeUndefined();
  });

  test("a good address is stored trimmed", () => {
    expect(channelLogoField.parse(" https://logos.example.com/a.png ")).toBe("https://logos.example.com/a.png");
    expect(channelLogoField.parse("/logos/a.png")).toBe("/logos/a.png");
  });

  test("a bad address is rejected with the hint, not stored as null", () => {
    const r = channelLogoField.safeParse("http://logos.example.com/a.png");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toContain("https://");
  });
});
