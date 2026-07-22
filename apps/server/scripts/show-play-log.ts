/**
 * Dump the most recent PlaybackLog rows — each TV tune's real on-device outcome
 * (mode, Plex decision, source codecs, decoded dimensions, error). The ground truth
 * for diagnosing a bad channel.
 *
 *   bun --env-file=.env run scripts/show-play-log.ts
 */
import prisma from "@ChannelGuide/db";

async function main() {
  const rows = await prisma.playbackLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  console.log(`Last ${rows.length} playback-log rows:\n`);
  for (const r of rows) {
    const d: any = r.decision ?? {};
    const t = new Date(r.createdAt).toLocaleTimeString("en-US", { hour12: false });
    const dims = r.decodedWidth ? `${r.decodedWidth}x${r.decodedHeight}` : "0x0";
    console.log(
      `${t} [${(r.outcome ?? "?").toUpperCase().padEnd(12)}] ${(r.connection ?? "?").toUpperCase().padEnd(6)} ${(r.channelName ?? r.channelId ?? "?").slice(0, 20).padEnd(20)} "${(r.title ?? "").slice(0, 26)}"`,
    );
    console.log(
      `        mode=${(r.mode ?? "?").padEnd(6)} src=${r.sourceContainer ?? "?"}/${r.sourceVideoCodec ?? "?"}/${r.sourceAudioCodec ?? "?"} ` +
        `decision=${d.videoDecision ?? "?"}/${d.audioDecision ?? "?"}->${d.videoCodec ?? "?"}/${d.audioCodec ?? "?"} cont=${d.container ?? "?"} ` +
        `decoded=${dims} rs=${r.readyState ?? "?"}${r.error ? ` ERR=${r.error}` : ""}`,
    );
    // The direct-play audio-track switch readout (what the panel exposed + which we selected).
    const audio: any = (r.caps as any)?.audio;
    if (audio) console.log(`        audio=${JSON.stringify(audio)}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
