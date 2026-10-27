/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import type { GuideGridChannel, GuideGridProgram, GuideMeta } from "@/lib/api";

import type { Lane } from "./geometry";

import {
  applyLineupUpdate,
  clampScroll,
  classicFollow,
  classicHandOver,
  classicListStart,
  followScroll,
  GlyphSync,
  Handover,
  hitRow,
  LineupSync,
  packChannel,
  type LineupResolvers,
} from "./native-rows-logic";

const T = Date.UTC(2026, 9, 26, 18, 0, 0);
const MIN = 60_000;
const iso = (min: number) => new Date(T + min * MIN).toISOString();

const prog = (id: string, startMin: number, durMin: number, guide: Partial<GuideMeta> = {}): GuideGridProgram => ({
  id,
  ratingKey: null,
  startsAt: iso(startMin),
  durationSeconds: durMin * 60,
  guide: { title: `Title ${id}`, ...guide },
});
const channel = (id: string, programs: GuideGridProgram[] = [prog(`${id}-1`, 0, 30)], over: Partial<GuideGridChannel> = {}): GuideGridChannel => ({
  id,
  number: Number(id.replace(/\D/g, "")) || 1,
  name: `Channel ${id}`,
  callsign: null,
  icon: null,
  tint: null,
  package: null,
  programs,
  ...over,
});

// Stand-ins for the app's layout helpers and icon set, which can't load outside React Native.
const resolvers: LineupResolvers = {
  icon: (ch) => ((ch.icon ?? ch.package?.icon)?.startsWith("lucide:") ? (ch.icon ?? ch.package!.icon!) : "lucide:Radio"),
  sub: (g) => g.contentRating ?? "",
  accent: (_ch, i) => `#00000${i % 10}`,
};
const NONE = new Set<string>();
const FROM = T - 30 * MIN;

type Update = { s: string; order: string[]; accent: string[]; fav: number[]; add: [string, ReturnType<typeof packChannel>][] };
const parse = (json: string | null): Update => JSON.parse(json!) as Update;

describe("packChannel", () => {
  test("packs the fields the native store reads, in order", () => {
    const c = channel("c7", [prog("p1", 10, 30, { title: "Pilot", showTitle: "The Show", contentRating: "TV-14" })], { number: 7, name: "Seven" });
    expect(packChannel(c, "lucide:Tv", FROM, resolvers.sub)).toEqual(["c7", "7", "Seven", "lucide:Tv", null, [["p1", T + 10 * MIN, 1800, "The Show", null, "TV-14"]]]);
  });

  test("a program shows its show title, else its own", () => {
    const c = channel("c1", [prog("a", 0, 30, { title: "Movie" }), prog("b", 30, 30, { title: "Ep", showTitle: "Show" })]);
    expect(packChannel(c, "lucide:Radio", FROM, resolvers.sub)[5].map((p) => p[3])).toEqual(["Movie", "Show"]);
  });

  test("coerces what a live guide can hand over", () => {
    const c = channel("c1", [
      { ...prog("neg", 0, 30), durationSeconds: -90 },
      { ...prog("nan", 5, 30), durationSeconds: Number.NaN },
      { ...prog("frac", 10, 30), durationSeconds: 1799.6 },
      { ...prog("blank", 15, 30), guide: {} as GuideMeta },
    ]);
    const packed = packChannel(c, "lucide:Radio", T - 120 * MIN, resolvers.sub)[5];
    expect(packed.map((p) => [p[0], p[2]])).toEqual([["neg", 0], ["nan", 0], ["frac", 1800], ["blank", 1800]]);
    expect(packed[3]![3]).toBe(""); // no title packs as ""
    expect(packed[3]![5]).toBe("");
  });

  test("drops a program whose start does not parse", () => {
    const c = channel("c1", [{ ...prog("bad", 0, 30), startsAt: "soon" }, prog("ok", 30, 30)]);
    expect(packChannel(c, "lucide:Radio", FROM, resolvers.sub)[5].map((p) => p[0])).toEqual(["ok"]);
  });

  test("leaves out programs that ended before the timeline starts", () => {
    const c = channel("c1", [prog("past", -90, 30), prog("justEnded", -60, 30), prog("live", -10, 60), prog("next", 50, 30)]);
    // The timeline starts at T - 30 min. "justEnded" ends exactly there, and `cellBox` needs a program to end after it.
    expect(packChannel(c, "lucide:Radio", FROM, resolvers.sub)[5].map((p) => p[0])).toEqual(["live", "next"]);
  });

  test("a missing program list, name or number packs as empty", () => {
    const c = { ...channel("c1"), programs: undefined, name: undefined, number: undefined } as unknown as GuideGridChannel;
    expect(packChannel(c, "lucide:Radio", FROM, resolvers.sub)).toEqual(["c1", "", "", "lucide:Radio", null, []]);
  });
});

