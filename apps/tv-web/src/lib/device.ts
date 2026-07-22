/**
 * Collects what THIS device can actually decode/render, for the webOS playback
 * probe. The high-signal, standards-based facts: `<video>.canPlayType` +
 * `MediaSource.isTypeSupported` per codec, HDR / color-gamut media queries,
 * resolution, and the webOS version from the UA. Reported to the server on
 * sign-in so we can design the per-device Plex capability profile.
 */

import { SERVER_URL } from "./server-url";

const DEVICE_ID_KEY = "cg-device-id";

/**
 * Records WHICH server the capability diagnostic last ran against (stores that server's URL).
 * The capability profile is measured device-side but stored in the SERVER's DB per deviceId — so
 * if the device is pointed at a DIFFERENT server, that server has no profile for it. Keying the
 * "done" flag by server URL makes the diagnostic re-run on a server switch, so the new server
 * gets this device's profile too. See [[project-tv-client-api]].
 */
export const CAPS_DONE_KEY = "cg-caps-done";

/** Whether the diagnostic has been completed against the CURRENT server. */
export function capsDoneForCurrentServer(): boolean {
  try {
    return localStorage.getItem(CAPS_DONE_KEY) === SERVER_URL;
  } catch {
    return false;
  }
}

/** Record that the diagnostic completed against the current server (so it doesn't re-run until
 * the device is pointed at a different one). */
export function markCapsDone() {
  try {
    localStorage.setItem(CAPS_DONE_KEY, SERVER_URL);
  } catch {
    /* non-fatal */
  }
}

export function deviceId(): string {
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

/* ------------------------------------------------------------------ */
/*  webOS Luna device info — the REAL panel facts (model, 4K, firmware) */
/*  that the web APIs get wrong (screen = 1080p canvas, hdr = false).    */
/* ------------------------------------------------------------------ */

type Luna = Record<string, unknown> | null;

function lunaCall(uri: string, params: Record<string, unknown>): Promise<Luna> {
  return new Promise((resolve) => {
    try {
      // PalmServiceBridge is injected on real webOS TVs (absent in browser/Simulator).
      const Bridge = (window as unknown as { PalmServiceBridge?: new () => unknown })
        .PalmServiceBridge;
      if (typeof Bridge !== "function") return resolve(null);
      const bridge = new Bridge() as {
        onservicecallback: (msg: string) => void;
        call: (uri: string, params: string) => void;
      };
      let done = false;
      const finish = (v: Luna) => {
        if (!done) {
          done = true;
          resolve(v);
        }
      };
      bridge.onservicecallback = (msg: string) => {
        try {
          finish(JSON.parse(msg) as Luna);
        } catch {
          finish(null);
        }
      };
      bridge.call(uri, JSON.stringify(params));
      setTimeout(() => finish(null), 2500);
    } catch {
      resolve(null);
    }
  });
}

/** Real device facts from webOS (null off-webOS). */
async function webosDeviceInfo(): Promise<Luna> {
  const sys = await lunaCall("luna://com.webos.service.tv.systemproperty/getSystemInfo", {
    keys: ["modelName", "UHD", "sdkVersion", "firmwareVersion", "serialNumber", "boardType"],
  });
  return sys && typeof sys === "object" ? sys : null;
}

/**
 * The full device report sent on sign-in: web-standards probe (codecs) + webOS
 * Luna facts (real model / 4K / firmware) merged in, so the DB record reflects
 * the actual panel, not the 1080p web canvas.
 */
export async function gatherDeviceReport() {
  const base = collectDeviceInfo();
  const sys = await webosDeviceInfo();
  if (sys) {
    const uhd = String(sys.UHD ?? "").toLowerCase() === "true";
    base.model = (sys.modelName as string) ?? base.model;
    base.osVersion = (sys.sdkVersion as string) ?? (sys.firmwareVersion as string) ?? base.osVersion;
    // UHD is the authoritative panel signal; the web `screen` is the 1080p app canvas.
    if (uhd) {
      base.screenWidth = 3840;
      base.screenHeight = 2160;
    }
    (base.raw as Record<string, unknown>).webosSystemInfo = sys;
    (base.raw as Record<string, unknown>).panelUhd = uhd;
  }
  return base;
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
