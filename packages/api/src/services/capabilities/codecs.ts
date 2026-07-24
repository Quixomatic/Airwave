/**
 * Codec naming + known limitations — ONE source of truth, so the capability side
 * (`native-caps.ts`, which builds a panel's credited set) and the source-matching side
 * (`plex/client.ts`, which decides direct-play vs transcode for a real stream) speak the
 * same vocabulary. Plex/ffmpeg report a codec/container under several names; canonicalize
 * them here once instead of duplicating the mapping on both sides.
 */

/** Fold DTS (`dca`/`dca-ma`/`dca-hra`), E-AC3 (`ec-3`), TrueHD (`mlp`), … to one token. */
export function canonicalAudioCodec(raw: string): string {
  const x = raw.toLowerCase();
  if (x.startsWith("dca") || x.startsWith("dts")) return "dts";
  if (x === "ec-3" || x === "ec3" || x === "eac-3") return "eac3";
  if (x === "ac-3") return "ac3";
  if (x === "mlp") return "truehd";
  return x;
}

/** Fold HEVC (`h265`/`hvc1`/`hev1`) and H.264 (`avc`/`avc1`) to one token. */
export function canonicalVideoCodec(raw: string): string {
  const x = raw.toLowerCase();
  if (x === "h265" || x === "hvc1" || x === "hev1") return "hevc";
  if (x === "avc" || x === "avc1") return "h264";
  return x;
}

/** Fold `matroska*` → `mkv`, `quicktime` → `mov`. */
export function canonicalContainer(raw: string): string {
  const x = raw.toLowerCase();
  if (x.startsWith("matroska")) return "mkv";
  if (x === "quicktime") return "mov";
  return x;
}

/**
 * Codec quirks — codecs a device is known NOT to play well even though the onboarding diagnostic
 * "passed" them (audio: the diagnostic verifies VIDEO decode only; video: a codec decodes in
 * ISOLATION but fails our real playback paths). A quirked codec is dropped from the credited native
 * set, so `getPlaybackInfo` won't direct-play it and the HLS profile won't advertise it as a copy
 * target → Plex transcodes it (audio-only re-encode where video still copies; a real video transcode
 * for video quirks). The pattern every mature player ships; a manual per-device override on the
 * Device settings page can force any of these back on.
 *
 * A quirk with no `platforms` applies to EVERY device (our original LG-webOS-only assumption). One
 * with `platforms` applies only to those `TvDevice.platform` values ("webos" | "browser" | "ios" |
 * "android"), so a codec that's broken on one client isn't needlessly transcoded on another.
 */
type Quirk = { reason: string; platforms?: string[] };

const AUDIO_QUIRKS: Record<string, Quirk> = {
  // LG webOS (incl. the C2 / OLED77C2AUA) has NO DTS/DCA audio decoder (licensing): a DTS clip
  // decodes its video but no audio ever comes out. Confirmed 2026-07-15 on the C2 (Anastasia,
  // mkv/h264/dca — video played, audio silent then dead). Global (all current targets lack it).
  dts: { reason: "LG webOS has no DTS/DCA audio decoder (licensing) — audio silent." },
};

const VIDEO_QUIRKS: Record<string, Quirk> = {
  // LG C2: VP9 decodes in isolation (it's what YouTube uses) but FAILS every path we have — raw-file
  // `<video>` direct-play of mkv/vp9 errors (code 4, SRC_NOT_SUPPORTED), and VP9 *copied* into
  // fMP4/MSE sticks at readyState 1 (never plays). Confirmed 2026-07-17 on the C2 (Ms. Rachel,
  // mkv/vp9/aac — direct 0x0/err4, HLS stuck buffering). Force a transcode to H.264.
  vp9: { reason: "LG webOS C2: VP9 fails raw-file direct-play (err 4) and VP9-in-MSE stalls — transcode video." },
  // Apple mpv clients (tv-native, MPVKit): mpv software-decodes AV1 via dav1d — there's no reliable
  // hardware AV1 path through MPVKit — and that dav1d path NULL-CRASHES the decode thread on the
  // iPad / Apple TV. Confirmed 2026-07-24 on an M1 iPad ("Howl's Moving Castle", mkv/av1/opus →
  // EXC_BAD_ACCESS in ff_libdav1d_decoder after the first frame). AV1 software decode is CPU-murder
  // on mobile regardless, so force a transcode to H.264. Scoped to platform "ios" (iPad + Apple TV);
  // the C2 has hardware AV1 and Android mpv may hardware-decode via MediaCodec, so leave them alone.
  av1: { reason: "mpv/MPVKit software-decodes AV1 (dav1d) — crashes on Apple clients; transcode to H.264.", platforms: ["ios"] },
};

/** Flatten a quirk table to `token → reason` for the codecs that apply to this device's platform. */
function resolveQuirks(table: Record<string, Quirk>, platform: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [token, q] of Object.entries(table)) {
    if (!q.platforms || (platform != null && q.platforms.includes(platform))) out[token] = q.reason;
  }
  return out;
}

/** Video codecs off by default (→ transcode) for this device's platform. */
export function videoQuirks(platform: string | null | undefined): Record<string, string> {
  return resolveQuirks(VIDEO_QUIRKS, platform);
}

/** Audio codecs off by default (→ audio transcode) for this device's platform. */
export function audioQuirks(platform: string | null | undefined): Record<string, string> {
  return resolveQuirks(AUDIO_QUIRKS, platform);
}