describe("LineupSync", () => {
  const a = channel("c1");
  const b = channel("c2");
  const c = channel("c3");

  test("the first update sends every channel once", () => {
    const sync = new LineupSync("s1");
    const u = parse(sync.update([a, b], NONE, resolvers, FROM));
    expect(u.s).toBe("s1");
    expect(u.order).toEqual(["1", "2"]);
    expect(u.add.map(([tok, ch]) => [tok, ch[0]])).toEqual([["1", "c1"], ["2", "c2"]]);
  });

  test("an unchanged lineup sends nothing", () => {
    const sync = new LineupSync("s1");
    expect(sync.update([a, b], NONE, resolvers, FROM)).not.toBeNull();
    sync.accepted(1);
    expect(sync.update([a, b], NONE, resolvers, FROM)).toBeNull();
    expect(sync.update([a, b], new Set(), resolvers, FROM)).toBeNull(); // a new but equal favorites set changes nothing
  });

  test("a channel whose object changed is the only one resent", () => {
    const sync = new LineupSync("s1");
    sync.update([a, b, c], NONE, resolvers, FROM);
    sync.accepted(1);
    const b2 = channel("c2", [prog("c2-1", 0, 30), prog("c2-2", 30, 30)]);
    const u = parse(sync.update([a, b2, c], NONE, resolvers, FROM));
    expect(u.order).toEqual(["1", "4", "3"]);
    expect(u.add.map(([tok, ch]) => [tok, ch[0]])).toEqual([["4", "c2"]]);
  });

  test("a reorder or a lens filter resends no channel", () => {
    const sync = new LineupSync("s1");
    sync.update([a, b, c], NONE, resolvers, FROM);
    sync.accepted(1);
    const reordered = parse(sync.update([c, a, b], NONE, resolvers, FROM));
    expect(reordered.order).toEqual(["3", "1", "2"]);
    expect(reordered.add).toEqual([]);
    sync.accepted(2);
    const filtered = parse(sync.update([b], NONE, resolvers, FROM));
    expect(filtered.order).toEqual(["2"]);
    expect(filtered.add).toEqual([]);
    sync.accepted(3);
    // Back to the full list: the channels the filter dropped are no longer held natively, so they are sent again.
    expect(parse(sync.update([a, b, c], NONE, resolvers, FROM)).add.map(([, ch]) => ch[0])).toEqual(["c1", "c3"]);
  });

  test("favorites ride along with the order: a toggle sends no channel", () => {
    const sync = new LineupSync("s1");
    sync.update([a, b], new Set(["c2"]), resolvers, FROM);
    sync.accepted(1);
    const u = parse(sync.update([a, b], new Set(["c1"]), resolvers, FROM));
    expect(u.fav).toEqual([1, 0]);
    expect(u.add).toEqual([]);
  });

  test("a row's accent follows its position in the lineup shown", () => {
    const sync = new LineupSync("s1");
    expect(parse(sync.update([a, b, c], NONE, resolvers, FROM)).accent).toEqual(["#000000", "#000001", "#000002"]);
    sync.accepted(1);
    const u = parse(sync.update([c], NONE, resolvers, FROM)); // the lens leaves c alone: its accent is now row 0's
    expect(u.accent).toEqual(["#000000"]);
    expect(u.add).toEqual([]);
  });

  test("an icon the resolver now answers differently repacks the channel", () => {
    const sync = new LineupSync("s1");
    sync.update([a], NONE, resolvers, FROM);
    sync.accepted(1);
    const u = parse(sync.update([a], NONE, { ...resolvers, icon: () => "lucide:Tv" }, FROM));
    expect(u.add.map(([, ch]) => ch[3])).toEqual(["lucide:Tv"]);
  });

  test("a timeline that now starts earlier than what a channel was packed from repacks it", () => {
    const sync = new LineupSync("s1");
    const old = channel("c1", [prog("past", -60, 20), prog("now", -10, 40)]);
    sync.update([old], NONE, resolvers, T - 30 * MIN); // packed without "past": it ended 10 min before the timeline started
    sync.accepted(1);
    expect(sync.update([old], NONE, resolvers, T - 29 * MIN)).toBeNull(); // a later start needs nothing new
    const u = parse(sync.update([old], NONE, resolvers, T - 60 * MIN)); // an earlier one brings "past" back into range
    expect(u.add[0]![1][5].map((p) => p[0])).toEqual(["past", "now"]);
  });

  test("reset sends everything again", () => {
    const sync = new LineupSync("s1");
    sync.update([a, b], NONE, resolvers, FROM);
    sync.accepted(1);
    sync.reset();
    expect(parse(sync.update([a, b], NONE, resolvers, FROM)).add.length).toBe(2);
  });
});

