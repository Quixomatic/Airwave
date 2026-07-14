import type { PrismaClient } from "@ChannelGuide/db";

import type { ClientCaps } from "../plex/quality";
import { CAP_MATRIX } from "./matrix";

/**
 * Turn a device's MEASURED capability-diagnostic results into the native-decode
 * profile that drives Plex's direct-play/transcode decision — replacing the
 * canPlayType guesses (which lie on TVs). A codec/container counts as supported
 * iff some clip that ACTUALLY decoded on the panel contains it; a codec that only
 * ever appears in failing clips is never credited. Returns null when the device
 * hasn't run the diagnostic yet (caller falls back to the client-reported guess).
 *
 * This is the payoff of the onboarding diagnostic: the profile we hand Plex is
 * the panel's real native set, so direct-play covers the whole real-world library
 * (HEVC/MKV/E-AC3/DTS/TrueHD) and hls.js/MSE stays a true last resort.
 * See [[project-tv-playback-protocol]].
 */

const BY_ID = new Map(CAP_MATRIX.map((t) => [t.id, t]));

// Matrix video key → Plex `videoCodec` token. `null` = a variant that must NOT
// credit base support (Hi10P is a distinct capability the C2 fails, so passing
// `h264_10` shouldn't imply plain h264 — and plain h264 shouldn't imply Hi10P).
const VIDEO_TOKEN: Record<string, string | null> = {
  h264: "h264",
  h264_10: null,
  hevc: "hevc",
  hevc_10: "hevc", // if 10-bit HEVC decodes, 8-bit does too
  av1: "av1",
  vp9: "vp9",
  mpeg2: "mpeg2video",
  mpeg4: "mpeg4",
};

// Matrix audio key → Plex `audioCodec` token. Un-generatable realSample variants
// (dts-hd-ma / eac3-atmos / truehd-atmos) never decode → intentionally absent.
const AUDIO_TOKEN: Record<string, string> = {
  aac: "aac",
  ac3: "ac3",
  eac3: "eac3",
  dts: "dts",
  truehd: "truehd",
  flac: "flac",
  alac: "alac",
  opus: "opus",
  vorbis: "vorbis",
  mp3: "mp3",
  pcm: "pcm",
};

// Matrix container (output extension) → Plex `container` tokens (Media.container).
const CONTAINER_TOKENS: Record<string, string[]> = {
  mp4: ["mp4", "m4v"],
  mkv: ["mkv"],
  ts: ["mpegts", "ts"],
  mov: ["mov"],
  webm: ["webm"],
  avi: ["avi"],
  flv: ["flv"],
};

export async function getDeviceNativeCaps(
  prisma: PrismaClient,
  deviceId: string,
): Promise<ClientCaps | null> {
  const rows = await prisma.deviceCapability.findMany({
    where: { deviceId, decoded: true },
    select: { testId: true },
  });
  if (!rows.length) return null;

  const video = new Set<string>();
  const audio = new Set<string>();
  const containers = new Set<string>();

  for (const { testId } of rows) {
    const t = BY_ID.get(testId);
    if (!t) continue;
    const vt = VIDEO_TOKEN[t.video];
    if (vt) video.add(vt);
    const at = AUDIO_TOKEN[t.audio];
    if (at) audio.add(at);
    for (const ct of CONTAINER_TOKENS[t.container] ?? []) containers.add(ct);
  }

  // No decodable video at all → treat as unknown rather than "plays nothing".
  if (video.size === 0) return null;

  return {
    videoCodecs: [...video],
    audioCodecs: [...audio],
    directContainers: [...containers],
  };
}
