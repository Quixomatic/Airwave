/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { marksOptions } from "./marks-options";

describe("marksOptions", () => {
  test("the same rows in the same order whether or not a channel has a logo, so the page never shifts as the guide loads", () => {
    const key = (o: ReturnType<typeof marksOptions>) => o.map((r) => `${r.value}:${r.label}`);
    for (const marks of ["icons", "logos"] as const) {
      expect(key(marksOptions(marks, false))).toEqual(["icons:Icons", "logos:Logos"]);
      expect(key(marksOptions(marks, true))).toEqual(key(marksOptions(marks, false)));
    }
  });

  test("Logos is disabled until some channel has a logo", () => {
    const [icons, logos] = marksOptions("icons", false);
    expect(icons!.disabled).toBe(false);
    expect(logos!.disabled).toBe(true);
    expect(logos!.sublabel).toContain("No channel has a logo");
    expect(marksOptions("icons", true)[1]!.disabled).toBe(false);
  });

  test("a chosen Logos stays choosable, so it can be turned off again", () => {
    const [icons, logos] = marksOptions("logos", false);
    expect(logos!.selected).toBe(true);
    expect(logos!.disabled).toBe(false);
    expect(icons!.disabled).toBe(false);
    expect(icons!.selected).toBe(false);
  });

  test("exactly one row is selected", () => {
    expect(marksOptions("icons", false).filter((o) => o.selected).map((o) => o.value)).toEqual(["icons"]);
    expect(marksOptions("logos", true).filter((o) => o.selected).map((o) => o.value)).toEqual(["logos"]);
  });
});
