/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { hexA, parseColor } from "./color";

describe("parseColor", () => {
  test("reads every form the tokens use", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#2f9e8f")).toEqual({ r: 47, g: 158, b: 143, a: 1 });
    expect(parseColor("#2f9e8f80")).toEqual({ r: 47, g: 158, b: 143, a: 128 / 255 });
    expect(parseColor("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseColor("rgba(1, 2, 3, 0.25)")).toEqual({ r: 1, g: 2, b: 3, a: 0.25 });
    expect(parseColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  test("throws on anything else", () => {
    expect(() => parseColor("red")).toThrow();
    expect(() => parseColor("#12345")).toThrow();
  });
});

describe("hexA", () => {
  test("a #rgb or #rrggbb color at an alpha", () => {
    expect(hexA("#2f9e8f", 0.5)).toBe("rgba(47, 158, 143, 0.5)");
    expect(hexA("#fff", 0.1)).toBe("rgba(255, 255, 255, 0.1)");
    expect(hexA("#000000", 0)).toBe("rgba(0, 0, 0, 0)");
  });

  test("an 8-digit hex keeps its own alpha, scaled by the one asked for", () => {
    // `#2f9e8f80` is #2f9e8f at 50%: at 50% again it is 25%. The old reading took the middle bytes for red, green and blue.
    expect(hexA("#2f9e8f80", 0.5)).toBe("rgba(47, 158, 143, 0.251)");
    expect(hexA("#2f9e8fff", 0.3)).toBe("rgba(47, 158, 143, 0.3)");
    expect(hexA("#2f9e8f00", 0.9)).toBe("rgba(47, 158, 143, 0)");
    expect(hexA("#ff000080", 1)).toBe("rgba(255, 0, 0, 0.502)");
  });

  test("an rgb() or rgba() color keeps its channels and its alpha, scaled", () => {
    expect(hexA("rgb(10, 20, 30)", 0.4)).toBe("rgba(10, 20, 30, 0.4)");
    expect(hexA("rgba(10, 20, 30, 0.5)", 0.5)).toBe("rgba(10, 20, 30, 0.25)");
    expect(hexA("rgba(10, 20, 30, 1)", 0.7)).toBe("rgba(10, 20, 30, 0.7)");
    expect(hexA("rgba(10.4, 20.6, 30, 0.5)", 1)).toBe("rgba(10, 21, 30, 0.5)");
  });

  test("transparent stays transparent", () => {
    expect(hexA("transparent", 0.5)).toBe("rgba(0, 0, 0, 0)");
  });

  // The rule a shadow step's and a halo ring's alpha follows, whatever form the color is in: the color's own alpha times the one asked for.
  // GuideColor.scaleAlpha (packages/native-guide, GuideColorTest) applies it to the same colors and gets the same alphas, as bytes.
  test("a shadow's or a halo's alpha is the color's own times the step's, in every form", () => {
    const alphaOf = (css: string) => Number(/, ([\d.]+)\)$/.exec(css)![1]);
    const cases: [string, number, number][] = [
      ["#000000", 0.34, 0.34],
      ["#000", 1, 1],
      ["#00000080", 0.5, 0.251],
      ["rgba(0, 0, 0, 0.5)", 0.2, 0.1],
      ["rgb(0, 0, 0)", 0.2, 0.2],
      ["#000000ff", 0.4, 0.4],
    ];
    for (const [color, a, want] of cases) expect(alphaOf(hexA(color, a)), color).toBeCloseTo(want, 3);
  });

  test("a color it cannot read comes back as it was", () => {
    expect(hexA("red", 0.5)).toBe("red");
    expect(hexA("", 0.5)).toBe("");
  });
});
