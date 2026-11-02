import type { PackedChannel, PackedProgram } from "@airwave/native-guide";

import type { GuideGridChannel, GuideGridProgram, GuideMeta } from "@/lib/api";

import { cellBox, type Lane } from "./geometry";

/**
 * The pure half of the native guide rows (native-rows.tsx): handing the lineup to the native store, and the scroll rule.
 * No react-native imports, so `bun test` can load it; what needs the app's layout helpers or icon set comes in as
 * resolvers.
 *
 * On Android TV the guide's channel rows can be drawn by ONE native view (packages/native-guide) instead of a FlashList
 * of React Native rows. JS keeps everything else (the zone machine, keys, the featured panel, the time header, the
 * now marker, the sidebar) and gives the view the lineup once per change, plus a few small props per D-pad move.
 */

/** What packing a channel needs from the app: how to name its icon, build a cell's second line, and pick a row's accent. */
export type LineupResolvers = {
  /** The icon-set id the rail's circle shows for this channel, already resolved (unknown and non-lucide ids -> `lucide:Radio`). */
  icon: (ch: GuideGridChannel) => string;
  /** A cell's second line (season/episode, rating, runtime). */
  sub: (guide: GuideMeta) => string;
  /** A row's accent. It depends on the row's position in the lineup being shown (an untinted channel takes a palette color
   *  by index, and a filter lens changes the index), so it is sent with the order, not with the channel. */
  accent: (ch: GuideGridChannel, index: number) => string;
  /** A program's artwork request URL up to its query (the native side appends the pixel box it needs), or null for none.
   *  Absent while program art is off: nothing is packed, so nothing is fetched. */
  art?: (ch: GuideGridChannel, p: GuideGridProgram) => string | null;
  /** What `art` yields (the server its URLs point at), so channels packed for another art setting or server are packed again.
   *  "" or absent with art off. */
  artKey?: string;
  /** The address a channel's logo is loaded from (already resolved: see `logoSource`), or null for none. Absent while Channel
   *  marks is Icons: no logo is packed, so none is fetched. */
  logo?: (ch: GuideGridChannel) => string | null;
};

/** What a channel is packed with besides its own data: the art resolver, and the channel's logo address. */
export type PackExtras = { art?: LineupResolvers["art"]; logo?: string | null };

/** A value as a string for the packed arrays (the native reader takes strings where it expects strings). */
const str = (v: unknown): string => (v == null ? "" : String(v));

/**
 * Packs one channel for the native store. The native reader is lenient but typed, so everything is coerced here whatever
 * the server sends: a missing title packs as "", a non-integer duration is rounded, a negative or non-finite one
 * becomes 0, and a program whose start doesn't parse is dropped (it has no place on the time axis, and the React Native
 * rows can't place it either). Programs that ended before `fromMs` are left out: the timeline only moves forward, so
 * they are never drawn again. `extras.art`, when program art is on, gives each program's artwork URL, and `extras.logo` is the
 * channel's logo address when Channel marks is Logos (null packs as none).
 */
export function packChannel(ch: GuideGridChannel, icon: string, fromMs: number, sub: LineupResolvers["sub"], extras: PackExtras = {}): PackedChannel {
  const programs: PackedProgram[] = [];
  for (const p of ch.programs ?? []) {
    if (!p) continue;
    const startMs = Date.parse(p.startsAt);
    if (!Number.isFinite(startMs)) continue;
    const durationSeconds = Number.isFinite(p.durationSeconds) ? Math.max(0, Math.round(p.durationSeconds)) : 0;
    if (startMs + durationSeconds * 1000 <= fromMs) continue;
    const g = p.guide ?? ({} as GuideMeta);
    programs.push([str(p.id), startMs, durationSeconds, str(g.showTitle ?? g.title), extras.art?.(ch, p) || null, sub(g)]);
  }
  return [str(ch.id), str(ch.number), str(ch.name), icon, extras.logo || null, programs];
}

type Held = { tok: string; key: string; from: number };

