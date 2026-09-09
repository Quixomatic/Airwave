/**
 * Dump a single device's PlaybackLog joined to the real HDR flag from MediaItem.guide — so you can see
 * exactly which HDR titles a given TV/panel played (e.g. the Fire Stick's HDR history for a targeted
 * aspect/zoom test channel). HDR is the authoritative `guide.hdr` (HDR10 / DV / HLG), not a codec guess.
 *
 * List devices (no arg — shows the roster so you can grab a match):
 *   bun --env-file=.env run scripts/show-device-log.ts
 *
 * Pass a device match — deviceId, or any substring of deviceId / platform / model / userAgent
 * (case-insensitive). Optional row limit (default 80). Add `hdr` as a later arg to list ONLY HDR plays:
 *   bun --env-file=.env run scripts/show-device-log.ts roku-74fc1f82
 *   bun --env-file=.env run scripts/show-device-log.ts dev-2hfhalh8 200 hdr
 */
import prisma from "@airwave/db";

async function main() {
  const query = process.argv[2]?.trim();
  const limit = Number(process.argv[3]) || 80;
  const hdrOnly = process.argv.slice(2).some((a) => a.toLowerCase() === "hdr");

  const devices = await prisma.tvDevice.findMany({ orderBy: { lastSeenAt: "desc" } });
  console.log("=== Devices (most-recent first) ===");
  for (const d of devices) {
    const seen = new Date(d.lastSeenAt).toLocaleDateString("en-US");
    console.log(
      `${d.deviceId.padEnd(24)} platform=${(d.platform ?? "?").padEnd(9)} model=${(d.model ?? "?").slice(0, 22).padEnd(22)} hdr=${String(d.hdr ?? "?").padEnd(5)} seen=${seen}`,
    );
  }

  if (!query) {
    console.log("\nPass a device match (deviceId / platform / model / userAgent substring) to see its log.");
    await prisma.$disconnect();
    return;
  }

  const q = query.toLowerCase();
  const matched = devices.filter((d) =>
    `${d.deviceId} ${d.platform ?? ""} ${d.model ?? ""} ${d.userAgent ?? ""}`.toLowerCase().includes(q),
  );
  if (matched.length === 0) {
    console.log(`\nNo device matched "${query}".`);
    await prisma.$disconnect();
    return;
  }
  const ids = matched.map((d) => d.deviceId);
  console.log(`\n=== Matched ${matched.length} device(s): ${ids.join(", ")} ===`);

  const rows = await prisma.playbackLog.findMany({
    where: { deviceId: { in: ids } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Join the real HDR flag from MediaItem.guide (guide.hdr = "HDR10" | "DV" | "HLG" | …), keyed by ratingKey.
  const ratingKeys = [...new Set(rows.map((r) => r.ratingKey).filter((k): k is string => !!k))];
  const items = ratingKeys.length
    ? await prisma.mediaItem.findMany({ where: { ratingKey: { in: ratingKeys } } })
    : [];
  const hdrByKey = new Map<string, { hdr?: string; resolution?: string }>();
  for (const it of items) {
    const g = (it.guide ?? {}) as { hdr?: string; resolution?: string };
    if (!hdrByKey.has(it.ratingKey)) hdrByKey.set(it.ratingKey, { hdr: g.hdr, resolution: g.resolution });
  }

  const shown = rows.filter((r) => !hdrOnly || (r.ratingKey && hdrByKey.get(r.ratingKey)?.hdr));
  console.log(`\n=== ${hdrOnly ? "HDR-only playback" : "Playback"} (${shown.length}) — ★ = HDR (guide.hdr) ===`);
  for (const r of shown) {
    const meta = r.ratingKey ? hdrByKey.get(r.ratingKey) : undefined;
    const hdr = meta?.hdr;
    const t = new Date(r.createdAt).toLocaleString("en-US", { hour12: false });
    console.log(
      `${hdr ? "★" : " "} ${t}  [${(r.outcome ?? "?").toUpperCase().padEnd(12)}] ${(hdr ?? "—").padEnd(6)} ${(meta?.resolution ?? "?").padEnd(4)} "${(r.title ?? "").slice(0, 40)}"  ${r.sourceContainer ?? "?"}/${r.sourceVideoCodec ?? "?"}/${r.sourceAudioCodec ?? "?"}`,
    );
  }

  const hdrTitles = [
    ...new Set(shown.filter((r) => r.ratingKey && hdrByKey.get(r.ratingKey)?.hdr).map((r) => r.title ?? "")),
  ].filter(Boolean);
  console.log(`\n=== Distinct HDR titles (${hdrTitles.length}) — the test-channel candidates ===`);
  for (const t of hdrTitles) console.log(`  - ${t}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
