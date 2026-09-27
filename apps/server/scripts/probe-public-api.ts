/**
 * Probe the public integration API (/api/public/v1) end-to-end against the LOCAL database, in-process (no
 * running server needed — it calls the Hono app directly via `.request()`).
 *
 *   bun --env-file=.env run scripts/probe-public-api.ts
 *
 * What it does:
 *  - Mints a TEMPORARY admin `airwave_` API key (we can't read your real key back — better-auth stores keys
 *    hashed), tied to your first admin user.
 *  - Fetches /openapi.json (unauthed) and enumerates every GET operation.
 *  - Calls each parameterless GET with the key, printing status + a response snippet. New endpoints are picked
 *    up automatically as they're added to the spec.
 *  - Sanity-checks that a missing/bad key returns 401.
 *  - Revokes the temporary key on the way out.
 */
import { auth } from "@airwave/auth";
import prisma from "@airwave/db";

import { publicApi } from "../src/public";

const snippet = (s: string, n = 280) => (s.length > n ? `${s.slice(0, n)}…` : s);

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("No admin user found — run the app once so seedAdmin creates one.");
  console.log(`Admin user: ${admin.email} (${admin.id})`);

  const created = (await auth.api.createApiKey({
    body: { name: "probe-public-api (temp)", prefix: "airwave_", userId: admin.id, metadata: { probe: true } },
  })) as { id: string; key: string };
  const keyId = created.id;
  const key = created.key;
  if (!key) throw new Error(`createApiKey returned no plaintext key: ${JSON.stringify(created)}`);
  console.log(`Minted temp key: ${key.slice(0, 12)}…\n`);

  try {
    // 1. The spec (no auth).
    const specRes = await publicApi.request("/openapi.json");
    const spec = (await specRes.json()) as {
      info?: { title?: string; version?: string };
      paths?: Record<string, Record<string, unknown>>;
    };
    console.log(`GET /openapi.json → ${specRes.status}  "${spec.info?.title}" v${spec.info?.version}`);
    const paths = spec.paths ?? {};
    const getPaths = Object.keys(paths).filter((p) => "get" in (paths[p] ?? {}));
    console.log(`  ${getPaths.length} GET operations in the spec\n`);

    // 2. Every parameterless GET, with the key.
    for (const p of getPaths) {
      if (p.includes("{") || p === "/openapi.json" || p === "/docs") continue;
      const res = await publicApi.request(p, { headers: { "x-api-key": key } });
      const body = await res.text();
      const ok = res.status < 400 ? "✓" : "✗";
      console.log(`${ok} GET ${p} → ${res.status}  ${snippet(body)}`);
    }

    // 3. Auth negative check.
    const noKey = await publicApi.request("/status");
    const badKey = await publicApi.request("/status", { headers: { "x-api-key": "airwave_bogus" } });
    console.log(
      `\nauth: no-key → ${noKey.status} (want 401), bad-key → ${badKey.status} (want 401) ${
        noKey.status === 401 && badKey.status === 401 ? "✓" : "✗"
      }`,
    );
  } finally {
    // Revoke the temp key (delete the row directly — server-side deleteApiKey wants a session).
    await prisma.apikey.delete({ where: { id: keyId } }).catch(() => {});
    console.log(`\nRevoked temp key ${keyId}.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