/**
 * Hands the lineup to the native store INCREMENTALLY. Each channel is packed and sent once under a token, after which an
 * update is just the row order with each row's accent and favorite flag; the native side holds exactly the channels of the
 * last order. One LineupSync belongs to one native lineup store (the guide can be mounted twice, and each has its own).
 *
 * Channels are keyed by OBJECT IDENTITY, and the objects must be the raw ones `useGuide` returns: TanStack Query's
 * structural sharing keeps a channel that didn't change identical across the 60 s refetch (tested), so a refetch resends
 * only what changed. (AuroraGrid's own `channels` memo rebuilds every object whenever the lens or timeline changes, so
 * keying on those would resend the whole lineup every minute.) A lens change or a favorite toggle only reorders or
 * re-flags rows: no channel is resent.
 */
export class LineupSync {
  /** Identifies this JS context to the native store (a reload restarts the token numbering). */
  readonly session: string;
  private next = 1;
  private tokens = new WeakMap<object, Held>();
  /** The tokens the native store holds right now (the last update's order). */
  private held = new Set<string>();
  /** The last update's order, accents and favorites, to tell when nothing changed. */
  private last = "";
  private current = 0;

  constructor(session: string) {
    this.session = session;
  }

  /** The version the native store reported for the lineup it holds (0: none yet). */
  get version(): number {
    return this.current;
  }

  /** The native store accepted the last update. */
  accepted(version: number): void {
    this.current = version;
  }

  /**
   * The update for this lineup as a JSON string for `NativeGuide.setLineup`, or null when the native store already holds
   * exactly this lineup (the same channels, order, accents and favorites).
   */
  update(channels: readonly GuideGridChannel[], favs: { has(id: string): boolean }, r: LineupResolvers, fromMs: number): string | null {
    const order: string[] = [];
    const accent: string[] = [];
    const fav: (0 | 1)[] = [];
    const add: [string, PackedChannel][] = [];
    const adding = new Set<string>();
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i]!;
      const icon = r.icon(ch);
      const logo = r.logo?.(ch) ?? null;
      const key = `${icon}|${r.artKey ?? ""}|${logo ?? ""}`;
      let h = this.tokens.get(ch);
      // Repack when what it was packed with changed (the resolved icon, the art setting, the logo), or when the timeline now
      // starts earlier than the programs this was packed from.
      if (!h || h.key !== key || fromMs < h.from) {
        h = { tok: `${this.next++}`, key, from: fromMs };
        this.tokens.set(ch, h);
      }
      if (!this.held.has(h.tok) && !adding.has(h.tok)) {
        adding.add(h.tok);
        add.push([h.tok, packChannel(ch, icon, h.from, r.sub, { art: r.art, logo })]);
      }
      order.push(h.tok);
      accent.push(r.accent(ch, i));
      fav.push(favs.has(ch.id) ? 1 : 0);
    }
    const shape = JSON.stringify([order, accent, fav]);
    this.held = new Set(order);
    if (this.current > 0 && add.length === 0 && shape === this.last) return null;
    this.last = shape;
    return JSON.stringify({ s: this.session, order, accent, fav, add });
  }

  /** The native store was cleared or lost channels it should hold: send everything again next time. */
  reset(): void {
    this.held = new Set();
    this.last = "";
    this.current = 0;
  }
}

/** `applyLineupUpdate`'s result: the lineup version the view should draw, or the error that sends the guide back to the
 *  React Native rows (version 0 then: the view draws nothing until it is swapped out). */
export type LineupApplied = { version: number; error: string | null };

/**
 * Hands `channels` to the native store (`setLineup` is `NativeGuide.setLineup`). Never throws: it runs while React renders
 * (the store has to hold the lineup before the view's next frame), so anything that goes wrong (a resolver, the packing,
 * the native parser) comes back as `error`, for the caller to report AFTER render, instead of crashing the guide. A store
 * that no longer holds channels it should (-1) gets the whole lineup again, once.
 */
