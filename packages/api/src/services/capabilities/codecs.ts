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
 * Audio codecs a panel is known NOT to decode even though the onboarding diagnostic
 * "passed" them — because that diagnostic verifies VIDEO decode only (`videoWidth×videoHeight`)
 * and never checks audio. A codec listed here is never credited as directly playable, so its
 * content takes the transcode path where the VIDEO still copies (no re-encode) and only the
 * AUDIO transcodes to a decodable codec. Keyed by canonical codec → the reason.
 *
 * This is a device-quirk table (the pattern every mature player ships), a stopgap until the
 * diagnostic verifies audio directly — at which point an over-credited codec fails audio
 * verification naturally and its entry here can be dropped.
 *
 * NOTE: applied to every device today because all our targets are LG webOS TVs; scope it to a
 * platform once we support panels that DO decode these.
 */
export const UNDECODABLE_AUDIO: Record<string, string> = {
  // LG webOS (incl. the C2 / OLED77C2AUA) has NO DTS/DCA audio decoder (licensing): a DTS clip
  // decodes its video but no audio ever comes out. Confirmed 2026-07-15 on the C2 (Anastasia,
  // mkv/h264/dca — video played, audio silent then dead).
  dts: "LG webOS has no DTS/DCA audio decoder (licensing) — audio silent.",
};

/**
 * Video codecs that decode in ISOLATION (the diagnostic passed a clip) but do NOT play through our
 * actual paths on the panel — so they must force a real VIDEO transcode to a working codec, same
 * idea as {@link UNDECODABLE_AUDIO}. A codec listed here is dropped from the credited native video
 * set, so `getPlaybackInfo` won't direct-play it AND the HLS profile won't advertise it as a copy
 * target → Plex re-encodes it (e.g. → H.264). Keyed by canonical codec → the reason.
 *
 * (Stopgap until a manual capability-settings page lets the user toggle codecs per device — the
 * proper long-term home, which writes back to `DeviceCapability`.)
 */
export const UNRELIABLE_VIDEO: Record<string, string> = {
  // LG C2: VP9 decodes in isolation (it's what YouTube uses) but FAILS every path we have — raw-file
  // `<video>` direct-play of mkv/vp9 errors (code 4, SRC_NOT_SUPPORTED), and VP9 *copied* into
  // fMP4/MSE sticks at readyState 1 (never plays). Confirmed 2026-07-17 on the C2 (Ms. Rachel,
  // mkv/vp9/aac — direct 0x0/err4, HLS stuck buffering). Force a transcode to H.264.
  vp9: "LG webOS C2: VP9 fails raw-file direct-play (err 4) and VP9-in-MSE stalls — transcode video.",
};
