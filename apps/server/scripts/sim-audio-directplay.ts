/**
 * Audio-direct-play hypothesis test (READ-MOSTLY — restores state at the end).
 *
 * The question: for a title whose DEFAULT audio is undecodable (Avatar = TrueHD) but that
 * carries a DECODABLE companion track (AC3), if we PUT-select the AC3 track and THEN ask
 * Plex to decide with the C2's real caps — does Plex give us a DIRECT PLAY / COPY of the
 * raw file with AC3 as the fed track (James's hypothesis), or does the file's embedded
 * `default` flag (still TrueHD) mean we'd need a client-side track switch?
 *
 * It prints, for each audio stream, both flags Plex exposes — `default` (the file's embedded
 * default, immutable by a PUT) and `selected` (Plex's DB selection, what the PUT changes) —
 * before and after the PUT, plus what `/video/:/transcode/universal/decision` returns for
 * each (per-stream decision: directplay | copy | transcode). Restores the original selection.
 *
 *   bun --env-file=.env run scripts/sim-audio-directplay.ts "Avatar"
 */
import prisma from "@airwave/db";

import { canonicalAudioCodec } from "@airwave/api/services/capabilities/codecs";
import { getDeviceNativeCaps } from "@airwave/api/services/capabilities/native-caps";
import { decryptToken } from "@airwave/api/services/plex/token";

const H = (t: string) => ({ Accept: "application/json", "X-Plex-Token": t });

type Stream = {
  id?: number | string;
  streamType?: number;
  codec?: string;
  channels?: number;
  language?: string;
  default?: boolean | number;
  selected?: boolean | number;
  decision?: string;
  extendedDisplayTitle?: string;
};

async function getMeta(base: string, token: string, ratingKey: string) {
  const res = await fetch(`${base}/library/metadata/${ratingKey}`, { headers: H(token) });
  const m: any = ((await res.json()) as any)?.MediaContainer?.Metadata?.[0];
  const media = m?.Media?.[0];
  const part = media?.Part?.[0];
  return { media, part, streams: (part?.Stream ?? []) as Stream[] };
}

function printAudio(streams: Stream[], mediaAudioCodec: string) {
  console.log(`   Media.audioCodec (what canDirect sees) = ${mediaAudioCodec}`);
  for (const s of streams.filter((x) => x.streamType === 2)) {
    console.log(
      `     [id ${s.id}] ${s.codec} ${s.channels}ch ${s.language ?? "?"}` +
        `  default=${s.default ? "Y" : "-"} selected=${s.selected ? "Y" : "-"}` +
        (s.decision ? `  decision=${s.decision}` : "") +
        `  "${s.extendedDisplayTitle ?? ""}"`,
    );
  }
}

async function decide(
  base: string,
  token: string,
  clientId: string,
  ratingKey: string,
  offset: number,
  caps: { videoCodecs: string[]; audioCodecs: string[]; directContainers: string[] },
  label: string,
) {
  const v = caps.videoCodecs.join(",");
  const a = caps.audioCodecs.join(",");
  // Advertise BOTH mp4 and mkv direct-play targets with the full native audio set, so Plex is
  // free to direct-play the raw MKV if it wants to (clientProfileExtra only lists mp4).
  const profile = [
    `add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mp4&videoCodec=${v}&audioCodec=aac)`,
    `add-direct-play-target(type=videoProfile&container=mp4&videoCodec=${v}&audioCodec=${a})`,
    `add-direct-play-target(type=videoProfile&container=mkv&videoCodec=${v}&audioCodec=${a})`,
  ].join("+");
  const session = `simtest-${Math.floor(offset)}`;
  const params = new URLSearchParams({
    path: `/library/metadata/${ratingKey}`,
    mediaIndex: "0",
    partIndex: "0",
    protocol: "hls",
    directPlay: "1",
    directStream: "1",
    fastSeek: "1",
    offset: String(Math.max(0, Math.floor(offset))),
    hasMDE: "1",
    session,
    "X-Plex-Session-Identifier": session,
    "X-Plex-Client-Identifier": clientId,
    "X-Plex-Token": token,
    "X-Plex-Product": "Airwave",
    "X-Plex-Platform": "Generic",
    "X-Plex-Client-Profile-Extra": profile,
  });
  const res = await fetch(`${base}/video/:/transcode/universal/decision?${params.toString()}`, {
    headers: H(token),
  });
  const j: any = await res.json().catch(() => null);
  const mc = j?.MediaContainer;
  const media = mc?.Metadata?.[0]?.Media?.[0];
  const part = media?.Part?.[0];
  console.log(`\n   --- /decision (${label}) status=${res.status} ---`);
  console.log(
    `   general=${mc?.generalDecisionText ?? "?"} (${mc?.generalDecisionCode ?? "?"})` +
      `  directPlay=${mc?.directPlayDecisionText ?? "?"} (${mc?.directPlayDecisionCode ?? "?"})` +
      `  transcode=${mc?.transcodeDecisionText ?? "?"} (${mc?.transcodeDecisionCode ?? "?"})`,
  );
  console.log(
    `   Media: videoDecision=${media?.videoDecision ?? "?"} audioDecision=${media?.audioDecision ?? "?"}` +
      ` protocol=${media?.protocol ?? "?"} container=${media?.container ?? "?"}` +
      ` -> ${media?.videoCodec ?? "?"}/${media?.audioCodec ?? "?"}`,
  );
  console.log(`   Part.decision=${part?.decision ?? "?"}`);
  printAudio((part?.Stream ?? []) as Stream[], media?.audioCodec ?? "?");
}