export function applyLineupUpdate(
  setLineup: (json: string) => number,
  sync: LineupSync,
  channels: readonly GuideGridChannel[],
  favs: { has(id: string): boolean },
  r: LineupResolvers,
  fromMs: number,
): LineupApplied {
  try {
    const json = sync.update(channels, favs, r, fromMs);
    if (json === null) return { version: sync.version, error: null };
    const v = setLineup(json);
    if (v >= 0) {
      sync.accepted(v);
      return { version: v, error: null };
    }
    sync.reset();
    const again = setLineup(sync.update(channels, favs, r, fromMs)!);
    if (again >= 0) {
      sync.accepted(again);
      return { version: again, error: null };
    }
    sync.reset();
    return { version: 0, error: "lineup handover: the native store rejected the full lineup" };
  } catch (e) {
    // The store may hold any part of it now: the next attempt sends everything.
    sync.reset();
    return { version: 0, error: `lineup handover: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Which icons the native store has been sent, so each is sent once. The icons themselves come from the app's lucide set. */
export class GlyphSync {
  private sent = new Set<string>();

  /** The ids (deduplicated) the store hasn't been given yet. */
  missing(ids: Iterable<string>): string[] {
    const out = new Set<string>();
    for (const id of ids) if (!this.sent.has(id)) out.add(id);
    return [...out];
  }

  /** Records `ids` as given to the native store. */
  markSent(ids: Iterable<string>): void {
    for (const id of ids) this.sent.add(id);
  }

  /** Forgets what was sent (the native module was swapped out), so everything is sent again. */
  reset(): void {
    this.sent = new Set();
  }
}

/**
 * The list's scroll offset after focus lands on row `fc`, for rows `rowH` tall in a view `viewH` tall (all dp). The rule the
 * React Native list follows: scroll only when the focused row would be off screen, up to put it at the top or down to put
 * it at the bottom, never past the end. `viewH` 0 (not measured yet) puts the focused row at the top.
 */
export function followScroll(off: number, fc: number, rowH: number, viewH: number, count: number): number {
  const top = fc * rowH;
  const bottom = top + rowH;
  let y = off;
  if (viewH <= 0 || top < off) y = top;
  else if (bottom > off + viewH) y = bottom - viewH;
  return clampScroll(y, rowH, viewH, count);
}

/** `off` held inside the list: no further than its end sits at the bottom of the view, and a short list doesn't scroll. */
export function clampScroll(off: number, rowH: number, viewH: number, count: number): number {
  const max = Math.max(0, count * rowH - Math.max(0, viewH));
  return Math.max(0, Math.min(off, max));
}

/**
 * One `NativeRows` instance's side of the lineup hand-over: the id of its native store, and what it has sent there. A guide screen can be mounted
 * twice, so each instance has its own.
 *
 * Nothing is sent, and so no native store is made, until the instance has COMMITTED (`commit`, from its layout effect): React can render a component
 * and throw the render away before it commits (a render that suspends, a transition that is dropped, a dev StrictMode double render), and a store
 * made by such a render would belong to an id no mounted view and no cleanup will ever name. After the first commit every render of it is for a
 * mounted instance, whose cleanup (`release`) clears its store.
 */
export class Handover {
  readonly sync: LineupSync;
  private committed = false;

  constructor(
    readonly id: string,
    session: string,
  ) {
    this.sync = new LineupSync(session);
  }

  /** The instance committed: from now on it holds a native store. (The caller renders again to send the lineup.) */
  commit(): void {
    this.committed = true;
  }

  /** The lineup for this instance as `applyLineupUpdate` hands it over, or nothing (version 0) before the instance has committed. */
  apply(
    setLineup: (id: string, json: string) => number,
    channels: readonly GuideGridChannel[],
    favs: { has(id: string): boolean },
    r: LineupResolvers,
    fromMs: number,
  ): LineupApplied {
    if (!this.committed) return { version: 0, error: null };
    return applyLineupUpdate((json) => setLineup(this.id, json), this.sync, channels, favs, r, fromMs);
  }

  /** The instance unmounted (or a dev remount's simulated unmount): its native store is cleared, and a later `commit` starts from nothing. */
  release(clearLineup: (id: string) => void): void {
    if (this.committed) clearLineup(this.id);
    this.sync.reset();
    this.committed = false;
  }
}

/** The native rows' scroll as they are drawn: the offset JS gave the view, and the view's height (dp). `h` is 0 until the view has been measured. */
export type NativeScroll = { y: number; h: number };

/**
 * Where the React Native list opens when the guide falls back to it from the native rows (an error, or the setting changed): at the place
 * the native rows were. The list can only start on a row, so it starts on the row the native view had at (or just above) its top edge,
 * moved up to the focused row if that was above it and down until the focused row's bottom is inside the view: the focused row stays on
 * screen, where it was or very near. `offset` is where the list will really be, held inside the list (it cannot scroll past its end), which
 * is what the list's follow-the-focus rule needs to start from. A view that was never measured puts the focused row at the top.
 */
export function classicListStart(native: NativeScroll, fc: number, rowH: number, count: number): { index: number; offset: number } {
  if (!(rowH > 0) || count <= 0) return { index: 0, offset: 0 };
  const focus = Math.max(0, Math.min(fc, count - 1));
  const h = native.h;
  if (!(h > 0)) return { index: focus, offset: focus * rowH };
  const off = clampScroll(native.y, rowH, h, count);
  let index = Math.floor(off / rowH + 1e-9);
  index = Math.min(index, focus);
  index = Math.max(index, Math.ceil(((focus + 1) * rowH - h) / rowH - 1e-9), 0);
  index = Math.min(index, count - 1);
  return { index, offset: clampScroll(index * rowH, rowH, h, count) };
}

/**
 * What the guide hands the React Native list when it falls back to it from the native rows: where it opens (`classicListStart`) and the height to
 * take it to be until it has measured itself, which is the native view's (they fill the same area). The list reports its own height only after its
 * first frame (`onLayout`), and a key press can come before that: with no height at all the follow rule (`classicFollow`) would put the focused row
 * at the top, however near it was. `listH` is 0 only when the native view was never measured either (then the list opens with the focused row at
 * the top, which is where that rule would put it).
 */
export function classicHandOver(native: NativeScroll, fc: number, rowH: number, count: number): { index: number; offset: number; listH: number } {
  return { ...classicListStart(native, fc, rowH, count), listH: native.h > 0 ? native.h : 0 };
}

/**
 * What the React Native list has to do to keep the focused row `fc` on screen, for rows `rowH` tall in a list `listH` tall that is scrolled to `off`
 * (all dp): nothing (null) when the row is fully visible, else scroll it to the top (`viewPosition` 0) or the bottom (1), with the offset the list will
 * be at afterwards (none when the list has not been measured yet: then it is put at the top and the offset is learned from its next scroll). The same
 * rule as `followScroll`, as an instruction to the list. Starting from where `classicHandOver` put the list it never moves it.
 */
export function classicFollow(off: number, fc: number, rowH: number, listH: number): { viewPosition: 0 | 1; offset?: number } | null {
  const top = fc * rowH;
  const bottom = top + rowH;
  if (listH <= 0) return { viewPosition: 0 };
  if (top < off) return { viewPosition: 0, offset: top };
  if (bottom > off + listH) return { viewPosition: 1, offset: Math.max(0, bottom - listH) };
  return null;
}

/** What a tap on the native rows landed on: a row's rail, or one of its programs (its index among the programs the row draws). */
export type RowHit = { row: number; part: "rail" } | { row: number; part: "program"; index: number };

/**
 * What a tap at (`x`, `y`), in dp from the rows view's top left corner, lands on: the rail of the row under it, a program's cell, or
 * nothing (the gap between cells, a row's margin above and below its cells, past the last row). The same places the React Native rows'
 * Pressables take a tap, from the same arithmetic (`cellBox`), so a tap means the same in both renderers. `programsAt(row)` gives the
 * programs that row draws, in the order the zone machine counts them (the list the per-channel filter keeps), or undefined past the
 * last row; `top` is the row's top rule, which the lane (and so every cell) sits below, `inset` the margin above and below a cell, `scrollY` how far
 * the list is scrolled.
 */
export function hitRow(
  x: number,
  y: number,
  o: { scrollY: number; rowPx: number; railPx: number; top: number; inset: number; lane: Lane; programsAt: (row: number) => readonly Pick<GuideGridProgram, "startsAt" | "durationSeconds">[] | undefined },
): RowHit | null {
  if (!(o.rowPx > 0) || x < 0 || y < 0) return null;
  const down = y + o.scrollY;
  const row = Math.floor(down / o.rowPx);
  const programs = o.programsAt(row);
  if (!programs) return null;
  if (x < o.railPx) return { row, part: "rail" };
  const within = down - row * o.rowPx;
  // The cell is placed `inset` below the lane's top, which is `top` below the row's: it spans `top + inset` to `rowPx - inset + top`.
  if (within < o.top + o.inset || within > o.rowPx - o.inset + o.top) return null;
  const lx = x - o.railPx;
  for (let index = 0; index < programs.length; index++) {
    const box = cellBox(programs[index]!, o.lane);
    if (box && lx >= box.left && lx < box.left + box.width) return { row, part: "program", index };
  }
  return null;
}
