/**
 * Empirically prove the transcode keepalive (GitHub #13). Starts TWO real forced-transcode sessions against
 * the live Plex and, every 10s, fetches a segment on both (a realistic active client) but pings ONLY the
 * "keepalive" one via `universal/ping`. Liveness is read from Plex's own `/transcode/sessions` list.
 *
 * Expected: the CONTROL (no ping) is reaped ~5½ min in ("paused for too long") even though it's fetching
 * segments; the KEEPALIVE one survives past that. That confirms both the reporter's diagnosis AND our fix.
 *
 *   cd apps/server && bun --env-file=.env run scripts/test-transcode-keepalive.ts [ratingKey]
 */
import prisma from "@airwave/db";

import { getLibraries, pingTranscode } from "@airwave/api/services/plex/client";
import { decryptToken } from "@airwave/api/services/plex/token";

const PRODUCT = "Airwave";
const H = (token: string) => ({ "X-Plex-Token": token, Accept: "application/json" });
const pad5 = (n: number) => String(n).padStart(5, "0");
const mmss = (ms: number) => `${Math.floor(ms / 60000)}m${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}s`;

function startParams(session: string, ratingKey: string, clientId: string, token: string): string {
  return new URLSearchParams({
    path: `/library/metadata/${ratingKey}`,
    mediaIndex: "0",
    partIndex: "0",
    protocol: "hls",
    fastSeek: "1",
    offset: "0",
    directPlay: "0",
    directStream: "1",
    subtitles: "none",
    hasMDE: "1",
    session,
    "X-Plex-Session-Identifier": session,
    "X-Plex-Client-Identifier": clientId,
    "X-Plex-Token": token,
    "X-Plex-Product": PRODUCT,
    "X-Plex-Platform": "Generic",
    // Force a real video transcode so a reap-eligible universal session definitely exists (cap well below any
    // source bitrate + a restrictive h264/aac target).
    maxVideoBitrate: "2000",
    videoResolution: "1280x720",
    videoQuality: "60",
    autoAdjustQuality: "0",
    "X-Plex-Client-Profile-Extra":
      "add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac)",
  }).toString();
}

async function startSession(base: string, token: string, clientId: string, ratingKey: string, label: string) {
  const session = `airwave-probe-${label}-${crypto.randomUUID().slice(0, 8)}`;
  const qs = startParams(session, ratingKey, clientId, token);
  const dec = await fetch(`${base}/video/:/transcode/universal/decision?${qs}`, { headers: H(token) });
  const start = await fetch(`${base}/video/:/transcode/universal/start.m3u8?${qs}`, { headers: H(token) });
  console.log(`  [${label}] session=${session}  decision=${dec.status} start=${start.status}`);
  return session;
}

async function fetchSegment(base: string, token: string, session: string, idx: number): Promise<number> {
  // Plex's start.m3u8 is a MASTER playlist → the media playlist lives at session/<s>/base/index.m3u8, and
  // segments are only served once that media playlist has been read. So re-read index.m3u8 first (exactly what
  // hls.js does), then pull the segment — the realistic active-client pattern.
  const seg = `${base}/video/:/transcode/universal/session/${session}/base`;
  try {
    await fetch(`${seg}/index.m3u8?X-Plex-Token=${token}`, { signal: AbortSignal.timeout(8000) });
    const res = await fetch(`${seg}/${pad5(idx)}.ts?X-Plex-Token=${token}`, { signal: AbortSignal.timeout(10000) });
    return res.status;
  } catch {
    return 0;
  }
}

/** Is `session` still in Plex's active transcode-session list? (Reaped → it's gone.) */
async function isAlive(base: string, token: string, session: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/transcode/sessions?X-Plex-Token=${token}`, { headers: H(token) });
    const text = await res.text();
    return text.includes(session);
  } catch {
    return false;
  }
}

async function stop(base: string, token: string, clientId: string, session: string) {
  try {
    await fetch(
      `${base}/video/:/transcode/universal/stop?session=${session}&X-Plex-Client-Identifier=${clientId}&X-Plex-Token=${token}`,
      { headers: H(token) },
    );
  } catch {
    /* ignore */
  }
}

async function main() {
  const source = await prisma.mediaSource.findFirst({
    where: { baseUrl: { not: null } },
    orderBy: { isDefault: "desc" },
  });
  if (!source?.baseUrl) return console.log("No connected source.");
  const base = source.baseUrl;
  const token = decryptToken(source.token);
  const clientId = source.clientIdentifier ?? "airwave-probe";

  // A ratingKey to transcode: arg, else the first movie in the first movie library.
  let ratingKey = process.argv[2];
  if (!ratingKey) {
    const libs = await getLibraries(base, token);
    const lib = libs.find((l: { type: string }) => l.type === "movie") ?? libs[0];
    const res = await fetch(`${base}/library/sections/${lib.key}/all?type=1&X-Plex-Container-Size=1`, { headers: H(token) });
    const j = (await res.json()) as { MediaContainer?: { Metadata?: Array<{ ratingKey: string; title: string }> } };
    const item = j?.MediaContainer?.Metadata?.[0];
    ratingKey = item?.ratingKey ?? "";
    console.log(`Using ratingKey ${ratingKey} (${item?.title ?? "?"}) from "${lib.title}"`);
  }
  if (!ratingKey) return console.log("No ratingKey to test.");
  console.log(`Plex: ${base}\n`);

  console.log("Starting two forced-transcode sessions…");
  const control = await startSession(base, token, clientId, ratingKey, "control");
  const keepalive = await startSession(base, token, clientId, ratingKey, "keepalive");

  const t0 = Date.now();
  let controlDied = 0;
  let keepaliveDied = 0;
  const TICKS = 45; // ~7.5 min at 10s

  for (let i = 0; i < TICKS; i++) {
    await Bun.sleep(10_000);
    const elapsed = Date.now() - t0;

    // Both fetch a segment (realistic active client). Ping ONLY the keepalive session.
    const [cSeg, kSeg] = await Promise.all([
      fetchSegment(base, token, control, i),
      fetchSegment(base, token, keepalive, i),
    ]);
    await pingTranscode(base, token, clientId, keepalive); // the fix, in isolation

    const [cAlive, kAlive] = await Promise.all([isAlive(base, token, control), isAlive(base, token, keepalive)]);
    if (!cAlive && !controlDied) controlDied = elapsed;
    if (!kAlive && !keepaliveDied) keepaliveDied = elapsed;

    console.log(
      `${mmss(elapsed).padStart(6)}  control[seg ${cSeg} alive=${cAlive}]  keepalive[seg ${kSeg} alive=${kAlive}]`,
    );
    if (controlDied && keepaliveDied) break; // both gone → nothing left to learn
  }

  console.log("\n================ RESULT ================");
  console.log(`control  (no ping): ${controlDied ? `DIED at ${mmss(controlDied)}` : "survived the full run"}`);
  console.log(`keepalive (pinged): ${keepaliveDied ? `DIED at ${mmss(keepaliveDied)}` : "survived the full run"}`);
  const proven = controlDied > 0 && (!keepaliveDied || keepaliveDied > controlDied + 60_000);
  console.log(
    proven
      ? "\n✅ universal/ping keeps the session alive: control reaped, pinged session outlived it."
      : "\n⚠️ inconclusive — see the tick log above (did the control actually get reaped?).",
  );

  await stop(base, token, clientId, control);
  await stop(base, token, clientId, keepalive);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
