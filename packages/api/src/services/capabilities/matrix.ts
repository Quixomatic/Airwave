/**
 * The capability-probe matrix — the single source of truth for the TV diagnostic.
 * `gen-capability-media.ts` fabricates a 5s clip per (non-realSample) entry with
 * ffmpeg; the server serves them + this manifest; the tv-web Diagnostic screen
 * plays each via native <video> and records what the panel actually decodes.
 *
 * Axis-comprehensive (every container / video codec / audio codec / feature /
 * subtitle) plus the container-sensitivity cross-combos that actually break
 * (E-AC3 / DTS / Dolby-Vision in mkv vs mp4). `realSample` = ffmpeg can't
 * fabricate it (proprietary / dynamic metadata) → drop a real clip of that name.
 */

/** ffmpeg encoder fragments (video). */
const V: Record<string, string[]> = {
  // 8-bit codecs MUST pin yuv420p — the HDR master is 10-bit, so without this
  // libx264/libx265 emit High-10 / Main-10 (Hi10P), which real TV hardware
  // decoders reject (error 4) even though desktop software decoders accept it.
  h264: ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"],
  h264_10: ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p10le"],
  hevc: ["-c:v", "libx265", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-tag:v", "hvc1"],
  hevc_10: ["-c:v", "libx265", "-preset", "veryfast", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1"],
  av1: ["-c:v", "libsvtav1", "-preset", "8", "-crf", "35", "-pix_fmt", "yuv420p"],
  vp9: ["-c:v", "libvpx-vp9", "-b:v", "6M", "-pix_fmt", "yuv420p"],
  mpeg2: ["-c:v", "mpeg2video", "-b:v", "8M", "-pix_fmt", "yuv420p"],
  mpeg4: ["-c:v", "mpeg4", "-vtag", "DX50", "-pix_fmt", "yuv420p"],
};

/** ffmpeg encoder fragments (audio). Surround codecs get upmixed to 5.1 by the generator. */
const A: Record<string, string[]> = {
  aac: ["-c:a", "aac", "-b:a", "192k"],
  ac3: ["-c:a", "ac3", "-b:a", "448k"],
  eac3: ["-c:a", "eac3", "-b:a", "384k"],
  dts: ["-strict", "-2", "-c:a", "dca"],
  truehd: ["-strict", "-2", "-c:a", "truehd"],
  flac: ["-c:a", "flac"],
  alac: ["-c:a", "alac"],
  opus: ["-c:a", "libopus"],
  vorbis: ["-c:a", "libvorbis"],
  mp3: ["-c:a", "libmp3lame", "-b:a", "192k"],
  pcm: ["-c:a", "pcm_s16le"],
};

const SURROUND = new Set(["ac3", "eac3", "dts", "truehd", "flac"]);

export type CapCategory = "container" | "video" | "audio" | "hdr" | "perf" | "subtitle" | "edge";

export type CapTest = {
  id: string;
  category: CapCategory;
  container: string; // = output extension (mkv→matroska, ts→mpegts, …)
  video: string; // recipe key / display
  audio: string;
  feature?: string;
  subtitle?: string;
  diagnostic: string;
  realSample: boolean;
  /** Subjective axes the auto-probe can't verify → prompt a remote 👍/👎. */
  manual?: Array<"audio" | "hdr" | "subtitle">;
  /** ffmpeg recipe (omitted when realSample). */
  ff?: { v: string[]; a: string[]; vf?: string; extra?: string[]; upmix?: boolean };
};

type TestInput = Omit<CapTest, "realSample" | "ff"> & {
  realSample?: boolean;
  /** Only the overridable bits — v/a are derived from the codec keys. */
  ff?: { vf?: string; extra?: string[] };
};

const t = (x: TestInput): CapTest => {
  const realSample = x.realSample ?? false;
  return {
    id: x.id,
    category: x.category,
    container: x.container,
    video: x.video,
    audio: x.audio,
    feature: x.feature,
    subtitle: x.subtitle,
    diagnostic: x.diagnostic,
    manual: x.manual,
    realSample,
    ff: realSample
      ? undefined
      : {
          v: V[x.video] ?? ["-c:v", "libx264", "-preset", "veryfast"],
          a: A[x.audio] ?? ["-c:a", "aac", "-b:a", "192k"],
          vf: x.ff?.vf,
          extra: x.ff?.extra,
          upmix: SURROUND.has(x.audio),
        },
  };
};

export const CAP_MATRIX: CapTest[] = [
  // 1) Containers — baseline h264/aac (demuxer coverage)
  t({ id: "cont_mp4", category: "container", container: "mp4", video: "h264", audio: "aac", diagnostic: "Control: MP4 baseline" }),
  t({ id: "cont_mkv", category: "container", container: "mkv", video: "h264", audio: "aac", diagnostic: "MKV demuxer" }),
  t({ id: "cont_ts", category: "container", container: "ts", video: "h264", audio: "aac", diagnostic: "MPEG-TS demuxer" }),
  t({ id: "cont_mov", category: "container", container: "mov", video: "h264", audio: "aac", diagnostic: "QuickTime MOV" }),
  t({ id: "cont_avi", category: "container", container: "avi", video: "mpeg4", audio: "mp3", diagnostic: "Legacy AVI/DivX" }),
  t({ id: "cont_webm", category: "container", container: "webm", video: "vp9", audio: "opus", diagnostic: "WebM (VP9/Opus)" }),
  t({ id: "cont_flv", category: "container", container: "flv", video: "h264", audio: "aac", diagnostic: "Flash FLV demuxer" }),

  // 2) Video codecs — in mkv, plus HEVC10/AV1 in mp4 for container-sensitivity
  t({ id: "vid_h264_mkv", category: "video", container: "mkv", video: "h264", audio: "aac", diagnostic: "H.264 8-bit" }),
  t({ id: "vid_h264_10_mkv", category: "video", container: "mkv", video: "h264_10", audio: "aac", diagnostic: "H.264 Hi10P (10-bit AVC)" }),
  t({ id: "vid_hevc_mkv", category: "video", container: "mkv", video: "hevc", audio: "aac", diagnostic: "HEVC 8-bit" }),
  t({ id: "vid_hevc_10_mkv", category: "video", container: "mkv", video: "hevc_10", audio: "aac", diagnostic: "HEVC Main10 in MKV" }),
  t({ id: "vid_hevc_10_mp4", category: "video", container: "mp4", video: "hevc_10", audio: "aac", diagnostic: "HEVC Main10 in MP4" }),
  t({ id: "vid_av1_mkv", category: "video", container: "mkv", video: "av1", audio: "opus", diagnostic: "AV1 in MKV" }),
  t({ id: "vid_av1_mp4", category: "video", container: "mp4", video: "av1", audio: "aac", diagnostic: "AV1 in MP4" }),
  t({ id: "vid_vp9_webm", category: "video", container: "webm", video: "vp9", audio: "opus", diagnostic: "VP9" }),
  t({ id: "vid_mpeg2_ts", category: "video", container: "ts", video: "mpeg2", audio: "ac3", diagnostic: "MPEG-2 (broadcast/DVD)" }),

  // 3) Audio codecs — in mkv (video h264); eac3 in mp4 vs mkv (the sensitivity we hit)
  t({ id: "aud_aac", category: "audio", container: "mkv", video: "h264", audio: "aac", diagnostic: "AAC", manual: ["audio"] }),
  t({ id: "aud_ac3", category: "audio", container: "mkv", video: "h264", audio: "ac3", diagnostic: "AC3 (Dolby Digital)", manual: ["audio"] }),
  t({ id: "aud_eac3_mkv", category: "audio", container: "mkv", video: "h264", audio: "eac3", diagnostic: "E-AC3 in MKV", manual: ["audio"] }),
  t({ id: "aud_eac3_mp4", category: "audio", container: "mp4", video: "h264", audio: "eac3", diagnostic: "E-AC3 in MP4", manual: ["audio"] }),
  t({ id: "aud_dts", category: "audio", container: "mkv", video: "h264", audio: "dts", diagnostic: "DTS Digital Surround", manual: ["audio"] }),
  t({ id: "aud_truehd", category: "audio", container: "mkv", video: "h264", audio: "truehd", diagnostic: "Dolby TrueHD (lossless)", manual: ["audio"] }),
  t({ id: "aud_flac", category: "audio", container: "mkv", video: "h264", audio: "flac", diagnostic: "FLAC (lossless)", manual: ["audio"] }),
  t({ id: "aud_alac", category: "audio", container: "mkv", video: "h264", audio: "alac", diagnostic: "ALAC", manual: ["audio"] }),
  t({ id: "aud_opus", category: "audio", container: "mkv", video: "h264", audio: "opus", diagnostic: "Opus", manual: ["audio"] }),
  t({ id: "aud_pcm", category: "audio", container: "mkv", video: "h264", audio: "pcm", diagnostic: "PCM (raw)", manual: ["audio"] }),
  t({ id: "aud_dtshd", category: "audio", container: "mkv", video: "hevc", audio: "dts-hd-ma", feature: "lossless", diagnostic: "DTS-HD Master Audio", realSample: true, manual: ["audio"] }),
  t({ id: "aud_atmos_eac3", category: "audio", container: "mp4", video: "hevc", audio: "eac3-atmos", feature: "atmos", diagnostic: "Atmos (E-AC3 JOC)", realSample: true, manual: ["audio"] }),
  t({ id: "aud_atmos_truehd", category: "audio", container: "mkv", video: "hevc", audio: "truehd-atmos", feature: "atmos", diagnostic: "Atmos (TrueHD)", realSample: true, manual: ["audio"] }),

  // 4) HDR / color — HDR10 generatable; DV / HDR10+ / HLG need real samples
  t({ id: "hdr_hdr10_mkv", category: "hdr", container: "mkv", video: "hevc_10", audio: "ac3", feature: "hdr10", diagnostic: "HDR10 in MKV", manual: ["hdr"], ff: { vf: "hdr10" } }),
  t({ id: "hdr_hdr10_mp4", category: "hdr", container: "mp4", video: "hevc_10", audio: "eac3", feature: "hdr10", diagnostic: "HDR10 in MP4", manual: ["hdr"], ff: { vf: "hdr10" } }),
  t({ id: "hdr_hdr10plus", category: "hdr", container: "mkv", video: "hevc_10", audio: "ac3", feature: "hdr10plus", diagnostic: "HDR10+ dynamic metadata", realSample: true, manual: ["hdr"] }),
  t({ id: "hdr_hlg", category: "hdr", container: "mkv", video: "hevc_10", audio: "ac3", feature: "hlg", diagnostic: "HLG (broadcast HDR)", realSample: true, manual: ["hdr"] }),
  t({ id: "hdr_dv_p5_mp4", category: "hdr", container: "mp4", video: "hevc_10", audio: "eac3", feature: "dolbyvision_p5", diagnostic: "Dolby Vision P5 (MP4)", realSample: true, manual: ["hdr"] }),
  t({ id: "hdr_dv_p8_mp4", category: "hdr", container: "mp4", video: "hevc_10", audio: "eac3", feature: "dolbyvision_p8", diagnostic: "Dolby Vision P8.1 (MP4)", realSample: true, manual: ["hdr"] }),
  t({ id: "hdr_dv_p7_mkv", category: "hdr", container: "mkv", video: "hevc_10", audio: "truehd", feature: "dolbyvision_p7", diagnostic: "Dolby Vision P7 (MKV — usually rejected)", realSample: true, manual: ["hdr"] }),

  // 5) Performance / bitrate ladder — HEVC/aac in mkv (find the ceiling)
  t({ id: "perf_1080p60_10m", category: "perf", container: "mkv", video: "hevc", audio: "aac", feature: "1080p60@10M", diagnostic: "HFR baseline", ff: { vf: "scale=1920x1080,fps=60", extra: ["-b:v", "10M", "-maxrate", "10M", "-bufsize", "10M"] } }),
  t({ id: "perf_4k30_40m", category: "perf", container: "mkv", video: "hevc", audio: "aac", feature: "4k30@40M", diagnostic: "Standard 4K", ff: { vf: "scale=3840x2160,fps=30", extra: ["-b:v", "40M", "-maxrate", "40M", "-bufsize", "40M"] } }),
  t({ id: "perf_4k60_80m", category: "perf", container: "mkv", video: "hevc", audio: "aac", feature: "4k60@80M", diagnostic: "4K60 streaming tier", ff: { vf: "scale=3840x2160,fps=60", extra: ["-b:v", "80M", "-maxrate", "80M", "-bufsize", "80M"] } }),
  t({ id: "perf_4k60_120m", category: "perf", container: "mkv", video: "hevc", audio: "aac", feature: "4k60@120M", diagnostic: "4K decode ceiling", ff: { vf: "scale=3840x2160,fps=60", extra: ["-b:v", "120M", "-maxrate", "120M", "-bufsize", "120M"] } }),
  t({ id: "perf_8k60_150m", category: "perf", container: "mkv", video: "hevc", audio: "aac", feature: "8k60@150M", diagnostic: "8K raster + network limit", ff: { vf: "scale=7680x4320,fps=60", extra: ["-b:v", "150M", "-maxrate", "150M", "-bufsize", "150M"] } }),

  // 6) Subtitles — srt/ass/mov_text generatable; image subs need real samples
  t({ id: "sub_srt", category: "subtitle", container: "mkv", video: "h264", audio: "aac", subtitle: "srt", diagnostic: "SRT text subs", manual: ["subtitle"], ff: { vf: "sub_srt" } }),
  t({ id: "sub_ass", category: "subtitle", container: "mkv", video: "h264", audio: "aac", subtitle: "ass", diagnostic: "ASS/SSA styled subs", manual: ["subtitle"], ff: { vf: "sub_ass" } }),
  t({ id: "sub_pgs", category: "subtitle", container: "mkv", video: "hevc", audio: "aac", subtitle: "pgs", diagnostic: "PGS image subs (SW-render torture)", realSample: true, manual: ["subtitle"] }),
  t({ id: "sub_vobsub", category: "subtitle", container: "mkv", video: "h264", audio: "aac", subtitle: "vobsub", diagnostic: "VobSub image subs", realSample: true, manual: ["subtitle"] }),

  // 7) Edge cases
  t({ id: "edge_interlaced", category: "edge", container: "ts", video: "mpeg2", audio: "ac3", feature: "1080i", diagnostic: "1080i interlaced de-interlace", ff: { vf: "interlace" } }),
  t({ id: "edge_anamorphic", category: "edge", container: "mp4", video: "h264", audio: "aac", feature: "anamorphic", diagnostic: "Non-square pixels (SAR)", ff: { vf: "scale=720:480,setsar=32/27" } }),
  t({ id: "edge_tracks_30", category: "edge", container: "mkv", video: "h264", audio: "aac", feature: "30_audio_tracks", diagnostic: "30 audio tracks (demuxer stress)", ff: { vf: "tracks30" } }),
  t({ id: "edge_hfr_120", category: "edge", container: "mkv", video: "hevc", audio: "aac", feature: "1080p120", diagnostic: "120fps panel refresh", ff: { vf: "scale=1920x1080,fps=120" } }),
];