describe("applyLineupUpdate", () => {
  const a = channel("c1");
  const b = channel("c2");

  test("hands the update to the store and returns its version", () => {
    const sync = new LineupSync("s1");
    const sent: string[] = [];
    const r = applyLineupUpdate((json) => (sent.push(json), 7), sync, [a, b], NONE, resolvers, FROM);
    expect(r).toEqual({ version: 7, error: null });
    expect(sent.length).toBe(1);
  });

  test("an unchanged lineup does not call the store and keeps its version", () => {
    const sync = new LineupSync("s1");
    let calls = 0;
    const set = () => (calls++, 5);
    applyLineupUpdate(set, sync, [a, b], NONE, resolvers, FROM);
    expect(applyLineupUpdate(set, sync, [a, b], NONE, resolvers, FROM)).toEqual({ version: 5, error: null });
    expect(calls).toBe(1);
  });

  test("-1 means the store lost channels: the full lineup is sent again, once", () => {
    const sync = new LineupSync("s1");
    applyLineupUpdate(() => 1, sync, [a, b], NONE, resolvers, FROM);
    const sent: Update[] = [];
    const answers = [-1, 2];
    const r = applyLineupUpdate((json) => (sent.push(parse(json)), answers.shift()!), sync, [b, a], NONE, resolvers, FROM);
    expect(r).toEqual({ version: 2, error: null });
    expect(sent.length).toBe(2);
    expect(sent[0]!.add).toEqual([]); // the incremental update, refused
    expect(sent[1]!.add.length).toBe(2); // then everything
  });

  test("a store that refuses the full lineup is an error, not a loop", () => {
    const sync = new LineupSync("s1");
    let calls = 0;
    const r = applyLineupUpdate(() => (calls++, -1), sync, [a], NONE, resolvers, FROM);
    expect(r.version).toBe(0);
    expect(r.error).toContain("rejected");
    expect(calls).toBe(2);
  });

  test("never throws: a store, a resolver or a bad channel comes back as an error", () => {
    const boom = applyLineupUpdate(() => { throw new Error("bad json"); }, new LineupSync("s"), [a], NONE, resolvers, FROM);
    expect(boom).toEqual({ version: 0, error: "lineup handover: bad json" });
    const badResolver = { ...resolvers, accent: () => { throw new Error("no accent"); } };
    expect(applyLineupUpdate(() => 1, new LineupSync("s"), [a], NONE, badResolver, FROM).error).toBe("lineup handover: no accent");
    expect(applyLineupUpdate(() => 1, new LineupSync("s"), [null as unknown as GuideGridChannel], NONE, resolvers, FROM).error).toContain("lineup handover");
  });

  test("after a failure the next attempt sends everything", () => {
    const sync = new LineupSync("s1");
    applyLineupUpdate(() => 1, sync, [a, b], NONE, resolvers, FROM);
    applyLineupUpdate(() => { throw new Error("x"); }, sync, [a, b], new Set(["c1"]), resolvers, FROM);
    let json = "";
    applyLineupUpdate((j) => ((json = j), 3), sync, [a, b], NONE, resolvers, FROM);
    expect(parse(json).add.length).toBe(2);
  });
});

