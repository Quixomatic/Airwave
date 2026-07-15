import { type BumperPlan } from "../bumpers/bumper-config";
import type { PlexItem } from "../plex/client";
export type OrderingStrategy = "SHUFFLE" | "IN_ORDER" | "BY_AIR_DATE";
/** The break plan woven between programs (null = no bumpers on this channel). The
 *  interstitial length is chosen per transition — see {@link breakSeconds}. */
export type TimelineBumperPlan = BumperPlan;
/** One materialized slot on a channel's timeline. Display metadata is joined via MediaItem. */
export type TimelineEntry = {
    kind: "PROGRAM" | "BUMPER";
    /** The media to play. Null for interstitial bumpers (the client renders them). */
    ratingKey: string | null;
    /** For a bumper: which kind ("interstitial"). Null for programs. */
    bumperKind: string | null;
    /** For a bumper: the ratingKey of the upcoming program it introduces. */
    targetRatingKey: string | null;
    startsAt: Date;
    durationSeconds: number;
    startOffsetSeconds: number;
};
export type BuildResult = {
    entries: TimelineEntry[];
    /** How many full passes of the pool were laid down. */
    passes: number;
    /** Duration of one full pass of the pool (seconds), programs only. */
    poolSeconds: number;
    /** Total scheduled duration produced (seconds), including bumpers. */
    coveredSeconds: number;
    /** How many interstitial/bumper slots were woven in. */
    bumperCount: number;
};
/**
 * Lay out a channel's lineup back-to-back from `startAt`. Always produces at least
 * one **full pass** of the pool (so every item is scheduled), then keeps appending
 * whole passes — each reshuffled for SHUFFLE channels — until it has covered
 * `minDurationSeconds`. So a 20-day movie pool yields one 20-day pass; a 3-hour pool
 * loops until it fills the floor. Absolute `startsAt` times come from `startAt`.
 *
 * When `bumper` is set, an interstitial break is woven in **before each program**
 * (except the very first slot of the build, so a mid-stream tune-in isn't preceded
 * by a break) — the interstitial targets the program that follows it.
 */
export declare function buildSchedule(pool: PlexItem[], ordering: OrderingStrategy, seed: number, startAt: Date, minDurationSeconds: number, bumper?: TimelineBumperPlan | null): BuildResult;
