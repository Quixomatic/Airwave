import type { PrismaClient } from "@airwave/db";
import { hostname } from "node:os";

import { env } from "@airwave/env/server";

import { codeSecondsRemaining, genBindSecret, genRegistrationToken, rotatingCode } from "./rotating-code";

/**
 * Remote Access to Airwave Cloud (airwave.software) — a singleton (`key="global"`). This server generates a
 * throwaway per-server secret, registers itself UNCLAIMED with the cloud, and displays a rotating 6-digit
 * code; the user pastes it into the cloud portal to bind this server to their account. Once bound, the cloud
 * assigns a subdomain + tunnel secret, which the server picks up by re-registering (polling).
 *
 * Secrets (registrationToken, bindSecret, tunnelSecret) NEVER leave the server via the admin API — only the
 * derived rotating code + status are exposed (see `remoteAccessView`).
 */
const SINGLETON_KEY = "global";

export async function getRemoteAccess(prisma: PrismaClient) {
  return prisma.remoteAccess.upsert({ where: { key: SINGLETON_KEY }, create: { key: SINGLETON_KEY }, update: {} });
}

// The RemoteAccess row type — annotated on the mutually-recursive enable/reconcile fns to break TS's
// return-type inference cycle (reconcileRevoked ⇄ enableRemoteAccess).
type RemoteAccessRow = Awaited<ReturnType<typeof getRemoteAccess>>;

/** The cloud base URL — an env override wins, else the stored value (default airwave.software). */
function cloudUrl(row: { cloudBaseUrl: string }): string {
  return (env.AIRWAVE_CLOUD_URL ?? row.cloudBaseUrl).replace(/\/$/, "");
}

type RegisterResult = {
  status: string;
  subdomain: string | null;
  tunnelSecret: string | null;
  relayHost: string | null;
  relayControlUrl: string | null;
};

async function callRegister(
  base: string,
  body: { registrationToken: string; bindSecret: string; hostname?: string },
): Promise<RegisterResult> {
  const res = await fetch(`${base}/api/instances/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Airwave Cloud registration failed (HTTP ${res.status}).`);
  return (await res.json()) as RegisterResult;
}

/**
 * The cloud told us this pairing was revoked (the user unbound this server in the portal). Wipe the dead
 * pairing; if Cloud Service is still enabled, immediately re-register fresh so the server offers a new bind
 * code — as if freshly enabled. (The live tunnel was already dropped by the relay's gate.)
 */
async function reconcileRevoked(prisma: PrismaClient): Promise<RemoteAccessRow> {
  const cleared = await prisma.remoteAccess.update({
    where: { key: SINGLETON_KEY },
    data: {
      status: "disconnected",
      registrationToken: null,
      bindSecret: null,
      subdomain: null,
      tunnelSecret: null,
      relayHost: null,
      relayUrl: null,
      lastPolledAt: new Date(),
    },
  });
  return cleared.enabled ? enableRemoteAccess(prisma) : cleared;
}

/**
 * Turn the cloud service ON.
 * - If this server was already set up (has a registrationToken), RECONNECT: re-register with the cloud
 *   (idempotent) to confirm/refresh the existing binding — no new pairing. Resumes bound or pending as-is.
 * - If it's a fresh server (never paired), start a new registration and go pending.
 */
export async function enableRemoteAccess(prisma: PrismaClient): Promise<RemoteAccessRow> {
  const row = await getRemoteAccess(prisma);
  const host = row.hostname ?? hostname();

  if (row.registrationToken && row.bindSecret) {
    // Reconnect: ask the mothership whether a binding already exists and pick up its config.
    const result = await callRegister(cloudUrl(row), {
      registrationToken: row.registrationToken,
      bindSecret: row.bindSecret,
      hostname: host,
    });
    if (result.status === "revoked") return reconcileRevoked(prisma);
    const bound = result.status !== "pending" && !!result.subdomain;
    return prisma.remoteAccess.update({
      where: { key: SINGLETON_KEY },
      data: {
        enabled: true,
        status: bound ? "bound" : "pending",
        ...(bound
          ? {
              subdomain: result.subdomain,
              tunnelSecret: result.tunnelSecret,
              relayHost: result.relayHost,
              relayUrl: result.relayControlUrl,
            }
          : {}),
        hostname: host,
        lastPolledAt: new Date(),
      },
    });
  }

  // Fresh setup: generate secrets, register unclaimed, go pending.
  const registrationToken = genRegistrationToken();
  const bindSecret = genBindSecret();
  await callRegister(cloudUrl(row), { registrationToken, bindSecret, hostname: host });
  return prisma.remoteAccess.update({
    where: { key: SINGLETON_KEY },
    data: {
      enabled: true,
      status: "pending",
      registrationToken,
      bindSecret,
      hostname: host,
      subdomain: null,
      tunnelSecret: null,
      relayHost: null,
      lastPolledAt: new Date(),
    },
  });
}

