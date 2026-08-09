import { Prisma, type PrismaClient } from "@airwave/db";

/**
 * Device capability reporting — the data behind the webOS playback probe. A TV
 * client reports what its `<video>` element / platform can actually do (codecs
 * via canPlayType + MediaSource.isTypeSupported, HDR, resolution, model, webOS
 * version) on sign-in; we persist it (upsert by stable deviceId) so we can look
 * at real devices and design the per-device Plex capability profile (what to
 * direct-play vs transcode). See [[project-tv-playback-protocol]].
 */
export type DeviceReport = {
  deviceId: string;
  userAgent?: string;
  platform?: string;
  model?: string;
  osVersion?: string;
  screenWidth?: number;
  screenHeight?: number;
  pixelRatio?: number;
  hdr?: boolean;
  colorGamut?: string;
  capabilities?: Prisma.InputJsonValue;
  raw?: Prisma.InputJsonValue;
};

export async function reportDevice(prisma: PrismaClient, userId: string, r: DeviceReport) {
  const data = {
    userId,
    userAgent: r.userAgent ?? null,
    platform: r.platform ?? null,
    model: r.model ?? null,
    osVersion: r.osVersion ?? null,
    screenWidth: r.screenWidth ?? null,
    screenHeight: r.screenHeight ?? null,
    pixelRatio: r.pixelRatio ?? null,
    hdr: r.hdr ?? null,
    colorGamut: r.colorGamut ?? null,
    capabilities: r.capabilities ?? Prisma.JsonNull,
    raw: r.raw ?? Prisma.JsonNull,
  };
  const device = await prisma.tvDevice.upsert({
    where: { deviceId: r.deviceId },
    create: { deviceId: r.deviceId, ...data },
    update: data,
  });
  return { ok: true as const, id: device.id };
}
