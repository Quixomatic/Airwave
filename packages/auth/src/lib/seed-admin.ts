import { createPrismaClient } from "@airwave/db";
import { env } from "@airwave/env/server";

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

  // Create through better-auth's admin-plugin `createUser` — the SAME path the admin UI's users module uses.
  // It hashes the password with better-auth's scheme AND writes the `credential` account row (a plain
  // `signUpEmail` no longer works: public email/password sign-up is disabled via
  // `emailAndPassword.disableSignUp`). Called with NO session/headers, which the admin plugin treats as a
  // trusted server-side call and skips the admin-permission check — the chicken-and-egg first-admin bootstrap
  // (there's no admin yet to authorize creating the first admin). `role: "admin"` is applied at creation.
  await auth.api.createUser({ body: { email, password, name: "Admin", role: "admin" } });
  await prisma.user.update({
    where: { email },
    data: { emailVerified: true },
  });
  console.log(`✅ Seeded admin ${email}`);
}