describe("keying on the objects useGuide returns", () => {
  // Hypothesis behind LineupSync: TanStack Query's default structural sharing keeps a channel that didn't change identical
  // across the guide's 60 s refetch. This runs the real QueryClient and a QueryObserver (what `useQuery` is built on) the
  // way `useGuide` sets its query up (default options), and reads the data an observer sees.
  const watch = async (payloads: (() => unknown)[]) => {
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } } });
    let n = 0;
    const observer = new QueryObserver(qc, { queryKey: ["guide", 180], queryFn: async () => payloads[Math.min(n++, payloads.length - 1)]!() });
    const off = observer.subscribe(() => {});
    const seen: { channels: GuideGridChannel[] }[] = [];
    for (let i = 0; i < payloads.length; i++) seen.push((await observer.refetch()).data as { channels: GuideGridChannel[] });
    off();
    qc.clear();
    return seen;
  };
  // Each fetch is a fresh parse of the server's JSON, as a real response is.
  const grid = (extra: GuideGridProgram[] = []) => () =>
    JSON.parse(JSON.stringify({ serverTime: iso(0), windowMinutes: 180, channels: [channel("c1"), channel("c2", [prog("c2-1", 0, 30), ...extra]), channel("c3")] })) as unknown;

  test("a refetch keeps unchanged channel objects identical, so only the changed one is resent", async () => {
    const [first, second] = await watch([grid(), grid([prog("c2-2", 30, 30)])]);
    expect(second).not.toBe(first);
    expect(second!.channels[0]).toBe(first!.channels[0]);
    expect(second!.channels[1]).not.toBe(first!.channels[1]);
    expect(second!.channels[2]).toBe(first!.channels[2]);

    const sync = new LineupSync("s1");
    sync.update(first!.channels, NONE, resolvers, FROM);
    sync.accepted(1);
    const u = parse(sync.update(second!.channels, NONE, resolvers, FROM));
    expect(u.add.map(([, ch]) => ch[0])).toEqual(["c2"]); // one channel resent, not three
  });

  test("a refetch with identical content changes nothing at all", async () => {
    const [first, second] = await watch([grid(), grid()]);
    expect(second).toBe(first);
    const sync = new LineupSync("s1");
    sync.update(first!.channels, NONE, resolvers, FROM);
    sync.accepted(1);
    expect(sync.update(second!.channels, NONE, resolvers, FROM)).toBeNull();
  });

  test("a program list that grows or shifts resends only its own channel", async () => {
    const [first, second, third] = await watch([grid(), grid([prog("c2-2", 30, 30)]), grid([prog("c2-2", 30, 30), prog("c2-3", 60, 30)])]);
    const sync = new LineupSync("s1");
    sync.update(first!.channels, NONE, resolvers, FROM);
    sync.accepted(1);
    expect(parse(sync.update(second!.channels, NONE, resolvers, FROM)).add.map(([, ch]) => ch[0])).toEqual(["c2"]);
    sync.accepted(2);
    expect(parse(sync.update(third!.channels, NONE, resolvers, FROM)).add.map(([, ch]) => ch[0])).toEqual(["c2"]);
  });
});

