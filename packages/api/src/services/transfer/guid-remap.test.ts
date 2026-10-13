import { describe, expect, test } from "bun:test";

import { type CacheRow, type GuidRef, indexCacheRows, resolveFromIndex } from "./guid-remap";

const row = (over: Partial<CacheRow> & { ratingKey: string }): CacheRow => ({
  type: "movie",
  tmdbId: null,
  tvdbId: null,
  imdbId: null,
  ...over,
});

const ref = (over: Partial<GuidRef> & { ref: string }): GuidRef => ({ type: "movie", ...over });

describe("indexCacheRows + resolveFromIndex", () => {
  test("resolves by tmdb id", () => {
    const idx = indexCacheRows([row({ ratingKey: "100", tmdbId: "603" })]);
    expect(resolveFromIndex(ref({ ref: "a", tmdbId: "603" }), idx)).toBe("100");
  });

  test("tries tmdb → imdb → tvdb in order (tmdb miss falls through to imdb)", () => {
    const idx = indexCacheRows([row({ ratingKey: "200", imdbId: "tt123" })]);
    const r = ref({ ref: "a", tmdbId: "999" /* not in cache */, imdbId: "tt123" });
    expect(resolveFromIndex(r, idx)).toBe("200");
  });

  test("prefers a row whose TYPE matches when one id sits on multiple rows", () => {
    // Same tmdb id on both a show row and (hypothetically) a movie row — a show ref must pick the show.
    const idx = indexCacheRows([
      row({ ratingKey: "movieRK", type: "movie", tmdbId: "55" }),
      row({ ratingKey: "showRK", type: "show", tmdbId: "55" }),
    ]);
    expect(resolveFromIndex(ref({ ref: "a", type: "show", tmdbId: "55" }), idx)).toBe("showRK");
    expect(resolveFromIndex(ref({ ref: "b", type: "movie", tmdbId: "55" }), idx)).toBe("movieRK");
  });

  test("falls back to the first row when no type matches", () => {
    const idx = indexCacheRows([row({ ratingKey: "only", type: "movie", tmdbId: "7" })]);
    expect(resolveFromIndex(ref({ ref: "a", type: "episode", tmdbId: "7" }), idx)).toBe("only");
  });

  test("returns null when no id matches, and when the ref carries no ids", () => {
    const idx = indexCacheRows([row({ ratingKey: "100", tmdbId: "603" })]);
    expect(resolveFromIndex(ref({ ref: "a", tmdbId: "nope" }), idx)).toBeNull();
    expect(resolveFromIndex(ref({ ref: "b" }), idx)).toBeNull(); // no ids at all
  });
});
