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

export const QUALITY_PRESETS: QualityPreset[] = [
  { id: "original", label: "Original", maxBitrate: 0, width: 0, height: 0, videoQuality: 100 },
  { id: "20mbps-1080p", label: "20 Mbps 1080p", maxBitrate: 20000, width: 1920, height: 1080, videoQuality: 100 },
  { id: "12mbps-1080p", label: "12 Mbps 1080p", maxBitrate: 12000, width: 1920, height: 1080, videoQuality: 90 },
  { id: "10mbps-1080p", label: "10 Mbps 1080p", maxBitrate: 10000, width: 1920, height: 1080, videoQuality: 80 },
  { id: "8mbps-1080p", label: "8 Mbps 1080p", maxBitrate: 8000, width: 1920, height: 1080, videoQuality: 75 },
  { id: "4mbps-720p", label: "4 Mbps 720p", maxBitrate: 4000, width: 1280, height: 720, videoQuality: 60 },
  { id: "3mbps-720p", label: "3 Mbps 720p", maxBitrate: 3000, width: 1280, height: 720, videoQuality: 50 },
  { id: "2mbps-720p", label: "2 Mbps 720p", maxBitrate: 2000, width: 1280, height: 720, videoQuality: 40 },
  { id: "1500kbps-480p", label: "1.5 Mbps 480p", maxBitrate: 1500, width: 720, height: 480, videoQuality: 30 },
  { id: "720kbps-328p", label: "720 Kbps 328p", maxBitrate: 720, width: 576, height: 320, videoQuality: 20 },
  { id: "320kbps-240p", label: "320 Kbps 240p", maxBitrate: 320, width: 426, height: 240, videoQuality: 10 },
];

export function qualityPreset(id: string | undefined): QualityPreset | undefined {
  if (!id) return undefined;
  return QUALITY_PRESETS.find((q) => q.id === id);
}

/** Transcode params for a preset, or null for original/unknown (no cap). */
export function qualityParams(
  id: string | undefined,
): { maxVideoBitrate: string; videoResolution: string; videoQuality: string } | null {
  const p = qualityPreset(id);
  if (!p || p.maxBitrate === 0) return null;
  return {
    maxVideoBitrate: String(p.maxBitrate),
    videoResolution: `${p.width}x${p.height}`,
    videoQuality: String(p.videoQuality),
  };
}

/**
 * A minimal browser client capability profile (`X-Plex-Client-Profile-Extra`): declare
 * we can direct-play MP4/H.264/AAC and want HLS/MPEG-TS H.264/AAC when transcoding —
 * the same shape the Plex web client sends, so Plex makes a sensible decision. Applied
 * only when a quality cap is selected (the uncapped path stays as-is).
 */
export const BROWSER_CLIENT_PROFILE = [
  "add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac)",
  "add-direct-play-target(type=videoProfile&container=mp4&videoCodec=h264&audioCodec=aac)",
  "add-limitation(scope=videoCodec&scopeName=h264&type=upperBound&name=video.level&value=51&isRequired=false)",
].join("+");

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
 * Build an `X-Plex-Client-Profile-Extra` from a client's real codec capabilities.
 * The critical bit is `protocol=hls&container=mp4`: it tells Plex to package HLS as
 * **fMP4/CMAF**, not MPEG-TS. HEVC in MPEG-TS is undecodable by MSE (the "could not
 * be decoded" error on the C2); HEVC in fMP4 plays. Listing the client's codecs in
 * the target means Plex **copies** them (direct-stream, no re-encode → HDR preserved)
 * rather than transcoding. See .docs/plex-profiles.md + [[project-tv-playback-protocol]].
 */
/**
 * Audio codecs that survive the hls.js/MSE remux+SourceBuffer path. AC3/E-AC3/
 * DTS/TrueHD do NOT — even when `canPlayType` says "probably" (that reflects the
 * panel's *native* decoder, used for raw-file direct-play), hls.js throws
 * `bufferAddCodecError` trying to append them. So we let those direct-play but
 * force a transcode (→ aac) on the HLS path. Proven from the playback log.
 */
const MSE_SAFE_AUDIO = new Set(["aac", "opus", "mp3"]);

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
export function clientProfileExtra(
  caps: ClientCaps,
  protocol: "hls" | "http" = "http",
  httpContainer = "mkv",
): string {
  const v = caps.videoCodecs.join(",");
  const aDirect = caps.audioCodecs.join(","); // native player: full set
  const safe = caps.audioCodecs.filter((c) => MSE_SAFE_AUDIO.has(c));
  const aTrans = protocol === "hls" ? (safe.length ? safe : ["aac"]).join(",") : aDirect;
  // hls always packages as fMP4/CMAF (container=mp4). http = a PROGRESSIVE transcode played
  // by the native <video>: it MUST be a streamable-while-growing container (mkv/mpegts), not
  // mp4 — a live mp4 has no front moov atom, so the native element gets an unplayable stub
  // (~89 bytes) and shows black. See progressiveContainer() + [[project-tv-playback-protocol]].
  const transContainer = protocol === "hls" ? "mp4" : httpContainer;
  return [
    `add-transcode-target(type=videoProfile&context=streaming&protocol=${protocol}&container=${transContainer}&videoCodec=${v}&audioCodec=${aTrans})`,
    `add-direct-play-target(type=videoProfile&container=mp4&videoCodec=${v}&audioCodec=${aDirect})`,
  ].join("+");
}

/**
 * A container the native `<video>` can play WHILE Plex is still transcoding (streamable —
 * no front moov atom) AND that this panel natively decodes. `mp4`/`mov` can't stream live.
 * Returns null when the panel has no such container → the progressive-http rung can't work,
 * so the caller falls back to hls.js/MSE. mkv preferred (carries any codec); mpegts next.
 */
export function progressiveContainer(caps: ClientCaps): string | null {
  const c = caps.directContainers;
  if (c.includes("mkv")) return "mkv";
  if (c.includes("mpegts") || c.includes("ts")) return "mpegts";
  return null;
}
