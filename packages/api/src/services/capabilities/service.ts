import { type PrismaClient } from "@ChannelGuide/db";

import { CAP_MATRIX } from "./matrix";

/**
 * The probe manifest the TV app iterates. Media is served by THIS server at
 * `/caps/media/<id>.<container>` (relative — the app prepends its server URL),
 * so the whole diagnostic is self-contained in the backend.
 */
export function getCapabilityManifest() {
  return CAP_MATRIX.map((t) => ({
    id: t.id,
    category: t.category,
    container: t.container,
    video: t.video,
    audio: t.audio,
    feature: t.feature ?? null,
    subtitle: t.subtitle ?? null,
    diagnostic: t.diagnostic,
    realSample: t.realSample,
    manual: t.manual ?? [],
    url: `/caps/media/${t.id}.${t.container}`,
  }));
}

export type CapabilityResultInput = {
  deviceId: string;
  testId: string;
  container?: string;
  video?: string;
  audio?: string;
  feature?: string;
  subtitle?: string;
  decoded?: boolean;
  decodedWidth?: number;
  decodedHeight?: number;
  droppedFrames?: number;
  totalFrames?: number;
  error?: string;
  audioOk?: boolean;
  hdrOk?: boolean;
  subtitleOk?: boolean;
};

export async function saveCapabilityResult(
  prisma: PrismaClient,
  userId: string,
  r: CapabilityResultInput,
) {
  const data = {
    userId,
    container: r.container ?? null,
    video: r.video ?? null,
    audio: r.audio ?? null,
    feature: r.feature ?? null,
    subtitle: r.subtitle ?? null,
    decoded: r.decoded ?? null,
    decodedWidth: r.decodedWidth ?? null,
    decodedHeight: r.decodedHeight ?? null,
    droppedFrames: r.droppedFrames ?? null,
    totalFrames: r.totalFrames ?? null,
    error: r.error ?? null,
    audioOk: r.audioOk ?? null,
    hdrOk: r.hdrOk ?? null,
    subtitleOk: r.subtitleOk ?? null,
  };
  await prisma.deviceCapability.upsert({
    where: { deviceId_testId: { deviceId: r.deviceId, testId: r.testId } },
    create: { deviceId: r.deviceId, testId: r.testId, ...data },
    update: data,
  });
  return { ok: true as const };
}