describe("classicFollow", () => {
  // Rows 60 dp tall in a list 240 dp tall (4 rows).
  const at = (off: number, fc: number, h = 240) => classicFollow(off, fc, 60, h);

  test("a row that is fully visible is left alone", () => {
    expect(at(0, 0)).toBeNull();
    expect(at(0, 3)).toBeNull(); // the last of the first screen
    expect(at(120, 5)).toBeNull();
  });

  test("a row above the view goes to the top, one below it to the bottom, and the offset after is what the list will be at", () => {
    expect(at(120, 1)).toEqual({ viewPosition: 0, offset: 60 });
    expect(at(0, 4)).toEqual({ viewPosition: 1, offset: 60 }); // bottom 300 - 240
    expect(at(0, 9)).toEqual({ viewPosition: 1, offset: 360 });
  });

  test("a list that has not been measured yet puts the row at the top and says nothing about the offset", () => {
    expect(at(0, 5, 0)).toEqual({ viewPosition: 0 });
  });

  test("started where classicHandOver put it, a list is never moved by the follow (so the hand-over does not need the follow to be skipped)", () => {
    for (const y of [0, 60, 150, 170, 240, 350, 360]) {
      for (let fc = 0; fc < 10; fc++) {
        for (const h of [240, 250]) {
          const start = classicHandOver({ y: Math.min(y, 10 * 60 - h), h }, fc, 60, 10);
          expect(classicFollow(start.offset, fc, 60, start.listH), `y ${y} fc ${fc} h ${h}`).toBeNull();
        }
      }
    }
  });
});

describe("classicHandOver", () => {
  test("opens the list where classicListStart does and takes it to be as tall as the native view until it measures itself", () => {
    expect(classicHandOver({ y: 120, h: 240 }, 4, 60, 10)).toEqual({ ...classicListStart({ y: 120, h: 240 }, 4, 60, 10), listH: 240 });
    expect(classicHandOver({ y: 0, h: 0 }, 5, 60, 10)).toEqual({ index: 5, offset: 300, listH: 0 }); // never measured: the focused row at the top, no height to go by
  });

  test("the first key press after the hand-over, before the list has measured itself, follows the focus as the native rows did", () => {
    // The native rows are 240 dp tall with row 3 (the last on the screen) focused; the list is not measured yet when "down" is pressed.
    const start = classicHandOver({ y: 0, h: 240 }, 3, 60, 10);
    expect(classicFollow(start.offset, 4, 60, start.listH)).toEqual({ viewPosition: 1, offset: 60 }); // to the bottom: not a jump to the top
    // With no height known, the same press would have put row 4 at the top, a whole screen away.
    expect(classicFollow(start.offset, 4, 60, 0)).toEqual({ viewPosition: 0 });
    // And a press that stays on the screen moves nothing, as in the native rows.
    expect(classicFollow(start.offset, 2, 60, start.listH)).toBeNull();
  });

  test("every first press lands where the native rows' own follow rule puts it", () => {
    for (const y of [0, 60, 120, 180, 360]) {
      for (let fc = 0; fc < 10; fc++) {
        const start = classicHandOver({ y, h: 240 }, fc, 60, 10);
        for (const next of [Math.max(0, fc - 1), Math.min(9, fc + 1)]) {
          const move = classicFollow(start.offset, next, 60, start.listH);
          const after = move ? (move.offset ?? start.offset) : start.offset;
          expect(after, `y ${y} fc ${fc} -> ${next}`).toBe(followScroll(start.offset, next, 60, 240, 10));
        }
      }
    }
  });
});

