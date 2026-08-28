import { describe, expect, test } from "bun:test";

import { buildParam, type FilterOp, OPS_FOR_KIND } from "./filter-fields";

// Text fields (title) never resolve tags, so this stub is never called for these cases.
const noTag = async () => undefined;
const cond = (field: string, op: FilterOp, value: string) =>
  ({ type: "condition" as const, field, op, value });

describe("buildParam — string operators (the =-count IS the operator)", () => {
  // The `=` count is the operator, BUT exact equals must encode its op-`=` as %3D (Plex splits on the first
  // `=`); verified against a real library in scripts/test-filter-ops.ts. The single-`=` ops go raw.
  const cases: [FilterOp, string][] = [
    ["contains", "title=Bear"], // substring
    ["notContains", "title!=Bear"],
    ["equals", "title%3D=Bear"], // EXACT — %3D= not == (== silently becomes contains-of-"=Bear")
    ["notEquals", "title!%3D=Bear"],
    ["beginsWith", "title<=Bear"],
    ["endsWith", "title>=Bear"],
  ];
  for (const [op, expected] of cases) {
    test(`title ${op} -> ${expected}`, async () => {
      expect(await buildParam(cond("title", op, "Bear"), noTag)).toBe(expected);
    });
  }

  test("equals (==) is exact vs contains (=) is substring — the whole point", async () => {
    expect(await buildParam(cond("title", "equals", "Bear"), noTag)).toBe("title%3D=Bear");
    expect(await buildParam(cond("title", "contains", "Bear"), noTag)).toBe("title=Bear");
  });

  test("operator is literal, only the value is URI-encoded", async () => {
    expect(await buildParam(cond("title", "equals", "Star Wars"), noTag)).toBe("title%3D=Star%20Wars");
  });

  test("TV libraries use the dotted show./episode. scope", async () => {
    expect(await buildParam(cond("title", "equals", "Bluey"), noTag, { libType: "show" })).toBe("show.title%3D=Bluey");
    expect(await buildParam(cond("episodeTitle", "equals", "Pilot"), noTag, { libType: "show" })).toBe(
      "episode.title%3D=Pilot",
    );
  });

  test("text fields expose both fuzzy and exact ops; contains stays the default", () => {
    expect(OPS_FOR_KIND.text).toEqual(
      expect.arrayContaining(["contains", "notContains", "equals", "notEquals", "beginsWith", "endsWith"]),
    );
    expect(OPS_FOR_KIND.text[0]).toBe("contains"); // default op unchanged → existing channels keep substring behavior
  });
});
