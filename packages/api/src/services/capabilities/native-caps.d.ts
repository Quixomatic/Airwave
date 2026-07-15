import type { PrismaClient } from "@ChannelGuide/db";
import type { ClientCaps } from "../plex/quality";
export declare function getDeviceNativeCaps(prisma: PrismaClient, deviceId: string): Promise<ClientCaps | null>;
