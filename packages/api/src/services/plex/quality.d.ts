/**
 * Plex-style streaming quality ladder — the same set of presets the Plex apps expose
 * under "Quality" (max bitrate + a resolution cap). Selecting a preset forces a
 * transcode capped to those limits; "original" leaves playback uncapped (direct-play
 * when the file is browser-friendly). Mirrors Plex's own bitrate ladder.
 */
export type QualityPreset = {
    id: string;
    label: string;
    /** Max video bitrate in kbps. 0 = original / uncapped. */
    maxBitrate: number;
    /** Resolution cap (pixels). 0 = source. */
    width: number;
    height: number;
    /** Plex `videoQuality` index (0–100). */
    videoQuality: number;
};
export declare const QUALITY_PRESETS: QualityPreset[];
export declare function qualityPreset(id: string | undefined): QualityPreset | undefined;
/** Transcode params for a preset, or null for original/unknown (no cap). */
export declare function qualityParams(id: string | undefined): {
    maxVideoBitrate: string;
    videoResolution: string;
    videoQuality: string;
} | null;
/**
 * A minimal browser client capability profile (`X-Plex-Client-Profile-Extra`): declare
 * we can direct-play MP4/H.264/AAC and want HLS/MPEG-TS H.264/AAC when transcoding —
 * the same shape the Plex web client sends, so Plex makes a sensible decision. Applied
 * only when a quality cap is selected (the uncapped path stays as-is).
 */
export declare const BROWSER_CLIENT_PROFILE: string;
/** What a specific client (a real TV) can actually decode — from its probe report. */
export type ClientCaps = {
    /** Video codecs the client can decode (e.g. ["h264","hevc","av1","vp9"]). */
    videoCodecs: string[];
    /** Audio codecs the client can decode (e.g. ["aac","ac3","eac3","flac"]). */
    audioCodecs: string[];
    /** Containers the client can direct-play as a raw file (e.g. ["mp4"]). */
    directContainers: string[];
};
/**
 * Build the profile for a given delivery protocol:
 * - **http** = a PROGRESSIVE transcode played by the NATIVE `<video>` element → the
 *   full native audio set is safe (no MSE remux), so Plex can COPY the audio.
 * - **hls** = played through hls.js/MSE (last resort) → only MSE-safe audio survives
 *   the SourceBuffer append (E-AC3/DTS/TrueHD throw `bufferAddCodecError`), so the
 *   transcode target advertises only {aac,opus,mp3} and Plex transcodes the rest → aac.
 * The direct-play target always carries the full native set (raw-file direct-play uses
 * the native decoder). See [[project-tv-playback-protocol]].
 */
export declare function clientProfileExtra(caps: ClientCaps, protocol?: "hls" | "http", httpContainer?: string): string;
/**
 * A container the native `<video>` can play WHILE Plex is still transcoding (streamable —
 * no front moov atom) AND that this panel natively decodes. `mp4`/`mov` can't stream live.
 * Returns null when the panel has no such container → the progressive-http rung can't work,
 * so the caller falls back to hls.js/MSE. mkv preferred (carries any codec); mpegts next.
 */
export declare function progressiveContainer(caps: ClientCaps): string | null;
