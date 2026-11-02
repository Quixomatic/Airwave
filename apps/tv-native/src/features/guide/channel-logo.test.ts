/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { hasLogoPlate, logoSource } from "./channel-logo";
import { AURORA } from "./guide-tokens";
import { deepMerge, GUIDE_THEMES, resolveGuideTokens } from "./guide-themes";

const SERVER = "https://tv.example.com";

describe("logoSource", () => {
  test("uses an https address as it is", () => {
    expect(logoSource("https://logos.example.com/news.png", SERVER)).toBe("https://logos.example.com/news.png");
    expect(logoSource("  https://logos.example.com/news.png ", SERVER)).toBe("https://logos.example.com/news.png");
  });

  test("joins a server path to the server's address", () => {
    expect(logoSource("/img/ch1?path=%2Flibrary%2Fx", SERVER)).toBe("https://tv.example.com/img/ch1?path=%2Flibrary%2Fx");
    expect(logoSource("/logos/a.png", "http://tv.example.com:3000")).toBe("http://tv.example.com:3000/logos/a.png");
    expect(logoSource("/logos/a.png", "http://tv.example.com:3000/")).toBe("http://tv.example.com:3000/logos/a.png");
  });

  test("no logo is null", () => {
    for (const v of [null, undefined, "", "   "]) expect(logoSource(v, SERVER)).toBeNull();
  });

  test("anything else is not a logo", () => {
    for (const bad of ["http://logos.example.com/a.png", "ftp://x/a.png", "file:///a.png", "javascript:alert(1)", "data:image/png;base64,AA", "//logos.example.com/a.png", "https://", "logos.example.com/a.png", "https://x.example/a b.png"]) {
      expect(logoSource(bad, SERVER), bad).toBeNull();
    }
  });

  test("credentials, backslashes and control characters are not a logo, as on the server", () => {
    for (const bad of [
      "https://user:pw@logos.example.com/a.png",
      "https://user@logos.example.com/a.png",
      "https://@logos.example.com/a.png",
      "/\\logos.example.com/a.png", // a backslash reads as a slash: this is "//logos.example.com/a.png"
      "/logos\\a.png",
      "https://logos.example.com\\@evil.example/a.png",
      "https://logos.example.com/a\u0000.png",
      "https://logos.example.com/a\u007f.png",
      "/logos/a\tb.png",
    ]) {
      expect(logoSource(bad, SERVER), JSON.stringify(bad)).toBeNull();
    }
  });

  test("the scheme can be in any case, and an @ in the path is only a character", () => {
    // Fresco matches the scheme case-sensitively, so only that part is folded (the host is the network's to fold, the path is not touched).
    expect(logoSource("HTTPS://Logos.Example.com/A.png", SERVER)).toBe("https://Logos.Example.com/A.png");
    expect(logoSource("Https://logos.example.com/a.png", SERVER)).toBe("https://logos.example.com/a.png");
    expect(logoSource("https://logos.example.com/a@b.png", SERVER)).toBe("https://logos.example.com/a@b.png");
  });

  test("a server path needs a server", () => {
    expect(logoSource("/logos/a.png", "")).toBeNull();
    expect(logoSource("https://logos.example.com/a.png", "")).toBe("https://logos.example.com/a.png");
  });

  test("an over-long address is not a logo", () => {
    expect(logoSource(`https://logos.example.com/${"a".repeat(2100)}`, SERVER)).toBeNull();
  });
});

describe("hasLogoPlate", () => {
  test("is true only for a plate that paints something", () => {
    expect(hasLogoPlate("transparent")).toBe(false);
    expect(hasLogoPlate("rgba(0,0,0,0)")).toBe(false);
    expect(hasLogoPlate("rgba(0, 0, 0, 0.0)")).toBe(false);
    expect(hasLogoPlate("#00000000")).toBe(false);
    expect(hasLogoPlate("rgba(29,36,48,0.9)")).toBe(true);
    expect(hasLogoPlate("#1d2430")).toBe(true);
    expect(hasLogoPlate("#1d243080")).toBe(true);
    expect(hasLogoPlate("#000000")).toBe(true);
  });

  test("Aurora has no plate, and neither has any theme yet; one that adds a plate gets its logos inset", () => {
    expect(hasLogoPlate(AURORA.logoPlate)).toBe(false);
    expect(GUIDE_THEMES.flatMap((t) => t.variants.filter((v) => hasLogoPlate(resolveGuideTokens(t.id, v.id).logoPlate)).map((v) => `${t.id}/${v.id}`))).toEqual([]);
    expect(hasLogoPlate(deepMerge(AURORA, { logoPlate: "rgba(29,36,48,0.9)" }).logoPlate)).toBe(true);
  });
});
