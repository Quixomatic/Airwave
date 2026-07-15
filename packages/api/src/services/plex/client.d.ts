/**
 * Minimal Plex.tv API client for the "Sign in with Plex" + server-discovery
 * flow (the same handshake Overseerr uses). All calls send the invented
 * `X-Plex-*` headers; the token, when present, authenticates as the user.
 */
import { type ClientCaps } from "./quality";
export declare function plexHeaders(clientId: string, token?: string): Record<string, string>;
/** Create an OAuth "pin" (id + code) to begin the sign-in handshake. */
export declare function createPin(clientId: string): Promise<{
    id: number;
    code: string;
}>;
/** The hosted auth page the user is sent to (in a popup) to approve. */
export declare function buildAuthUrl(clientId: string, code: string, forwardUrl?: string): string;
/** Poll the pin; returns the auth token once the user has approved, else null. */
export declare function getPinToken(clientId: string, id: number): Promise<string | null>;
export type PlexUser = {
    id: number;
    uuid: string;
    email: string;
    username: string;
    thumb?: string;
};
/** The Plex account behind a token (email is what we match ChannelGuide accounts by). */
export declare function getPlexUser(clientId: string, token: string): Promise<PlexUser>;
export type PlexConnection = {
    uri: string;
    address: string;
    port: number;
    protocol: string;
    local: boolean;
    relay: boolean;
};
export type PlexServer = {
    name: string;
    clientIdentifier: string;
    owned: boolean;
    connections: PlexConnection[];
};
/** The Plex Media Servers this token can reach (owned + shared). */
export declare function getServers(clientId: string, token: string): Promise<PlexServer[]>;
export type PlexSharedUser = {
    plexId: string;
    email: string | null;
    username: string;
    thumb?: string;
};
/**
 * The users the owner has shared this specific server with. Uses the classic
 * `plex.tv/api/users` XML endpoint (same as Overseerr/Tautulli): each <User> has
 * nested <Server> elements listing the servers they can reach — filter by ours.
 */
export declare function getSharedUsers(clientId: string, token: string, machineIdentifier: string): Promise<PlexSharedUser[]>;
export type PlexLibrary = {
    key: string;
    title: string;
    type: string;
};
/** The libraries (sections) on the connected server. */
export declare function getLibraries(baseUrl: string, token: string): Promise<PlexLibrary[]>;
export type PlexTag = {
    id: string;
    title: string;
};
/** The genres available in a section (for building genre filters). */
export declare function getSectionGenres(baseUrl: string, token: string, sectionKey: string): Promise<PlexTag[]>;
/**
 * The denormalized display bundle stored on each schedule slot (`guideData`) — what a
 * guide/preview renders without a second round-trip to the media server.
 */
export type GuideMeta = {
    title: string;
    type?: string;
    year?: number;
    contentRating?: string;
    summary?: string;
    tagline?: string;
    studio?: string;
    directors?: string[];
    genres?: string[];
    cast?: string[];
    audienceRating?: number;
    criticRating?: number;
    durationMs?: number;
    thumb?: string;
    art?: string;
    resolution?: string;
    audioChannels?: number;
    showTitle?: string;
    showRatingKey?: string;
    season?: number;
    episode?: number;
};
export type PlexItem = {
    ratingKey: string;
    title: string;
    durationMs: number;
    year?: number;
    originallyAvailableAt?: string;
    /** Full denormalized metadata for the guide. */
    guide: GuideMeta;
};
export type SectionQuery = {
    type: 1 | 2 | 4;
    genreId?: string;
    unwatched?: boolean;
    sort?: string;
    limit?: number;
};
/** Resolve a section's items against a filter — the channel candidate pool. */
export declare function getSectionItems(baseUrl: string, token: string, sectionKey: string, q: SectionQuery): Promise<PlexItem[]>;
/**
 * Filtered query with raw Plex filter params (`field=value`, `year>=1990`, …).
 * Operators are sent literally; only values should be pre-encoded by the caller.
 */
