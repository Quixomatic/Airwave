/**
 * Probe what device info we can show on the admin Sessions page now that WatchSession stores a stable
 * `deviceId` (v0.15.1). It answers three questions for the #131 design:
 *
 *   1. What's actually IN the TvDevice table (the roster), and which fields are populated per platform?
 *   2. For each live/stored WatchSession, does its `deviceId` resolve to a TvDevice? (the NEW join)
 *      — and how does that compare to the OLD path the page uses today (latest PlaybackLog.deviceId → TvDevice)?
 *   3. Where are the gaps — sessions with no matching TvDevice ("legacy", browser, or never-registered) that
 *      would need a synthesized label like "Browser".
 *
 * Read-only. Run:
 *   cd apps/server && bun --env-file=.env run scripts/probe-session-devices.ts
 */
import prisma from "@airwave/db";

const SESSION_ACTIVE_MS = 30_000;

function pct(n: number, total: number) {
  if (total === 0) return "  -";
  return `${Math.round((n / total) * 100)}%`.padStart(3);
}

async function main() {
  // ---- 1. TvDevice roster --------------------------------------------------
  const devices = await prisma.tvDevice.findMany({
    orderBy: { lastSeenAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });

  console.log(`\n=== TvDevice roster (${devices.length}) — most-recent first ===`);
  console.log(
    `${"deviceId".padEnd(26)} ${"platform".padEnd(9)} ${"model".padEnd(22)} ${"os".padEnd(10)} ${"screen".padEnd(10)} hdr   gamut  user`,
  );
  for (const d of devices) {
    const screen = d.screenWidth && d.screenHeight ? `${d.screenWidth}x${d.screenHeight}` : "?";
    const who = d.user?.name || d.user?.email || d.userId;
    console.log(
      `${d.deviceId.slice(0, 26).padEnd(26)} ${(d.platform ?? "?").padEnd(9)} ${(d.model ?? "?").slice(0, 22).padEnd(22)} ${(d.osVersion ?? "?").slice(0, 10).padEnd(10)} ${screen.padEnd(10)} ${String(d.hdr ?? "?").padEnd(5)} ${(d.colorGamut ?? "?").padEnd(6)} ${who}`,
    );
  }

  // ---- Field coverage per platform ----------------------------------------
  const platforms = [...new Set(devices.map((d) => d.platform ?? "(null)"))].sort();
  console.log(`\n=== Field coverage by platform (what's safe to show) ===`);
  console.log(`${"platform".padEnd(10)} ${"count".padEnd(6)} model  os    screen  hdr   userAgent`);
  for (const p of platforms) {
    const rows = devices.filter((d) => (d.platform ?? "(null)") === p);
    const has = (f: (d: (typeof rows)[number]) => unknown) => rows.filter((d) => f(d) != null).length;
    console.log(
      `${p.padEnd(10)} ${String(rows.length).padEnd(6)} ${pct(has((d) => d.model), rows.length)}   ${pct(has((d) => d.osVersion), rows.length)}  ${pct(has((d) => d.screenWidth), rows.length)}    ${pct(has((d) => d.hdr), rows.length)}  ${pct(has((d) => d.userAgent), rows.length)}`,
    );
  }

  // ---- 2. WatchSessions + both join paths ----------------------------------
  const sessions = await prisma.watchSession.findMany({
    orderBy: { lastHeartbeatAt: "desc" },
    include: {
      user: { select: { name: true, email: true } },
      channel: { select: { number: true, name: true } },
    },
  });

  const now = Date.now();
  const byDeviceId = new Map(devices.map((d) => [d.deviceId, d]));

  console.log(`\n=== WatchSessions (${sessions.length}) — ● = active (heartbeat < 30s) ===`);
  if (sessions.length === 0) {
    console.log("  (none stored — WatchSession is transient; start playback on a client to populate it)");
  }
  for (const s of sessions) {
    const active = now - new Date(s.lastHeartbeatAt).getTime() < SESSION_ACTIVE_MS;
    const who = s.user.name || s.user.email;
    const ch = s.channel ? `#${s.channel.number} ${s.channel.name}` : "—";

    // NEW join: WatchSession.deviceId → TvDevice
    const newDev = byDeviceId.get(s.deviceId);
    const newLabel = newDev
      ? `${newDev.platform ?? "?"}/${newDev.model ?? "?"}`
      : s.deviceId === "legacy"
        ? "LEGACY (no deviceId)"
        : "NO TvDevice row";

    // OLD path: latest PlaybackLog for this (user, channel, ratingKey) → its deviceId → TvDevice
    const log =
      s.ratingKey && s.channelId
        ? await prisma.playbackLog.findFirst({
            where: { userId: s.userId, channelId: s.channelId, ratingKey: s.ratingKey },
            orderBy: { createdAt: "desc" },
            select: { deviceId: true },
          })
        : null;
    const oldDev = log?.deviceId ? byDeviceId.get(log.deviceId) : undefined;
    const oldLabel = !log?.deviceId
      ? "no play-log"
      : oldDev
        ? `${oldDev.platform ?? "?"}/${oldDev.model ?? "?"}`
        : "unknown";

    console.log(
      `${active ? "●" : "○"} ${who.padEnd(14)} dev=${s.deviceId.slice(0, 24).padEnd(24)} pb=${(s.playbackState ?? "—").padEnd(9)} ${ch.slice(0, 22).padEnd(22)}`,
    );
    console.log(`    NEW (session.deviceId→TvDevice): ${newLabel}`);
    console.log(`    OLD (playLog.deviceId→TvDevice): ${oldLabel}${log?.deviceId ? ` [${log.deviceId.slice(0, 24)}]` : ""}`);
  }

  // ---- 3. Gaps -------------------------------------------------------------
  const gaps = sessions.filter((s) => !byDeviceId.has(s.deviceId));
  console.log(`\n=== Gaps: sessions whose deviceId has no TvDevice row (${gaps.length}) ===`);
  for (const s of gaps) {
    const who = s.user.name || s.user.email;
    console.log(
      `  ${who.padEnd(14)} deviceId="${s.deviceId}"  ${s.deviceId === "legacy" ? "(pre-per-device client)" : "(client never POSTed a device report → needs a synthesized label, e.g. \"Browser\")"}`,
    );
  }
  if (gaps.length === 0 && sessions.length > 0) {
    console.log("  (none — every live session resolves to a TvDevice via the new join)");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
