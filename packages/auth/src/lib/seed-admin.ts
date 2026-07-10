import { createPrismaClient } from "@ChannelGuide/db";
import { env } from "@ChannelGuide/env/server";

import { auth } from "../index";

/**
 * Seed the first admin from env (ADMIN_EMAIL / ADMIN_PASSWORD) on server
 * startup — Overseerr-style bootstrap. Idempotent: creates the account once,
 * then just ensures the `admin` role on later boots. No-op if the env vars are
 * unset (e.g. a pure Plex/OAuth deployment).
 */
export async function seedAdmin(): Promise<void> {
  const email = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const prisma = createPrismaClient();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role !== "admin") {
      await prisma.user.update({ where: { email }, data: { role: "admin" } });
      console.log(`✅ Promoted ${email} to admin`);
    }
    return;
  }

  // Create through better-auth so the password is hashed with its own scheme.
  await auth.api.signUpEmail({ body: { email, password, name: "Admin" } });
  await prisma.user.update({
    where: { email },
    data: { role: "admin", emailVerified: true },
  });
  console.log(`✅ Seeded admin ${email}`);
}