/**
 * Re-register with the cloud (idempotent) while the service is on — to (a) pick up the assigned config once
 * the user binds a pending server, and (b) keep the stored subdomain / tunnel secret / relay host CURRENT
 * once bound, so a subdomain the user changes in the portal is reflected here (and the tunnel can follow it).
 * Called on each admin-page read and by the background sync job.
 */
export async function refreshRemoteAccess(prisma: PrismaClient) {
  const row = await getRemoteAccess(prisma);
  const active = row.enabled && (row.status === "pending" || row.status === "bound");
  if (!active || !row.registrationToken || !row.bindSecret) return row;
  try {
    const result = await callRegister(cloudUrl(row), {
      registrationToken: row.registrationToken,
      bindSecret: row.bindSecret,
      hostname: row.hostname ?? hostname(),
    });
    if (result.status === "revoked") return reconcileRevoked(prisma);
    const bound = result.status !== "pending" && !!result.subdomain;
    return prisma.remoteAccess.update({
      where: { key: SINGLETON_KEY },
      data: bound
        ? {
            status: "bound",
            subdomain: result.subdomain,
            tunnelSecret: result.tunnelSecret,
            relayHost: result.relayHost,
            relayUrl: result.relayControlUrl,
            lastPolledAt: new Date(),
          }
        : { lastPolledAt: new Date() },
    });
  } catch {
    // Transient cloud/network hiccup — keep the current state, try again next poll.
    return prisma.remoteAccess.update({ where: { key: SINGLETON_KEY }, data: { lastPolledAt: new Date() } });
  }
}

/** Turn the cloud service OFF but KEEP the pairing — flipping it back on reconnects instantly. */
export async function disableRemoteAccess(prisma: PrismaClient) {
  return prisma.remoteAccess.update({ where: { key: SINGLETON_KEY }, data: { enabled: false } });
}

/**
 * Forget the pairing entirely (a deliberate unpair) — clears all pairing state so the next enable starts
 * fresh. The user should also remove the instance from the Airwave Cloud portal.
 */
export async function unpairRemoteAccess(prisma: PrismaClient): Promise<RemoteAccessRow> {
  const row = await getRemoteAccess(prisma);
  // Tell the cloud to revoke this instance too, so it clears on both sides (best-effort — local unpair
  // proceeds regardless; the cloud would tombstone on its own gate sweep anyway).
  if (row.registrationToken) {
    try {
      await fetch(`${cloudUrl(row)}/api/instances/unpair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ registrationToken: row.registrationToken }),
      });
    } catch {
      /* offline / cloud unreachable — ignore */
    }
  }
  // Drop the pairing but leave the Cloud Service toggle as-is: if it's still on, re-offer a fresh pairing
  // (new code) rather than silently switching Cloud Service off. Same reset the cloud-revoke path uses.
  return reconcileRevoked(prisma);
}

/** The client-safe view — the CURRENT rotating code + countdown while pending; never any secret. */
export function remoteAccessView(row: {
  enabled: boolean;
  status: string;
  bindSecret: string | null;
  subdomain: string | null;
  relayHost: string | null;
  hostname: string | null;
}) {
  const code = row.enabled && row.status === "pending" && row.bindSecret ? rotatingCode(row.bindSecret) : null;
  const domain = row.relayHost ?? "airwave.software";
  return {
    enabled: row.enabled,
    status: row.status,
    code,
    secondsRemaining: code ? codeSecondsRemaining() : null,
    subdomain: row.subdomain,
    address: row.subdomain ? `${row.subdomain}.${domain}` : null,
    hostname: row.hostname,
  };
}
