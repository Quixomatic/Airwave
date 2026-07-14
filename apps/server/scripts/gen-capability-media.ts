/**
 * Generate the capability-probe test clips from one master source, driven by
 * CAP_MATRIX (single source of truth). Run on a box with a full ffmpeg
 * (libx265, libsvtav1, libvpx-vp9, truehd, dca encoders):
 *
 *   bun --env-file=.env run scripts/gen-capability-media.ts <master> <outdir>
 *
 * Output into the dir the server serves (CAP_MEDIA_DIR). `realSample` entries
 * are skipped — drop real DV/Atmos/DTS-HD/HDR10+/PGS clips there yourself.
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

import { CAP_MATRIX } from "@ChannelGuide/api/services/capabilities/matrix";

const MASTER = process.argv[2];
const OUT = process.argv[3];
if (!MASTER || !OUT) {
  console.error("usage: gen-capability-media.ts <master-source> <outdir>");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const SS = "10";
const DUR = "5";
const SRT = `${OUT}/_probe.srt`;
writeFileSync(SRT, "1\n00:00:00,500 --> 00:00:04,500\nCapability probe subtitle\n");

let ok = 0;
let fail = 0;
let skip = 0;

for (const test of CAP_MATRIX) {
  const outFile = `${OUT}/${test.id}.${test.container}`;
  if (test.realSample || !test.ff) {
    console.log(`skip  ${test.id}  (real sample: ${test.diagnostic})`);
    skip++;
    continue;
  }
  const ff = test.ff;
  const inputs = ["-ss", SS, "-t", DUR, "-i", MASTER];
  const maps: string[] = [];
  let vArgs = [...ff.v];
  let aArgs = [...ff.a];
  const post: string[] = [];
  let subArgs: string[] = [];

  switch (ff.vf) {
    case undefined:
      break;
    case "hdr10":
      vArgs = vArgs.concat([
        "-x265-params",
        "hdr10=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400",
      ]);
      break;
    case "interlace":
      post.push("-vf", "tinterlace=interleave_top,fps=50", "-flags", "+ilme+ildct");
      break;
    case "tracks30":
      maps.push("-map", "0:v:0");
      for (let i = 0; i < 30; i++) maps.push("-map", "0:a:0?");
      break;
    case "sub_srt":
    case "sub_ass":
      inputs.push("-i", SRT);
      maps.push("-map", "0:v:0", "-map", "0:a:0", "-map", "1:0");
      subArgs = ["-c:s", ff.vf === "sub_ass" ? "ass" : "srt"];
      break;
    default:
      post.push("-vf", ff.vf);
  }

  if (ff.upmix) aArgs = ["-af", "aformat=channel_layouts=5.1", ...aArgs];

  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...inputs,
    ...maps,
    ...vArgs,
    ...post,
    ...aArgs,
    ...subArgs,
    ...(ff.extra ?? []),
    outFile,
  ];

  const proc = Bun.spawnSync(["ffmpeg", ...args]);
  if (proc.exitCode === 0) {
    console.log(`ok    ${test.id}.${test.container}`);
    ok++;
  } else {
    console.log(`FAIL  ${test.id}: ${(proc.stderr?.toString() ?? "").trim().slice(0, 200)}`);
    fail++;
  }
}

rmSync(SRT, { force: true });
console.log(`\ngenerated ${ok}, failed ${fail}, skipped(real-sample) ${skip} of ${CAP_MATRIX.length}`);
process.exit(0);
