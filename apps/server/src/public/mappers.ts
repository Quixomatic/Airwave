/**
 * Map internal schedule/guide slot shapes → the public Program / NowSlot DTOs. Kept in one place so every
 * endpoint that returns programs (now/next, schedule, guide) presents them identically.
 */
import { buildArtworkUrl } from "./dtos";

type GuideLike = {
  title?: string;
  type?: string;
  showTitle?: string;
  showRatingKey?: string; // grandparentRatingKey — the parent show, whose poster we use for an episode
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

/**
 * @param channelId  the channel the slot belongs to — needed to build the artwork proxy URL (the proxy resolves
 *                   the Plex source/token from the channel). Omit for slots with no channel (artwork is null).
 */
export function toProgram(slot: SlotLike, channelId?: string | null) {
  const start = slot.startsAt instanceof Date ? slot.startsAt : new Date(slot.startsAt);
  const end = new Date(start.getTime() + slot.durationSeconds * 1000);
  const g = slot.guide ?? {};
  // The portrait POSTER: the show's key for an episode, else the item itself. Same choice the admin makes.
  const posterKey = g.showRatingKey ?? slot.ratingKey ?? null;
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
    artworkUrl: buildArtworkUrl(channelId, posterKey, "poster"),
  };
}

export function toNowSlot(slot: SlotLike, channelId?: string | null, offsetSeconds?: number) {
  return {
    ...toProgram(slot, channelId),
    kind: (slot.kind === "BUMPER" ? "bumper" : "program") as "program" | "bumper",
    ...(offsetSeconds != null ? { offsetSeconds } : {}),
  };
}
