/**
 * Generate the capability-probe test clips from one master source, driven by
 * CAP_MATRIX (single source of truth). Run on a box with a full ffmpeg
 * (libx265, libsvtav1, libvpx-vp9, truehd, dca encoders):
 *
 *   bun --env-file=.env run scripts/gen-capability-media.ts <master> <outdir>
 *
 * The master supplies VIDEO. AUDIO is synthesized: a 5.1 track with a distinct
 * tone per channel (FL/FR/FC/LFE/BL/BR), so the audio-codec tests encode real
 * multichannel audio regardless of the master (many test masters are video-only)
 * — and you can verify surround by ear (each channel a different pitch).
 *
 * `realSample` entries are skipped — drop real DV/Atmos/DTS-HD/HDR10+/PGS clips
 * there yourself, named per the matrix ids.
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

// Synthesize a 6s 5.1 tone bed (distinct pitch per channel) once.
const TONE = `${OUT}/_tone51.flac`;
console.log("synthesizing 5.1 tone bed…");
{
  const r = Bun.spawnSync([
    "ffmpeg",
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-filter_complex",
    "sine=f=220:d=6[fl];sine=f=277:d=6[fr];sine=f=330:d=6[fc];sine=f=110:d=6[lfe];sine=f=440:d=6[bl];sine=f=550:d=6[br];[fl][fr][fc][lfe][bl][br]join=inputs=6:channel_layout=5.1[a]",
    "-map",
    "[a]",
    "-c:a",
    "flac",
    TONE,
  ]);
  if (r.exitCode !== 0) {
    console.error("failed to build tone bed:", r.stderr?.toString());
    process.exit(1);
  }
}

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
  // input 0 = master (video), input 1 = tone (audio), input 2 = srt (when needed)
  const inputs = ["-ss", SS, "-t", DUR, "-i", MASTER, "-i", TONE];
  let maps = ["-map", "0:v:0", "-map", "1:a:0"];
  let vArgs = [...ff.v];
  const aArgs = [...ff.a];
  const extraFlags: string[] = [];
  let subArgs: string[] = [];

  // The master is 10-bit HDR (PQ / BT.2020). For every NON-HDR clip we must
  // tonemap down to 8-bit SDR BT.709 — otherwise the HDR transfer/primaries
  // ride along on an "SDR" clip and confuse TV decoders/display paths. The
  // encoder's own -pix_fmt (from the matrix) then pins the final bit depth.
  const isHDR = ff.vf === "hdr10";
  const SDR_NORMALIZE =
    "zscale=t=linear:npl=100,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:p=bt709:r=tv,format=yuv420p";
  const vfChain: string[] = [];
  if (!isHDR) vfChain.push(SDR_NORMALIZE);

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
      vfChain.push("tinterlace=interleave_top,fps=50");
      extraFlags.push("-flags", "+ilme+ildct");
      break;
    case "tracks30":
      maps = ["-map", "0:v:0"];
      for (let i = 0; i < 30; i++) maps.push("-map", "1:a:0");
      break;
    case "sub_srt":
    case "sub_ass":
      inputs.push("-i", SRT);
      maps.push("-map", "2:0");
      subArgs = ["-c:s", ff.vf === "sub_ass" ? "ass" : "srt"];
      break;
    default:
      vfChain.push(ff.vf);
  }

  const post = vfChain.length ? ["-vf", vfChain.join(","), ...extraFlags] : extraFlags;

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
    "-shortest",
    ...(ff.extra ?? []),
    outFile,
  ];

  process.stdout.write(`  ${test.id}.${test.container} … `);
  const proc = Bun.spawnSync(["ffmpeg", ...args]);
  if (proc.exitCode === 0) {
    console.log("ok");
    ok++;
  } else {
    console.log(`FAIL: ${(proc.stderr?.toString() ?? "").trim().slice(0, 180)}`);
    fail++;
  }
}

rmSync(SRT, { force: true });
rmSync(TONE, { force: true });
console.log(`\ngenerated ${ok}, failed ${fail}, skipped(real-sample) ${skip} of ${CAP_MATRIX.length}`);
process.exit(0);
