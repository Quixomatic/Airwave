/**
 * Real test for the Roku on-device email/password login (Phase 13).
 * Creates a throwaway password-bearing user (same path as seedAdmin), runs the actual `passwordLogin`
 * service, proves the returned bearer validates via `auth.api.getSession`, and that every failure mode
 * collapses to `invalid`. Cleans up after itself.
 *
 * Run: cd apps/server && bun --env-file=.env run scripts/test-tv-password-login.ts
 */
import { auth } from "@airwave/auth";
import { passwordLogin } from "@airwave/api/services/auth/tv-password-link";
import prisma from "@airwave/db";

const EMAIL = "roku-login-test@airwave.local";
const PASS = "correct-horse-battery-staple";

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!u) return;
  await prisma.session.deleteMany({ where: { userId: u.id } });
  await prisma.account.deleteMany({ where: { userId: u.id } });
  await prisma.user.delete({ where: { id: u.id } });
}

async function main() {
  await cleanup(); // clear any prior run

  await auth.api.createUser({ body: { email: EMAIL, password: PASS, name: "Roku Login Test", role: "user" } });
  console.log(`created test user ${EMAIL}`);

  // 1) correct creds → ok + a bearer token
  const ok = await passwordLogin(EMAIL, PASS);
  console.log(`correct creds       → ${ok.status}` + (ok.status === "ok" ? `  (token len ${ok.token.length}, user ${ok.user.email} / role ${ok.user.role})` : ""));

  // 2) the bearer validates via getSession (Authorization: Bearer) — proves it's a usable /api/v1 credential
  let sessionOk = false;
  if (ok.status === "ok") {
    const session = await auth.api.getSession({ headers: new Headers({ Authorization: `Bearer ${ok.token}` }) });
    sessionOk = !!session?.user && session.user.email === EMAIL;
    console.log(`bearer validates    → ${sessionOk}  (getSession user: ${session?.user?.email ?? "none"})`);
  }

  // 3) wrong password → invalid
  const wrong = await passwordLogin(EMAIL, "nope-wrong-password");
  console.log(`wrong password      → ${wrong.status}`);

  // 4) unknown email → invalid (no account enumeration)
  const unknown = await passwordLogin("nobody-here@airwave.local", "whatever");
  console.log(`unknown email       → ${unknown.status}`);

  // 5) empty → invalid (short-circuits before better-auth)
  const empty = await passwordLogin("", "");
  console.log(`empty creds         → ${empty.status}`);

  await cleanup();
  console.log("cleaned up test user");

  const pass =
    ok.status === "ok" &&
    sessionOk &&
    wrong.status === "invalid" &&
    unknown.status === "invalid" &&
    empty.status === "invalid";
  console.log(pass ? "\nALL PASS ✅" : "\nFAILED ❌");
  process.exit(pass ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await cleanup();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
