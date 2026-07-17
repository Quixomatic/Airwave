import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, type CapTest } from "../../lib/api";
import { SERVER_URL } from "../../lib/auth-client";
import { CAPS_DONE_KEY, deviceId } from "../../lib/device";

type Auto = {
  decoded: boolean;
  decodedWidth: number;
  decodedHeight: number;
  droppedFrames?: number;
  totalFrames?: number;
  error?: string;
  // Audio-decode measurement (webkitAudioDecodedByteCount over the clip). hasAudioApi=false
  // when the panel doesn't expose the counter. audioOk is DERIVED post-run (needs the
  // cross-clip control), never inline — see the audio-verdict pass below.
  hasTrackApi?: boolean;
  audioTrackPresent?: boolean;
  audioOk?: boolean;
  audioDebug?: string; // raw audio-signal readout (which detector the panel actually exposes)
};

// webkitAudioDecodedByteCount is stubbed to 0 on the C2's Chrome 108 (useless). The signal
// that DOES work: `audioTracks` — the panel lists a decodable audio track for codecs it can
// decode and drops/disables it for ones it can't (DTS/TrueHD on LG).
type AudioTrackLike = { enabled?: boolean };
type WithAudioInfo = HTMLVideoElement & {
  webkitAudioDecodedByteCount?: number;
  audioTracks?: { length: number; [i: number]: AudioTrackLike };
};

/**
 * Device capability onboarding. Fully automatic: plays each matrix clip through
 * the native <video> (muted, so autoplay never blocks) and records whether it
 * actually decoded frames — that's the only thing that matters (audio is
 * switchable/transcodable). No human judgment. Result → DeviceCapability, and a
 * per-device localStorage flag so it runs once on first sign-in.
 */
