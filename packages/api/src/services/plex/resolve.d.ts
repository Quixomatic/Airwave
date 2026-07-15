import type { PrismaClient } from "@ChannelGuide/db";
import { type PlexItem } from "./client";
import { type FilterNode } from "./filter-fields";
export type ResolveSource = {
    id: string;
    baseUrl: string;
    token: string;
};
/**
 * Resolve a candidate pool for a raw predicate tree across the source's enabled
 * libraries of the chosen content type(s). Movies query type=1; TV resolves to
 * episodes (type=4) via Plex's dotted advanced-filter syntax. De-duped by ratingKey.
 * Used by both channel resolution and the auto-lineup analyzer.
 */
export declare function resolveFilter(prisma: PrismaClient, source: ResolveSource, mediaTypes: string[], tree: FilterNode | undefined, sort: string): Promise<PlexItem[]>;
/**
 * Resolve a channel's candidate pool — loads its definition and delegates to
 * {@link resolveFilter}.
 */
export declare function resolveChannel(prisma: PrismaClient, channelId: string): Promise<PlexItem[]>;
