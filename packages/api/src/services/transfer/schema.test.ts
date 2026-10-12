import { describe, expect, test } from "bun:test";

import {
  CURRENT_SCHEMA_VERSION,
  type LineupEnvelope,
  classifyVersion,
  migrateToCurrent,
  parseVersion,
  readSchemaVersion,
} from "./schema";

const base = (over: Partial<LineupEnvelope> = {}): LineupEnvelope => ({
  packages: [],
  channels: [],
  ...over,
});

describe("version parsing", () => {
  test("parseVersion reads MAJOR.MINOR and tolerates junk", () => {
    expect(parseVersion("1.0")).toEqual([1, 0]);
    expect(parseVersion("1.1")).toEqual([1, 1]);
    expect(parseVersion("2.13")).toEqual([2, 13]);
    expect(parseVersion("1.0.4")).toEqual([1, 0]); // extra patch ignored
    expect(parseVersion("garbage")).toEqual([0, 0]);
  });

  test("readSchemaVersion prefers schemaVersion, maps the legacy integer, defaults to CURRENT", () => {
    expect(readSchemaVersion({ schemaVersion: "1.1" })).toBe("1.1");
    expect(readSchemaVersion({ version: 1 })).toBe("1.0"); // legacy
    expect(readSchemaVersion({ version: 2 })).toBe("2.0");
    expect(readSchemaVersion({})).toBe(CURRENT_SCHEMA_VERSION);
    // schemaVersion wins over a legacy version if both are present
    expect(readSchemaVersion({ schemaVersion: "1.3", version: 1 })).toBe("1.3");
  });
});

describe("classifyVersion vs 1.0", () => {
  test("relations", () => {
    expect(classifyVersion("1.0", "1.0")).toBe("current");
    expect(classifyVersion("1.1", "1.0")).toBe("newer-minor");
    expect(classifyVersion("2.0", "1.0")).toBe("newer-major");
    expect(classifyVersion("1.0", "1.1")).toBe("older"); // a 1.0 file read by a 1.1 reader
    expect(classifyVersion("0.9", "1.0")).toBe("older");
  });
});

describe("migrateToCurrent", () => {
  test("a legacy integer-versioned export normalizes to CURRENT", () => {
    const r = migrateToCurrent(base({ version: 1 }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fromVersion).toBe("1.0");
      expect(r.doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    }
  });

  test("a current export passes through unchanged", () => {
    const r = migrateToCurrent(base({ schemaVersion: CURRENT_SCHEMA_VERSION }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.relation).toBe("current");
  });

  test("a newer-MAJOR export is rejected cleanly", () => {
    const r = migrateToCurrent(base({ schemaVersion: "2.0" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.relation).toBe("newer-major");
      expect(r.reason).toMatch(/newer version of Airwave/i);
    }
  });

  test("a newer-MINOR same-major export is accepted and keeps its unknown fields", () => {
    const r = migrateToCurrent(base({ schemaVersion: "1.9", channels: [{ number: 1, name: "X", futureField: 42 } as never] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.relation).toBe("newer-minor");
      expect(r.doc.schemaVersion).toBe("1.9"); // not downgraded
      expect((r.doc.channels[0] as Record<string, unknown>).futureField).toBe(42); // unknowns survive
    }
  });

  test("1.0 → 1.1 defaults the new scheduling fields on a channel that lacks them", () => {
    const r = migrateToCurrent(base({ version: 1, channels: [{ number: 1, name: "Old" } as never] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.schemaVersion).toBe("1.1");
      const c = r.doc.channels[0] as Record<string, unknown>;
      expect(c.strategy).toBeNull();
      expect(c.excludeSpecials).toBe(false);
      expect(c.keepMultiPartTogether).toBe(false);
      expect(c.shuffleSeed).toBeNull();
    }
  });

  test("1.0 → 1.1 preserves any values a channel already had", () => {
    const r = migrateToCurrent(
      base({
        version: 1,
        channels: [{ number: 1, name: "Set", excludeSpecials: true, shuffleSeed: 7, strategy: { rotation: "clustered" } } as never],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const c = r.doc.channels[0] as Record<string, unknown>;
      expect(c.excludeSpecials).toBe(true);
      expect(c.shuffleSeed).toBe(7);
      expect(c.strategy).toEqual({ rotation: "clustered" });
      expect(c.keepMultiPartTogether).toBe(false); // the one it didn't set still defaults
    }
  });
});
