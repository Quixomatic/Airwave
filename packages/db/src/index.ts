import { env } from "@ChannelGuide/env/server";
import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "../prisma/generated/client";

export function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();
export default prisma;

export { Prisma };
export type { PrismaClient };
