import { Prisma, type PrismaClient } from "@ChannelGuide/db";

import { audioQuirks, videoQuirks } from "./codecs";
import { getMeasuredCaps, readOverrides } from "./native-caps";

/**
 * The data behind the Device settings page: a per-token capability breakdown (what the diagnostic
 * MEASURED, the known-issue quirk, any manual OVERRIDE, and the EFFECTIVE state actually used for
 * playback), plus the device's recent playback errors for context — and the writes to toggle/reset
 * an override. Effective = override ?? (measured && !quirk); see native-caps for how playback uses it.
 */

export type CapKind = "video" | "audio" | "container";

const CANDIDATES: Record<CapKind, { token: string; label: string }[]> = {
  video: [
    { token: "hevc", label: "HEVC (H.265)" },
    { token: "h264", label: "H.264 (AVC)" },
    { token: "av1", label: "AV1" },
    { token: "vp9", label: "VP9" },
    { token: "mpeg2video", label: "MPEG-2" },
    { token: "mpeg4", label: "MPEG-4" },
  ],
  audio: [
    { token: "aac", label: "AAC" },
    { token: "ac3", label: "AC3 (Dolby Digital)" },
    { token: "eac3", label: "E-AC3 (Dolby Digital+)" },
    { token: "dts", label: "DTS" },
    { token: "truehd", label: "Dolby TrueHD" },
    { token: "flac", label: "FLAC" },
    { token: "alac", label: "ALAC" },
    { token: "opus", label: "Opus" },
  ],
  container: [
    { token: "mkv", label: "MKV (Matroska)" },
    { token: "mp4", label: "MP4" },
    { token: "mov", label: "MOV (QuickTime)" },
    { token: "webm", label: "WebM" },
    { token: "mpegts", label: "MPEG-TS" },
    { token: "avi", label: "AVI" },
  ],
};

export type TokenState = {
  token: string;
  label: string;
  measured: boolean; // the diagnostic credited it
  quirk: string | null; // a known-issue reason it's off by default
  override: boolean | null; // manual override (null = none)
  effective: boolean; // what playback actually uses
};

export async function getDeviceCapabilityView(prisma: PrismaClient, deviceId: string) {
  const measured = await getMeasuredCaps(prisma, deviceId);
  const ov = await readOverrides(prisma, deviceId);
  const device = await prisma.tvDevice.findUnique({
    where: { deviceId },
    select: { model: true, osVersion: true, platform: true, screenWidth: true, screenHeight: true, hdr: true },
  });

  // Quirks are platform-scoped (e.g. AV1 is a known-issue only on the Apple mpv clients), so the
  // Device page shows the same defaults playback actually applies for THIS device's platform.
  const platform = device?.platform ?? null;
  const QUIRK: Record<CapKind, Record<string, string>> = {
    video: videoQuirks(platform),
    audio: audioQuirks(platform),
    container: {},
  };

  const setFor = (k: CapKind) => (k === "video" ? measured?.video : k === "audio" ? measured?.audio : measured?.containers);

  const groups = (Object.keys(CANDIDATES) as CapKind[]).map((kind) => ({
    kind,
    tokens: CANDIDATES[kind].map(({ token, label }): TokenState => {
      const m = setFor(kind)?.has(token) ?? false;
      const quirk = QUIRK[kind][token] ?? null;
      const override = ov[kind]?.[token] ?? null;
      const effective = override !== null ? override : m && !quirk;
      return { token, label, measured: m, quirk, override, effective };
    }),
  }));

  const recentErrors = await prisma.playbackLog.findMany({
    where: { deviceId, OR: [{ outcome: "error" }, { outcome: "not_decoding" }, { error: { not: null } }] },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      channelName: true,
      title: true,
      mode: true,
      sourceContainer: true,
      sourceVideoCodec: true,
      sourceAudioCodec: true,
      error: true,
      outcome: true,
      createdAt: true,
    },
  });

  return {
    onboarded: !!measured,
    hasOverrides: Object.values(ov).some((g) => g && Object.keys(g).length > 0),
    device,
    groups,
    recentErrors,
  };
}

/** Set (or clear, when value=null) one token's override, keeping the JSON tidy. */
export async function setDeviceCapabilityOverride(
  prisma: PrismaClient,
  deviceId: string,
  kind: CapKind,
  token: string,
  value: boolean | null,
) {
  const ov = await readOverrides(prisma, deviceId);
  const group = { ...(ov[kind] ?? {}) };
  if (value === null) delete group[token];
  else group[token] = value;

  const next = { ...ov, [kind]: group };
  if (Object.keys(group).length === 0) delete next[kind];

  await prisma.tvDevice.update({ where: { deviceId }, data: { capabilityOverrides: next as Prisma.InputJsonValue } });
  return next;
}

/** Clear ALL overrides — revert to exactly what the diagnostic found. */
export async function resetDeviceCapabilityOverrides(prisma: PrismaClient, deviceId: string) {
  await prisma.tvDevice.update({ where: { deviceId }, data: { capabilityOverrides: Prisma.DbNull } });
}
