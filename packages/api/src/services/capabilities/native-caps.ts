import type { PrismaClient } from "@ChannelGuide/db";

import type { ClientCaps } from "../plex/quality";
import { UNDECODABLE_AUDIO, UNRELIABLE_VIDEO } from "./codecs";
import { CAP_MATRIX } from "./matrix";

/**
 * Turn a device's MEASURED capability-diagnostic results into the native-decode profile that drives
 * Plex's direct-play/transcode decision. The profile is layered:
 *   1. MEASURED  — a codec/container counts only if a clip that ACTUALLY decoded contains it.
 *   2. quirks    — known-bad codecs (VP9, DTS/TrueHD/ALAC) are dropped by default (they pass the
 *                  isolated diagnostic but don't play through our paths / have no LG decoder).
 *   3. overrides — per-device manual toggles from the Device settings page win over both (force a
 *                  codec on or off); clearing them reverts to measured-minus-quirks.
 * Returns null when the device hasn't onboarded (caller falls back to the client-reported guess).
 * See [[project-tv-playback-protocol]].
 */

const BY_ID = new Map(CAP_MATRIX.map((t) => [t.id, t]));

// Matrix video key → Plex `videoCodec` token. `null` = a variant that must NOT credit base support.
const VIDEO_TOKEN: Record<string, string | null> = {
  h264: "h264",
  h264_10: null,
  hevc: "hevc",
  hevc_10: "hevc",
  av1: "av1",
  vp9: "vp9",
  mpeg2: "mpeg2video",
  mpeg4: "mpeg4",
};

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

const CONTAINER_TOKENS: Record<string, string[]> = {
  mp4: ["mp4", "m4v"],
  mkv: ["mkv"],
  ts: ["mpegts", "ts"],
  mov: ["mov"],
  webm: ["webm"],
  avi: ["avi"],
  flv: ["flv"],
};

// A container token's Plex aliases that ride with it (forcing "mp4" on also covers m4v).
const CONTAINER_ALIAS: Record<string, string[]> = { mp4: ["m4v"], mpegts: ["ts"] };

export type CapabilityOverrides = {
  video?: Record<string, boolean>;
  audio?: Record<string, boolean>;
  container?: Record<string, boolean>;
};

export type MeasuredCaps = { video: Set<string>; audio: Set<string>; containers: Set<string> };

/**
 * RAW measured native-decode sets from the diagnostic — no quirks, no overrides (those layer on
 * top). Null when the device hasn't onboarded (no rows / nothing decoded).
 */
export async function getMeasuredCaps(prisma: PrismaClient, deviceId: string): Promise<MeasuredCaps | null> {
  const rows = await prisma.deviceCapability.findMany({
    where: { deviceId },
    select: { testId: true, decoded: true, audioOk: true },
  });
  if (!rows.length) return null;

  const video = new Set<string>();
  const containers = new Set<string>();
  const inferredAudio = new Set<string>(); // audio rode along in a video-decoded clip (inference)
  const audioTrue = new Set<string>(); // MEASURED: audio actually decoded
  const audioFalse = new Set<string>(); // MEASURED: audio did NOT decode — supersedes inference

  for (const { testId, decoded, audioOk } of rows) {
    const t = BY_ID.get(testId);
    if (!t) continue;
    const at = AUDIO_TOKEN[t.audio];
    if (decoded) {
      const vt = VIDEO_TOKEN[t.video];
      if (vt) video.add(vt); // RAW — the UNRELIABLE_VIDEO quirk is applied later, not here
      for (const ct of CONTAINER_TOKENS[t.container] ?? []) containers.add(ct);
      if (at) inferredAudio.add(at);
    }
    if (at && audioOk === true) audioTrue.add(at);
    if (at && audioOk === false) audioFalse.add(at);
  }

  if (video.size === 0) return null;

  const audio = new Set<string>();
  for (const c of new Set([...inferredAudio, ...audioTrue])) {
    if (audioTrue.has(c)) audio.add(c);
    else if (audioFalse.has(c)) continue; // measured negative supersedes inference
    else if (inferredAudio.has(c)) audio.add(c); // RAW — the UNDECODABLE_AUDIO quirk applies later
  }

  return { video, audio, containers };
}

/** The device's manual capability overrides (empty object if none). */
export async function readOverrides(prisma: PrismaClient, deviceId: string): Promise<CapabilityOverrides> {
  const d = await prisma.tvDevice.findUnique({ where: { deviceId }, select: { capabilityOverrides: true } });
  return (d?.capabilityOverrides as CapabilityOverrides | null) ?? {};
}

/** measured → drop quirked tokens (default) → apply explicit overrides (win). */
function applyEffective(
  measured: Set<string>,
  quirk: Record<string, string>,
  ov: Record<string, boolean> | undefined,
  alias: Record<string, string[]> = {},
): string[] {
  const out = new Set(measured);
  for (const t of measured) if (quirk[t]) out.delete(t);
  for (const [t, on] of Object.entries(ov ?? {})) {
    const toks = [t, ...(alias[t] ?? [])];
    if (on) toks.forEach((x) => out.add(x));
    else toks.forEach((x) => out.delete(x));
  }
  return [...out];
}

export async function getDeviceNativeCaps(prisma: PrismaClient, deviceId: string): Promise<ClientCaps | null> {
  const measured = await getMeasuredCaps(prisma, deviceId);
  if (!measured) return null;
  const ov = await readOverrides(prisma, deviceId);
  return {
    videoCodecs: applyEffective(measured.video, UNRELIABLE_VIDEO, ov.video),
    audioCodecs: applyEffective(measured.audio, UNDECODABLE_AUDIO, ov.audio),
    directContainers: applyEffective(measured.containers, {}, ov.container, CONTAINER_ALIAS),
  };
}
