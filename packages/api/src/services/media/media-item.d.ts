import type { PrismaClient } from "@ChannelGuide/db";
import type { GuideMeta, PlexItem } from "../plex/client";
/** Progress callback shared by the sync services (fed to the job scheduler's progress). */
export type SyncProgress = (p: {
    current: number;
    total: number;
    label: string;
}) => void;
/** Prisma create/update payload for a MediaItem row from a resolved Plex item. */
export declare function toMediaItemData(mediaSourceId: string, item: PlexItem, parentId?: string | null): {
    mediaSourceId: string;
    ratingKey: string;
    type: string;
    title: string;
    durationMs: number;
    year: number | null;
    airDate: string | null;
    parentId: string | null;
    guide: object;
};
/** Merge `over` onto `base`, ignoring `undefined` in `over` so it never wipes an inherited field. */
export declare function mergeGuide(base: GuideMeta, over: GuideMeta): GuideMeta;
type MediaNode = {
    guide: unknown;
    parent?: {
        guide: unknown;
    } | null;
} | null | undefined;
/** How to `include` a slot's metadata: its own item (programs) + its target program
 *  (bumpers introduce the upcoming program), each with its parent show for the merge. */
export declare const mediaItemGuideInclude: {
    readonly mediaItem: {
        readonly select: {
            readonly guide: true;
            readonly parent: {
                readonly select: {
                    readonly guide: true;
                };
            };
        };
    };
    readonly targetMediaItem: {
        readonly select: {
            readonly guide: true;
            readonly parent: {
                readonly select: {
                    readonly guide: true;
                };
            };
        };
    };
};
/**
 * The effective guide bundle for a program slot: the item's own metadata merged over
 * its parent show's. Falls back safely when the media has been unlinked/removed.
 */
export declare function guideMetaOf(row: {
    mediaItem?: MediaNode;
}): GuideMeta;
/** The guide bundle of the program a bumper introduces (its "Up Next" target). */
export declare function guideMetaOfTarget(row: {
    targetMediaItem?: MediaNode;
}): GuideMeta;
/**
 * Ensure a MediaItem exists for every item in a resolved pool (create-only, so a
 * later enrichment sync is never clobbered), linking episodes to their parent show
 * when that show is already cached. Returns a `ratingKey → id` map so schedule slots
 * can reference the rows. This is the gap-fill run at generation time; a full
 * `syncMediaItems` is what actually builds the show hierarchy.
 */
export declare function upsertPoolItems(prisma: PrismaClient, mediaSourceId: string, pool: PlexItem[]): Promise<Map<string, string>>;
export {};
