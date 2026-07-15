import type { PrismaClient } from "@ChannelGuide/db";
import type { GuideMeta } from "../plex/client";
export type ScheduleSummary = {
    channelId: string;
    poolSize: number;
    itemCount: number;
    /** Program slots (itemCount minus bumpers). */
    programCount: number;
    bumperCount: number;
    passes: number;
    poolSeconds: number;
    coveredSeconds: number;
    startsAt: Date;
    endsAt: Date;
};
/**
 * Build the channel's whole lineup fresh from `now` and replace the timeline. Use
 * after the filter/pool changes (it necessarily disturbs what's on now). For a
 * channel that's just running low, prefer {@link extendChannelSchedule}.
 */
export declare function generateChannelSchedule(prisma: PrismaClient, channelId: string, opts?: {
    from?: Date;
    minDurationSeconds?: number;
}): Promise<ScheduleSummary>;
export type ExtendResult = {
    extended: boolean;
    reason?: "empty" | "not-due";
    added: number;
    newEndsAt: Date | null;
};
/**
 * Append a fresh block at the tail when the schedule is running low — the routine,
 * non-disruptive path (leaves what's on now untouched). Returns `{ extended: false }`
 * if there's still plenty of runway, or `reason: "empty"` if there's nothing to
 * extend (call {@link generateChannelSchedule} first). `force` appends regardless.
 */
export declare function extendChannelSchedule(prisma: PrismaClient, channelId: string, opts?: {
    minDurationSeconds?: number;
    thresholdSeconds?: number;
    force?: boolean;
}): Promise<ExtendResult>;
export type RepairResult = {
    repaired: boolean;
    /** Slots removed from the spliced tail. */
    replaced: number;
    /** Fresh slots laid in their place. */
    added: number;
    /** Where the splice began, or null if nothing needed repair. */
    from: Date | null;
};
/**
 * Splice-repair a channel whose upcoming schedule references media that's been
 * removed from the server (`MediaItem.available = false`). Finds the earliest
 * upcoming bad slot (a program pointing at gone media, or a bumper introducing one),
 * then re-flows the timeline **from that point forward** with the current live pool —
 * which no longer contains the removed items. Everything before the splice (what's on
 * now + still-valid near-term slots) is left untouched. Non-disruptive, like extend;
 * does not re-stamp `bumperRev`.
 */
export declare function repairChannelSchedule(prisma: PrismaClient, channelId: string, opts?: {
    now?: Date;
    minDurationSeconds?: number;
}): Promise<RepairResult>;
export type TimelineSlot = {
    id: string;
    kind: "PROGRAM" | "BUMPER";
    bumperKind: string | null;
    ratingKey: string | null;
    startsAt: Date;
    durationSeconds: number;
    /** For a bumper, this is the upcoming program it introduces ("Up Next"). */
    guide: GuideMeta;
};
/** Timeline slots overlapping [from, to) with joined guide metadata, ordered by start. */
export declare function getChannelTimeline(prisma: PrismaClient, channelId: string, from: Date, to: Date): Promise<TimelineSlot[]>;
export type NowNextSlot = {
    kind: "PROGRAM" | "BUMPER";
    bumperKind: string | null;
    ratingKey: string | null;
    startsAt: Date;
    durationSeconds: number;
    guide: GuideMeta;
};
export type NowNext = {
    current: (NowNextSlot & {
        offsetSeconds: number;
    }) | null;
    next: NowNextSlot | null;
    /** When the materialized schedule runs out — null if there's no schedule. */
    endsAt: Date | null;
};
/** "What's on now" (+ the live offset to seek to) and what's next, from materialized rows. */
export declare function getNowNext(prisma: PrismaClient, channelId: string, at?: Date): Promise<NowNext>;
