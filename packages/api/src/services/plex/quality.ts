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