describe("Handover: one instance's native store", () => {
  const sets: [string, string][] = [];
  const cleared: string[] = [];
  const set = (id: string, json: string) => {
    sets.push([id, json]);
    return sets.length;
  };
  const clear = (id: string) => cleared.push(id);
  const chans = [channel("1"), channel("2")];
  const mk = (id = "x-1") => new Handover(id, "s");
  const send = (h: Handover) => h.apply(set, chans, NONE, resolvers, FROM);

  test("a render that is never committed makes no native store, however often it renders", () => {
    sets.length = 0;
    const h = mk();
    for (let i = 0; i < 5; i++) expect(send(h)).toEqual({ version: 0, error: null });
    expect(sets).toEqual([]);
  });

  test("a committed instance sends its lineup under its own id, and only what changed after that", () => {
    sets.length = 0;
    const h = mk("x-7");
    h.commit();
    const first = send(h);
    expect(first.version).toBe(1);
    expect(sets.map(([id]) => id)).toEqual(["x-7"]);
    expect(send(h).version).toBe(1); // unchanged: nothing more is sent
    expect(sets).toHaveLength(1);
  });

  test("unmounting clears the instance's own store, once", () => {
    cleared.length = 0;
    const h = mk("x-3");
    h.commit();
    h.release(clear);
    h.release(clear); // a second cleanup finds nothing committed
    expect(cleared).toEqual(["x-3"]);
  });

  test("an instance that never committed has nothing to clear", () => {
    cleared.length = 0;
    mk("x-4").release(clear);
    expect(cleared).toEqual([]);
  });

  test("a remount (dev StrictMode's simulated unmount and mount) sends the whole lineup again", () => {
    sets.length = 0;
    cleared.length = 0;
    const h = mk("x-5");
    h.commit();
    send(h);
    h.release(clear);
    expect(send(h)).toEqual({ version: 0, error: null }); // between the two: nothing
    h.commit();
    expect(send(h).version).toBeGreaterThan(0);
    expect(cleared).toEqual(["x-5"]);
    expect(sets).toHaveLength(2);
    expect(JSON.parse(sets[1]![1]).add).toHaveLength(2); // every channel again, not just the order
  });

  test("two instances do not touch each other's store", () => {
    sets.length = 0;
    cleared.length = 0;
    const a = mk("a");
    const b = mk("b");
    a.commit();
    b.commit();
    send(a);
    b.apply(set, [chans[1]!], new Set(["2"]), resolvers, FROM);
    b.release(clear);
    expect(cleared).toEqual(["b"]);
    expect(send(a).version).toBe(1); // a still holds its lineup, and has nothing to resend
  });
});

describe("two guides mounted at once", () => {
  // `router.replace("/guide")` from Settings stacks a second guide and the first stays mounted: each instance has its own LineupSync (and its own
  // native store), so what one sends, or loses, is no business of the other's.
  const all = [channel("1"), channel("2"), channel("3")];

  test("one's lineup, filter and reset never touch the other's", () => {
    const first = new LineupSync("s");
    const second = new LineupSync("s");
    const a = first.update(all, NONE, resolvers, FROM);
    first.accepted(1);
    // The second shows only the favourites and sends its own channels, and the first is still up to date.
    expect(second.update([all[1]!], new Set(["2"]), resolvers, FROM)).not.toBeNull();
    second.accepted(1);
    expect(first.update(all, NONE, resolvers, FROM)).toBeNull();
    // The second is cleared (it unmounted); the first does not resend anything.
    second.reset();
    expect(first.update(all, NONE, resolvers, FROM)).toBeNull();
    expect(second.update([all[1]!], new Set(["2"]), resolvers, FROM)).not.toBeNull();
    expect(JSON.parse(a!).order).toHaveLength(3);
  });
});

describe("GlyphSync", () => {
  test("each icon is sent once", () => {
    const g = new GlyphSync();
    expect(g.missing(["lucide:Radio", "lucide:Tv", "lucide:Radio"])).toEqual(["lucide:Radio", "lucide:Tv"]);
    g.markSent(["lucide:Radio", "lucide:Tv"]);
    expect(g.missing(["lucide:Tv", "lucide:Heart"])).toEqual(["lucide:Heart"]);
    g.reset();
    expect(g.missing(["lucide:Tv"])).toEqual(["lucide:Tv"]);
  });
});