async function putSelect(base: string, token: string, partId: string, audioStreamId: string) {
  const sel = new URLSearchParams({ allParts: "1", audioStreamID: audioStreamId });
  const res = await fetch(`${base}/library/parts/${partId}?${sel.toString()}`, {
    method: "PUT",
    headers: H(token),
  });
  return res.status;
}

async function main() {
  const title = process.argv[2] ?? "Avatar";
  const offset = Number(process.argv[3] ?? 60);

  const capRow = await prisma.deviceCapability.findFirst({ where: { decoded: true } });
  if (!capRow) return console.log("No onboarded device — run the diagnostic first.");
  const caps = await getDeviceNativeCaps(prisma, capRow.deviceId);
  if (!caps) return console.log("No caps derived for device.");
  console.log(`Device: ${capRow.deviceId}`);
  console.log(`audio caps: ${caps.audioCodecs.join(",")}\n`);

  const item = await prisma.mediaItem.findFirst({
    where: { title: { contains: title, mode: "insensitive" } },
    include: { mediaSource: true },
    orderBy: { title: "asc" },
  });
  if (!item?.mediaSource?.baseUrl || !item.ratingKey) return console.log(`No cached "${title}" with a source.`);
  const base = item.mediaSource.baseUrl;
  const token = decryptToken(item.mediaSource.token);
  const clientId = item.mediaSource.clientIdentifier ?? "channelguide-server";
  console.log(`Title: ${item.title} (ratingKey ${item.ratingKey})`);

  // 1) Initial state.
  const before = await getMeta(base, token, item.ratingKey);
  const partId = String(before.part?.id ?? (before.part?.key ?? "").split("/")[3] ?? "");
  console.log(`\n== BEFORE PUT (part ${partId}) ==`);
  printAudio(before.streams, (before.media?.audioCodec ?? "").toLowerCase());

  const audio = before.streams.filter((s) => s.streamType === 2);
  const origSelected = audio.find((s) => s.selected);
  const decodable = audio
    .filter((s) => caps.audioCodecs.includes(canonicalAudioCodec(s.codec ?? "")))
    .sort((a, b) => (b.channels ?? 0) - (a.channels ?? 0))[0];

  console.log(
    `\n   originalSelected=id ${origSelected?.id} (${origSelected?.codec})` +
      `  decodableAlt=${decodable ? `id ${decodable.id} (${decodable.codec} ${decodable.channels}ch)` : "NONE"}`,
  );
  if (!decodable) return console.log("No decodable audio track exists — nothing to test."), prisma.$disconnect();

  // 2) Decision BEFORE the PUT (default TrueHD selected).
  await decide(base, token, clientId, item.ratingKey, offset, caps, "before PUT");

  // 3) PUT-select the decodable track.
  const putStatus = await putSelect(base, token, partId, String(decodable.id));
  console.log(`\n== PUT audioStreamID=${decodable.id} -> status ${putStatus} ==`);

  // 4) Re-read metadata — did `selected` move? did `default` stay? did Media.audioCodec flip?
  const after = await getMeta(base, token, item.ratingKey);
  printAudio(after.streams, (after.media?.audioCodec ?? "").toLowerCase());

  // 5) Decision AFTER the PUT — the crux.
  await decide(base, token, clientId, item.ratingKey, offset, caps, "after PUT");

  // 6) Restore the original selection so we don't leave Avatar's global state changed.
  if (origSelected?.id != null) {
    const r = await putSelect(base, token, partId, String(origSelected.id));
    console.log(`\n== RESTORED audioStreamID=${origSelected.id} -> status ${r} ==`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
