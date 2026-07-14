/**
 * Collects what THIS device can actually decode/render, for the webOS playback
 * probe. The high-signal, standards-based facts: `<video>.canPlayType` +
 * `MediaSource.isTypeSupported` per codec, HDR / color-gamut media queries,
 * resolution, and the webOS version from the UA. Reported to the server on
 * sign-in so we can design the per-device Plex capability profile.
 */

const DEVICE_ID_KEY = "cg-device-id";

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// Codec test strings. canPlayType → "" | "maybe" | "probably"; isTypeSupported → MSE (hls.js/DASH).
const VIDEO_CODECS: Record<string, string> = {
  h264: 'video/mp4; codecs="avc1.640028"',
  hevc_main8: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
  hevc_main10: 'video/mp4; codecs="hvc1.2.4.L153.B0"',
  hev1_main10: 'video/mp4; codecs="hev1.2.4.L153.B0"',
  vp9: 'video/webm; codecs="vp9"',
  vp9_mp4: 'video/mp4; codecs="vp09.00.10.08"',
  av1: 'video/mp4; codecs="av01.0.05M.08"',
  dolby_vision: 'video/mp4; codecs="dvh1.05.06"',
};

const AUDIO_CODECS: Record<string, string> = {
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  ac3: 'audio/mp4; codecs="ac-3"',
  eac3: 'audio/mp4; codecs="ec-3"',
  flac: 'audio/mp4; codecs="flac"',
  opus: 'audio/webm; codecs="opus"',
  vorbis: 'audio/webm; codecs="vorbis"',
  dts: 'audio/mp4; codecs="dtsc"',
  truehd: 'audio/mp4; codecs="mlpa"',
};

const CONTAINERS: Record<string, string> = {
  hls: "application/vnd.apple.mpegurl",
  mkv: "video/x-matroska",
  webm: "video/webm",
  mp4: "video/mp4",
};

function probe(video: HTMLVideoElement, specs: Record<string, string>) {
  const mseOk = typeof MediaSource !== "undefined" && typeof MediaSource.isTypeSupported === "function";
  const out: Record<string, { canPlay: string; mse: boolean }> = {};
  for (const [name, spec] of Object.entries(specs)) {
    out[name] = {
      canPlay: video.canPlayType(spec),
      mse: mseOk ? MediaSource.isTypeSupported(spec) : false,
    };
  }
  return out;
}

function mq(query: string): boolean {
  try {
    return window.matchMedia?.(query)?.matches ?? false;
  } catch {
    return false;
  }
}

export type ClientCaps = {
  videoCodecs: string[];
  audioCodecs: string[];
  directContainers: string[];
};

/**
 * The compact codec profile sent to the server on each media resolve, so it can
 * decide direct-play/direct-stream vs transcode and feed Plex the right profile.
 * A codec counts as supported if `<video>.canPlayType` is maybe/probably OR MSE
 * (hls.js) supports it. Names map to Plex's (`hevc`, `eac3`, …).
 */
export function clientCaps(): ClientCaps {
  const video = document.createElement("video");
  const ok = (spec: string) => {
    const cp = video.canPlayType(spec);
    const mse = typeof MediaSource !== "undefined" && !!MediaSource.isTypeSupported?.(spec);
    return cp === "probably" || cp === "maybe" || mse;
  };

  const videoCodecs: string[] = [];
  if (ok('video/mp4; codecs="avc1.640028"')) videoCodecs.push("h264");
  if (ok('video/mp4; codecs="hvc1.1.6.L93.B0"') || ok('video/mp4; codecs="hvc1.2.4.L153.B0"'))
    videoCodecs.push("hevc");
  if (ok('video/mp4; codecs="av01.0.05M.08"')) videoCodecs.push("av1");
  if (ok('video/webm; codecs="vp9"') || ok('video/mp4; codecs="vp09.00.10.08"'))
    videoCodecs.push("vp9");

  const audioCodecs: string[] = [];
  if (ok('audio/mp4; codecs="mp4a.40.2"')) audioCodecs.push("aac");
  if (ok('audio/mp4; codecs="ac-3"')) audioCodecs.push("ac3");
  if (ok('audio/mp4; codecs="ec-3"')) audioCodecs.push("eac3");
  if (ok('audio/mp4; codecs="flac"')) audioCodecs.push("flac");
  if (ok('audio/webm; codecs="opus"')) audioCodecs.push("opus");

  return { videoCodecs, audioCodecs, directContainers: ["mp4", "m4v", "mov"] };
}

export function collectDeviceInfo() {
  const video = document.createElement("video");
  const ua = navigator.userAgent;
  const platform = /web[o0]s/i.test(ua) ? "webos" : "browser";
  const osVersion = ua.match(/[Ww]eb[O0]S[.\s]?(?:TV[-/]?)?([\d.]+)/)?.[1] ?? null;
  const hdr = mq("(dynamic-range: high)");
  const colorGamut = mq("(color-gamut: rec2020)") ? "rec2020" : mq("(color-gamut: p3)") ? "p3" : "srgb";

  const capabilities = {
    video: probe(video, VIDEO_CODECS),
    audio: probe(video, AUDIO_CODECS),
    containers: probe(video, CONTAINERS),
  };

  return {
    deviceId: deviceId(),
    userAgent: ua,
    platform,
    model: null as string | null,
    osVersion,
    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    pixelRatio: window.devicePixelRatio ?? null,
    hdr,
    colorGamut,
    capabilities,
    raw: {
      chrome: ua.match(/Chrome\/([\d.]+)/)?.[1] ?? null,
      screen: {
        width: window.screen?.width,
        height: window.screen?.height,
        colorDepth: window.screen?.colorDepth,
      },
      devicePixelRatio: window.devicePixelRatio,
      hdr,
      colorGamut,
      videoDynamicRangeHigh: mq("(video-dynamic-range: high)"),
      hasWebOSSystem: "webOSSystem" in window || "PalmSystem" in window,
      capabilities,
    },
  };
}
