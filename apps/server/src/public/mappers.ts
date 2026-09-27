/**
 * Map internal schedule/guide slot shapes → the public Program / NowSlot DTOs. Kept in one place so every
 * endpoint that returns programs (now/next, schedule, guide) presents them identically.
 */

type GuideLike = {
  title?: string;
  type?: string;
  showTitle?: string;
  season?: number;
  episode?: number;
  year?: number;
  summary?: string;
  thumb?: string;
} | null | undefined;

type SlotLike = {
  kind?: string;
  ratingKey?: string | null;
  startsAt: Date | string;
  durationSeconds: number;
  guide?: GuideLike;
};

export function toProgram(slot: SlotLike) {
  const start = slot.startsAt instanceof Date ? slot.startsAt : new Date(slot.startsAt);
  const end = new Date(start.getTime() + slot.durationSeconds * 1000);
  const g = slot.guide ?? {};
  return {
    ratingKey: slot.ratingKey ?? null,
    title: g.title ?? "Unavailable",
    type: g.type ?? null,
    showTitle: g.showTitle ?? null,
    season: g.season ?? null,
    episode: g.episode ?? null,
    year: g.year ?? null,
    summary: g.summary ?? null,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    durationSeconds: slot.durationSeconds,
    artworkPath: g.thumb ?? null,
  };
}

export function toNowSlot(slot: SlotLike, offsetSeconds?: number) {
  return {
    ...toProgram(slot),
    kind: (slot.kind === "BUMPER" ? "bumper" : "program") as "program" | "bumper",
    ...(offsetSeconds != null ? { offsetSeconds } : {}),
  };
}