describe("followScroll", () => {
  // 10 rows of 60 dp in a 240 dp view (4 rows fit), so the list scrolls up to 360.
  const f = (off: number, fc: number, viewH = 240, count = 10) => followScroll(off, fc, 60, viewH, count);

  test("leaves the offset alone while the focused row is fully visible", () => {
    expect(f(0, 0)).toBe(0);
    expect(f(0, 3)).toBe(0); // the last fully visible row
    expect(f(120, 4)).toBe(120); // rows 2..5 show
    expect(f(120, 5)).toBe(120);
  });

  test("scrolls down just enough to put the focused row at the bottom", () => {
    expect(f(0, 4)).toBe(60); // row 4 ends at 300; the view ends at 240 -> offset 60
    expect(f(60, 5)).toBe(120);
    expect(f(0, 9)).toBe(360);
  });

  test("scrolls up to put the focused row at the top", () => {
    expect(f(120, 1)).toBe(60);
    expect(f(360, 0)).toBe(0);
  });

  test("a row partly out of view counts as off screen, both ways", () => {
    expect(f(30, 0)).toBe(0);
    expect(f(30, 4)).toBe(60);
  });

  test("never scrolls past the end, and a short list does not scroll", () => {
    expect(f(0, 9, 240, 10)).toBe(360);
    expect(followScroll(0, 2, 60, 240, 3)).toBe(0);
    expect(followScroll(500, 2, 60, 240, 3)).toBe(0);
  });

  test("a view that has not been measured puts the focused row at the top", () => {
    expect(f(0, 5, 0)).toBe(300);
    expect(f(120, 1, 0)).toBe(60);
  });

  test("a lens change that shrinks the list pulls the offset back inside it", () => {
    expect(followScroll(360, 3, 60, 240, 5)).toBe(60); // row 3 is above the old offset: top-aligned, then held inside the shorter list
    expect(clampScroll(360, 60, 240, 5)).toBe(60);
    expect(clampScroll(-10, 60, 240, 5)).toBe(0);
  });
});

describe("classicListStart", () => {
  // Rows 60 dp tall in a view 240 dp tall (4 rows), 10 rows.
  const at = (y: number, fc: number, h = 240, count = 10) => classicListStart({ y, h }, fc, 60, count);

  test("opens on the row the native view had at its top edge, so the rows stay where they were", () => {
    expect(at(120, 4)).toEqual({ index: 2, offset: 120 });
    expect(at(0, 0)).toEqual({ index: 0, offset: 0 });
    expect(at(0, 3)).toEqual({ index: 0, offset: 0 }); // the focused row was on the first screen: nothing moves
  });

  test("an offset between rows opens on the row above its edge, unless that would leave the focused row's bottom off the view", () => {
    expect(at(150, 4)).toEqual({ index: 2, offset: 120 }); // rows 2..5 at 120..360 hold row 4 (240..300)
    // The view is 250 tall and the native rows put the focused row 6 at the bottom (offset 170): row 2 would cut it off, row 3 doesn't.
    expect(at(170, 6, 250)).toEqual({ index: 3, offset: 180 });
  });

  test("the offset is held inside the list: it cannot scroll past its end", () => {
    // 10 rows of 60 in a view 250 tall end at 350, not 360 (row 6's start).
    expect(at(350, 9, 250)).toEqual({ index: 6, offset: 350 });
    expect(at(360, 9, 240)).toEqual({ index: 6, offset: 360 });
    // A focused row far past what fits is brought into view, never past the end.
    expect(at(0, 9)).toEqual({ index: 6, offset: 360 });
  });

  test("a focused row above the native offset (the lens changed it) comes to the top", () => {
    expect(at(240, 1)).toEqual({ index: 1, offset: 60 });
  });

  test("a view that was never measured puts the focused row at the top, and a short or empty list never scrolls", () => {
    expect(at(0, 5, 0)).toEqual({ index: 5, offset: 300 });
    expect(at(0, 2, 240, 3)).toEqual({ index: 0, offset: 0 });
    expect(at(0, 20)).toEqual({ index: 6, offset: 360 }); // the focus is past the end of a list that shrank
    expect(classicListStart({ y: 0, h: 240 }, 3, 60, 0)).toEqual({ index: 0, offset: 0 });
    expect(classicListStart({ y: 0, h: 240 }, 3, 0, 10)).toEqual({ index: 0, offset: 0 });
  });
});

