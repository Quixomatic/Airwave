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

  test("title exact ops: equals / notEquals / beginsWith / endsWith", () => {
    const it = item({ title: "Star Wars: A New Hope" });
    // equals is EXACT, not substring
    expect(matchesLocalFilter(it, { type: "condition", field: "title", op: "equals", value: "star wars: a new hope" })).toBe(true);
    expect(matchesLocalFilter(it, { type: "condition", field: "title", op: "equals", value: "star wars" })).toBe(false);
    expect(matchesLocalFilter(it, { type: "condition", field: "title", op: "notEquals", value: "star wars" })).toBe(true);
    expect(matchesLocalFilter(it, { type: "condition", field: "title", op: "beginsWith", value: "star" })).toBe(true);
    expect(matchesLocalFilter(it, { type: "condition", field: "title", op: "beginsWith", value: "hope" })).toBe(false);
    expect(matchesLocalFilter(it, { type: "condition", field: "title", op: "endsWith", value: "hope" })).toBe(true);
  });

  test("title exact ops also match the show title (episodes) and negate across both candidates", () => {
    const ep = item({ title: "Chapter 1", showTitle: "Andor" });
    expect(matchesLocalFilter(ep, { type: "condition", field: "title", op: "equals", value: "andor" })).toBe(true);
    // notEquals must be false when EITHER candidate equals the value
    expect(matchesLocalFilter(ep, { type: "condition", field: "title", op: "notEquals", value: "andor" })).toBe(false);
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
