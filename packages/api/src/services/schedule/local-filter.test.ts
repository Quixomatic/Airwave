import { describe, expect, test } from "bun:test";

import type { PlexItem } from "../plex/client";
import type { FilterNode } from "../plex/filter-fields";
import { matchesLocalFilter } from "./local-filter";

function item(over: Partial<PlexItem["guide"]> & { title?: string; year?: number; durationMs?: number } = {}): PlexItem {
  const { title = "Item", year, durationMs = 60 * 60_000, ...guide } = over;
  return { ratingKey: "r", title, durationMs, year, guide: { title, year, ...guide } };
}

describe("matchesLocalFilter", () => {
  test("no filter → matches", () => {
    expect(matchesLocalFilter(item(), null)).toBe(true);
  });

  test("title contains / notContains", () => {
    const it = item({ title: "Star Wars: A New Hope" });
    expect(matchesLocalFilter(it, { type: "condition", field: "title", op: "contains", value: "star wars" })).toBe(true);
    expect(matchesLocalFilter(it, { type: "condition", field: "title", op: "notContains", value: "trek" })).toBe(true);
    expect(matchesLocalFilter(it, { type: "condition", field: "title", op: "contains", value: "trek" })).toBe(false);
  });

  test("genre tag is / isNot", () => {
    const it = item({ genres: ["Sci-Fi", "Adventure"] });
    expect(matchesLocalFilter(it, { type: "condition", field: "genre", op: "is", value: "sci-fi" })).toBe(true);
    expect(matchesLocalFilter(it, { type: "condition", field: "genre", op: "isNot", value: "comedy" })).toBe(true);
    expect(matchesLocalFilter(it, { type: "condition", field: "genre", op: "is", value: "comedy" })).toBe(false);
  });

  test("year gte/lte + and/or groups", () => {
    const it = item({ title: "T", year: 1980 });
    const and: FilterNode = {
      type: "group",
      combinator: "and",
      children: [
        { type: "condition", field: "year", op: "gte", value: "1977" },
        { type: "condition", field: "year", op: "lte", value: "1983" },
      ],
    };
    expect(matchesLocalFilter(it, and)).toBe(true);
    const or: FilterNode = {
      type: "group",
      combinator: "or",
      children: [
        { type: "condition", field: "year", op: "lte", value: "1970" },
        { type: "condition", field: "title", op: "contains", value: "t" },
      ],
    };
    expect(matchesLocalFilter(it, or)).toBe(true);
  });

  test("unsupported (non-cached) field does not claim", () => {
    expect(matchesLocalFilter(item(), { type: "condition", field: "unwatched", op: "is", value: "true" })).toBe(false);
  });
});