describe("hitRow", () => {
  // Rows 60 dp tall under a 100 dp rail with a 1 dp top rule, a lane 600 dp wide at 3 dp a minute from T, cells 4 dp apart, a 6 dp margin above and below.
  const lane: Lane = { T0: new Date(T), ppm: 3, laneW: 600, gap: 4 };
  const rows = [[prog("a", 0, 30), prog("b", 30, 30), prog("c", 60, 60)], [prog("d", -20, 40)], []];
  const hit = (x: number, y: number, scrollY = 0) =>
    hitRow(x, y, { scrollY, rowPx: 60, railPx: 100, top: 1, inset: 6, lane, programsAt: (r) => rows[r] });

  test("the rail is the first rail-wide strip of a row", () => {
    expect(hit(0, 0)).toEqual({ row: 0, part: "rail" });
    expect(hit(99, 59)).toEqual({ row: 0, part: "rail" });
    expect(hit(50, 60)).toEqual({ row: 1, part: "rail" });
    expect(hit(50, 130)).toEqual({ row: 2, part: "rail" }); // a row with no programs still has its rail
  });

  test("a program is the cell under the tap, counted from the lane's left edge", () => {
    expect(hit(100, 30)).toEqual({ row: 0, part: "program", index: 0 }); // the first cell starts at the lane's edge
    expect(hit(100 + 85, 30)).toEqual({ row: 0, part: "program", index: 0 }); // 90 - 4 wide: last dp is 85
    expect(hit(100 + 90, 30)).toEqual({ row: 0, part: "program", index: 1 });
    expect(hit(100 + 200, 30)).toEqual({ row: 0, part: "program", index: 2 });
    expect(hit(100 + 5, 90)).toEqual({ row: 1, part: "program", index: 0 }); // began before the lane: clamped to start at the gap
  });

  test("nothing under a gap between cells, a row's margin above and below its cells, or past the last cell and row", () => {
    expect(hit(100 + 87, 30)).toBeNull();
    expect(hit(100 + 20, 5)).toBeNull();
    expect(hit(100 + 20, 56)).toBeNull();
    expect(hit(100 + 590, 30)).toBeNull(); // past the last cell's right edge (60..120 min = 180..360, plus the lane's empty end)
    expect(hit(100 + 20, 400)).toBeNull(); // past the last row
    expect(hit(-1, 10)).toBeNull();
    expect(hit(10, -1)).toBeNull();
  });

  test("a cell is where it is drawn: below the row's 1 dp top rule and its margin, down to the margin above the row's end", () => {
    // The lane starts under the rule, so a cell spans y = 1 + 6 = 7 up to 60 - 6 + 1 = 55 inside the row.
    expect(hit(100 + 20, 6)).toBeNull(); // the margin's last row
    expect(hit(100 + 20, 7)).toEqual({ row: 0, part: "program", index: 0 }); // the cell's first row
    expect(hit(100 + 20, 55)).toEqual({ row: 0, part: "program", index: 0 }); // its last
    expect(hit(100 + 20, 56)).toBeNull();
    expect(hit(100 + 20, 60 + 6)).toBeNull(); // the same in the next row
    expect(hit(100 + 20, 60 + 7)).toEqual({ row: 1, part: "program", index: 0 });
  });

  test("the scroll offset moves the rows under the tap", () => {
    expect(hit(100 + 20, 30, 60)).toEqual({ row: 1, part: "program", index: 0 });
    expect(hit(50, 30, 90)).toEqual({ row: 2, part: "rail" }); // 30 + 90 = 120: row 2
  });

  test("a degenerate row height hits nothing", () => {
    expect(hitRow(10, 10, { scrollY: 0, rowPx: 0, railPx: 100, top: 1, inset: 6, lane, programsAt: (r) => rows[r] })).toBeNull();
  });
});