export function Diagnostic({ onExit }: { onExit: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tests, setTests] = useState<CapTest[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [rows, setRows] = useState<Record<string, Auto>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .capsManifest()
      .then((r) => setTests(r.tests))
      .catch(() => {
        setError("Could not load the diagnostic matrix (is the server running?)");
        localStorage.setItem(CAPS_DONE_KEY, "1"); // don't nag on every login if it's broken
      });
  }, []);

  // Auto-run the whole matrix.
  useEffect(() => {
    if (!tests) return;
    let cancelled = false;

    const runOne = (test: CapTest): Promise<Auto> =>
      new Promise((resolve) => {
        const v = videoRef.current as WithAudioInfo | null;
        if (!v) return resolve({ decoded: false, decodedWidth: 0, decodedHeight: 0, error: "no video el" });
        let settled = false;
        const finish = (r: Auto) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(hard);
          v.removeEventListener("loadeddata", onLoaded);
          v.removeEventListener("error", onErr);
          resolve(r);
        };
        const snap = (err?: string): Auto => {
          const q = v.getVideoPlaybackQuality?.();
          // The audio-decode signal that actually works on the C2's Chrome 108: the panel
          // lists a decodable audio track for codecs it can decode, and drops/disables it for
          // ones it can't (byteCount is stubbed to 0 there). Also keep a raw readout to confirm.
          const tracks = v.audioTracks;
          const hasTrackApi = !!tracks && typeof tracks.length === "number";
          const audioTrackPresent = !!(hasTrackApi && tracks.length > 0 && tracks[0]?.enabled !== false);
          const audioDebug = `tracks=${tracks?.length ?? "x"} en=${String(tracks?.[0]?.enabled)} bc=${String(v.webkitAudioDecodedByteCount)}`;
          return {
            decoded: !err && v.videoWidth > 0 && v.videoHeight > 0,
            decodedWidth: v.videoWidth,
            decodedHeight: v.videoHeight,
            droppedFrames: q?.droppedVideoFrames,
            totalFrames: q?.totalVideoFrames,
            error: err,
            hasTrackApi,
            audioTrackPresent,
            audioDebug,
          };
        };
        // First decoded frame → let it play ~2.5s (dropped-frame stutter + let the audio
        // track list settle), then record.
        const onLoaded = () => window.setTimeout(() => finish(snap()), 2500);
        const onErr = () => finish(snap(`decode error ${v.error?.code ?? "?"}`));
        const hard = window.setTimeout(() => finish(snap(v.videoWidth > 0 ? undefined : "timeout (no frame)")), 10000);
        v.addEventListener("loadeddata", onLoaded);
        v.addEventListener("error", onErr);
        v.muted = true; // muted → autoplay never blocks; the audioTracks list still populates
        v.src = `${SERVER_URL}${test.url}`;
        void v.play().catch(() => {});
      });

    const upsert = (test: CapTest, r: Auto, audioOk?: boolean) =>
      void api
        .capsResult({
          deviceId: deviceId(),
          testId: test.id,
          container: test.container,
          video: test.video,
          audio: test.audio,
          feature: test.feature,
          subtitle: test.subtitle,
          decoded: r.decoded,
          decodedWidth: r.decodedWidth,
          decodedHeight: r.decodedHeight,
          droppedFrames: r.droppedFrames,
          totalFrames: r.totalFrames,
          error: r.error,
          ...(audioOk === undefined ? {} : { audioOk }),
        })
        .catch(() => {});

    (async () => {
      const results: Record<string, Auto> = {};
      for (let i = 0; i < tests.length; i++) {
        if (cancelled) return;
        setIdx(i);
        const test = tests[i];
        const auto = await runOne(test);
        if (cancelled) return;
        results[test.id] = auto;
        setRows((r) => ({ ...r, [test.id]: auto }));
        upsert(test, auto);
      }
      if (cancelled) return;

      // Audio-verdict pass — DERIVED after the full run (needs the cross-clip control):
      //  • the panel listed a usable audio track (present + enabled) → audioOk=true.
      //  • If ANY clip got a track, the audioTracks API works on this panel → a clip that
      //    played its video but exposed NO usable audio track genuinely can't decode that
      //    audio → audioOk=false.
      //  • Otherwise (no track API / no clip ever got a track / video never decoded) → stay
      //    null (unknown), so we NEVER wrongly mark a working codec as unsupported.
      const anyTrackPresent = Object.values(results).some((r) => r.audioTrackPresent);
      for (const test of tests) {
        const r = results[test.id];
        if (!r) continue;
        let audioOk: boolean | undefined;
        if (r.audioTrackPresent) audioOk = true;
        else if (r.hasTrackApi && anyTrackPresent && r.decoded) audioOk = false;
        if (audioOk === undefined) continue;
        r.audioOk = audioOk;
        setRows((rows) => ({ ...rows, [test.id]: { ...rows[test.id]!, audioOk } }));
        upsert(test, r, audioOk);
      }

      localStorage.setItem(CAPS_DONE_KEY, "1");
      setDone(true);
      videoRef.current?.pause();
    })();

    return () => {
      cancelled = true;
    };
  }, [tests]);

  // Back exits (and marks done so onboarding doesn't re-trigger).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.keyCode === 461 || e.key === "Backspace" || e.key === "XF86Back") {
        e.preventDefault();
        e.stopPropagation();
        localStorage.setItem(CAPS_DONE_KEY, "1");
        videoRef.current?.pause();
        onExit();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onExit]);

  if (error) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#060a14", color: "#f1f5f9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, textAlign: "center", padding: 40 }}>
        <p style={{ color: "#f87171", fontSize: 20, maxWidth: 560 }}>{error}</p>
        <button onClick={onExit} style={{ borderRadius: 12, border: "1px solid rgba(148,163,184,0.25)", background: "transparent", color: "#e6eaf1", padding: "12px 28px", fontSize: 17, cursor: "pointer" }}>
          Skip
        </button>
      </div>
    );
  }

  const cur = tests?.[idx];
  const pass = tests ? Object.values(rows).filter((r) => r.decoded).length : 0;
  const fail = tests ? Object.values(rows).filter((r) => !r.decoded).length : 0;
  const pct = tests ? ((done ? tests.length : idx) / tests.length) * 100 : 0;
  const FRAME_W = "min(52vw, 720px)";
  const chips = cur ? [cur.container, cur.video, cur.audio, cur.feature, cur.subtitle].filter((x): x is string => !!x && x !== "none") : [];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#060a14", color: "#f1f5f9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {/* The clip actually being decoded — a centered framed "screen". Its size doesn't affect the
          measurement (videoWidth/Height), just how it looks. */}
      <div style={{ position: "relative", width: FRAME_W, aspectRatio: "16 / 9", borderRadius: 20, overflow: "hidden", border: "1px solid rgba(148,163,184,0.16)", background: "#000", boxShadow: "0 30px 90px rgba(0,0,0,0.6)" }}>
        <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: done ? 0.25 : 0.9, transition: "opacity 0.4s ease" }} playsInline muted />
        {done && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}
              style={{ width: 96, height: 96, borderRadius: "50%", background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 40px ${ACCENT}88` }}>
              <Check size={52} color="#04060c" strokeWidth={3} />
            </motion.div>
          </div>
        )}
      </div>

      {/* Title */}
      <div style={{ marginTop: 40, textAlign: "center" }}>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.5px" }}>{done ? "Setup complete" : "Setting up your TV"}</div>
        <div style={{ fontSize: 18, color: "#94a3b8", marginTop: 6 }}>
          {done ? "We've measured exactly what your TV plays natively." : "Checking exactly what your TV can play — just a moment."}
        </div>
      </div>

      {/* The thing being tested — slides in, slides away, per test. */}
      <div style={{ height: 74, marginTop: 22, width: FRAME_W, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <AnimatePresence mode="wait">
          {!done && cur && (
            <motion.div
              key={cur.id}
              initial={{ opacity: 0, x: 56 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -56 }}
              transition={{ duration: 0.26, ease: "easeOut" }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, textAlign: "center" }}>{cur.diagnostic}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {chips.map((c) => (
                  <span key={c} style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", padding: "3px 11px", borderRadius: 999, background: "rgba(148,163,184,0.14)", color: "#cbd5e1" }}>
                    {c}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Progress */}
      <div style={{ width: FRAME_W, marginTop: 10 }}>
        <div style={{ height: 8, borderRadius: 999, background: "rgba(148,163,184,0.18)", overflow: "hidden" }}>
          <motion.div animate={{ width: `${pct}%` }} transition={{ ease: "easeOut", duration: 0.3 }} style={{ height: "100%", background: ACCENT, borderRadius: 999 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 14, color: "#94a3b8" }}>
          <span>{tests ? `${done ? tests.length : idx + 1} of ${tests.length}` : "Preparing…"}</span>
          <span>{pass} native · {fail} transcode</span>
        </div>
      </div>

      {done && (
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={onExit}
          style={{ marginTop: 34, borderRadius: 14, background: ACCENT, color: "#04060c", padding: "14px 44px", fontSize: 18, fontWeight: 700, border: "none", cursor: "pointer" }}
        >
          Continue
        </motion.button>
      )}
    </div>
  );
}

const ACCENT = "#4a9fe0";