export declare function getSectionItemsRaw(baseUrl: string, token: string, sectionKey: string, type: 1 | 2 | 4, filterParams: string[], sort?: string, limit?: number): Promise<PlexItem[]>;
/** Every item of a given type in a section, paged through in full — for metadata sync. */
export declare function getAllSectionItems(baseUrl: string, token: string, sectionKey: string, type: 1 | 2 | 4): Promise<PlexItem[]>;
/** The most-recently-added items of a type in a section (for the incremental scan). */
export declare function getRecentlyAdded(baseUrl: string, token: string, sectionKey: string, type: 1 | 2 | 4, limit?: number): Promise<PlexItem[]>;
/** Full metadata for a single item by ratingKey (e.g. to backfill a missing parent show). */
export declare function getMetadata(baseUrl: string, token: string, ratingKey: string): Promise<PlexItem | null>;
/**
 * How a client should play an item. `direct` streams the original file (the browser
 * seeks via `currentTime`); `hls` uses Plex's transcode-universal endpoint, which
 * applies the start `offset` server-side. Codec fields are for diagnostics.
 */
/** An available audio or subtitle track, keyed by language so it carries across episodes. */
export type PlaybackTrack = {
    lang: string;
    label: string;
};
export type PlaybackInfo = {
    /** `direct` = raw file, native `<video>`, client seeks to the offset.
     *  `http`   = progressive transcode, native `<video>`, offset baked in server-side.
     *  `hls`    = hls.js/MSE transcode — the true last resort (only when native fails). */
    mode: "direct" | "http" | "hls";
    url: string;
    /** The Plex transcode session id (hls only) — pass to {@link stopTranscode} on teardown. */
    session: string | null;
    container?: string;
    videoCodec?: string;
    audioCodec?: string;
    /** Distinct audio / subtitle languages available on this item (for the pickers). */
    audioTracks: PlaybackTrack[];
    subtitleTracks: PlaybackTrack[];
    /** What Plex's /decision actually chose (hls only) — for the debug overlay. */
    decision?: {
        videoDecision?: string;
        audioDecision?: string;
        videoCodec?: string;
        audioCodec?: string;
        container?: string;
    };
};
/** Options that steer the transcode decision (any set → force a transcode). */
export type PlaybackOptions = {
    quality?: string;
    /** Preferred audio language (`languageCode`, e.g. "jpn"/"eng"). */
    audioLang?: string;
    /** Preferred subtitle language, or "off"/undefined for none. */
    subtitleLang?: string;
    /** The real client's decode capabilities (a TV) — drives direct-play/direct-stream
     * vs transcode + the Plex profile. Absent → the built-in browser assumption. */
    caps?: ClientCaps;
    /** Force the hls.js/MSE path (skip raw-file direct-play AND progressive-http). The
     * client sets this only after a NATIVE attempt errored at runtime — the last-resort
     * rung of the native-first ladder. */
    forceHls?: boolean;
};
/**
 * Resolve a playable URL for `ratingKey` at `offsetSeconds`, using the owner token.
 * Browser-friendly files direct-play (the client seeks to the offset); everything else
 * goes through Plex's HLS transcoder with the offset baked in. Returns null if the item
 * has no playable part.
 */
export declare function getPlaybackInfo(baseUrl: string, token: string, clientId: string, ratingKey: string, offsetSeconds: number, opts?: PlaybackOptions): Promise<PlaybackInfo | null>;
/** Stop a Plex transcode session (so behind-the-scenes transcodes don't pile up). */
export declare function stopTranscode(baseUrl: string, token: string, clientId: string, session: string): Promise<void>;
/** Available values for a tag filter field (genre/studio/director/actor/…). */
export declare function getFilterValues(baseUrl: string, token: string, sectionKey: string, field: string): Promise<PlexTag[]>;
