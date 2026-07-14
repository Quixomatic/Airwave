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
        const v = videoRef.current;
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
          return {
            decoded: !err && v.videoWidth > 0 && v.videoHeight > 0,
            decodedWidth: v.videoWidth,
            decodedHeight: v.videoHeight,
            droppedFrames: q?.droppedVideoFrames,
            totalFrames: q?.totalVideoFrames,
            error: err,
          };
        };
        // First decoded frame → let it play ~2.5s (to catch dropped-frame stutter), then record.
        const onLoaded = () => window.setTimeout(() => finish(snap()), 2500);
        const onErr = () => finish(snap(`decode error ${v.error?.code ?? "?"}`));
        const hard = window.setTimeout(() => finish(snap(v.videoWidth > 0 ? undefined : "timeout (no frame)")), 10000);
        v.addEventListener("loadeddata", onLoaded);
        v.addEventListener("error", onErr);
        v.muted = true; // muted → autoplay is never blocked; we only care about video decode
        v.src = `${SERVER_URL}${test.url}`;
        void v.play().catch(() => {});
      });

    (async () => {
      for (let i = 0; i < tests.length; i++) {
        if (cancelled) return;
        setIdx(i);
        const test = tests[i];
        const auto = await runOne(test);
        if (cancelled) return;
        setRows((r) => ({ ...r, [test.id]: auto }));
        void api
          .capsResult({
            deviceId: deviceId(),
            testId: test.id,
            container: test.container,
            video: test.video,
            audio: test.audio,
            feature: test.feature,
            subtitle: test.subtitle,
            ...auto,
          })
          .catch(() => {});
      }
      if (!cancelled) {
        localStorage.setItem(CAPS_DONE_KEY, "1");
        setDone(true);
        videoRef.current?.pause();
      }
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
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-black p-10 text-center">
        <p className="text-red-400">{error}</p>
        <button onClick={onExit} className="rounded-lg border border-zinc-700 px-6 py-2">
          Skip
        </button>
      </div>
    );
  }

  const cur = tests?.[idx];
  const pass = tests ? Object.values(rows).filter((r) => r.decoded).length : 0;
  const fail = tests ? Object.values(rows).filter((r) => !r.decoded).length : 0;

  return (
    <div className="relative h-full w-full bg-black">
      <video ref={videoRef} className="h-full w-full object-contain opacity-90" playsInline muted />

      {/* Header / progress */}
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/90 to-transparent p-6">
        <div className="text-2xl font-semibold text-white">
          {done ? "Setup complete" : "Setting up your TV"}
        </div>
        <div className="text-zinc-400">
          {done
            ? "We've measured what your TV plays natively."
            : "Testing exactly what your TV can play — this takes a minute."}
        </div>
        {tests && (
          <div className="mt-3 h-2 w-full overflow-hidden rounded bg-zinc-800">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${((done ? tests.length : idx) / tests.length) * 100}%` }}
            />
          </div>
        )}
        <div className="mt-1 font-mono text-sm text-zinc-400">
          {tests ? `${done ? tests.length : idx + 1}/${tests.length}` : "…"} · {pass} play · {fail} fail
          {cur && !done ? ` · now: ${cur.diagnostic}` : ""}
        </div>
      </div>

      {/* Results grid */}
      <div className="absolute inset-x-0 bottom-0 max-h-[55%] overflow-y-auto bg-gradient-to-t from-black to-transparent p-6">
        <div className="grid grid-cols-3 gap-x-6 gap-y-1 font-mono text-xs">
          {tests?.map((tt, i) => {
            const r = rows[tt.id];
            return (
              <div
                key={tt.id}
                className={`flex items-center gap-2 rounded px-1 ${i === idx && !done ? "bg-amber-400/20" : ""}`}
              >
                <span>{r ? (r.decoded ? "✅" : "❌") : i === idx && !done ? "▶" : "·"}</span>
                <span className="truncate text-zinc-400">{tt.id}</span>
                {r?.decoded && (
                  <span className="ml-auto text-zinc-600">
                    {r.decodedWidth}×{r.decodedHeight}
                    {r.droppedFrames ? ` ↓${r.droppedFrames}` : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {done && (
        <div className="absolute bottom-6 right-6">
          <button
            onClick={onExit}
            className="rounded-lg bg-amber-500 px-8 py-3 text-lg font-semibold text-black"
          >
            Continue ▶
          </button>
        </div>
      )}
    </div>
  );
}
