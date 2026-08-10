/**
 * Probe what plex.tv /resources actually returns for each connected source, and how
 * pickConnectionUrls() classifies them (local / remote / relay). Read-only.
 *
 *   bun --env-file=.env run scripts/probe-plex-connections.ts
 */
import { getServers, pickConnectionUrls } from "@airwave/api/services/plex/client";
import { decryptToken } from "@airwave/api/services/plex/token";
import prisma from "@airwave/db";

const sources = await prisma.mediaSource.findMany({ where: { type: "PLEX" } });
if (!sources.length) console.log("no PLEX sources");

for (const s of sources) {
  console.log(`\n=== ${s.name} (machineIdentifier=${s.machineIdentifier}) ===`);
  console.log(`stored baseUrl: ${s.baseUrl}`);
  const servers = await getServers(s.clientIdentifier ?? "channelguide-server", decryptToken(s.token));
  const server = servers.find((x) => x.clientIdentifier === s.machineIdentifier);
  if (!server) {
    console.log("  ⚠ no matching server in /resources");
    continue;
  }
  console.log("  raw connections:");
  for (const c of server.connections) {
    console.log(`    local=${String(c.local).padEnd(5)} relay=${String(c.relay).padEnd(5)} proto=${c.protocol.padEnd(5)} ${c.uri}`);
  }
  console.log("  → pickConnectionUrls:", JSON.stringify(pickConnectionUrls(server.connections), null, 2));
}

process.exit(0);
