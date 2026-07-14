import { useCallback, useEffect, useRef, useState } from "react";

import { api, type CapTest } from "../../lib/api";
import { SERVER_URL } from "../../lib/auth-client";
import { deviceId } from "../../lib/device";

type Auto = {
  decoded: boolean;
  decodedWidth: number;
  decodedHeight: number;
  droppedFrames?: number;
  totalFrames?: number;
  error?: string;
};
type Manual = { audioOk?: boolean; hdrOk?: boolean; subtitleOk?: boolean };
type Row = { auto?: Auto; manual: Manual };

/**
 * Visual capability diagnostic. Plays each matrix clip full-screen via native
 * <video>, auto-detects decode + dropped frames, and prompts a 👍/👎 for the
 * subjective axes (audio present? HDR triggered? subs shown?) that JS can't see.
 * User-paced: watch each, mark it, press Next. Everything → DeviceCapability.
 */
export function Diagnostic({ onExit }: { onExit: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tests, setTests] = useState<CapTest[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [auto, setAuto] = useState<Auto | null>(null);
  const [manual, setManual] = useState<Manual>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .capsManifest()
      .then((r) => setTests(r.tests))
      .catch(() => setError("Could not load the diagnostic matrix (is the server running?)"));
  }, []);

  const test = tests?.[idx];

  // Play the current test + capture auto metrics.
  useEffect(() => {
    if (!test) return;
    setAuto(null);
    setManual({});
    const v = videoRef.current;
    if (!v) return;
    let settled = false;
    const capture = (err?: string) => {
      if (settled) return;
      settled = true;
      const q = v.getVideoPlaybackQuality?.();
      setAuto({
        decoded: !err && v.videoWidth > 0 && v.videoHeight > 0,
        decodedWidth: v.videoWidth,
        decodedHeight: v.videoHeight,
        droppedFrames: q?.droppedVideoFrames,
        totalFrames: q?.totalVideoFrames,
        error: err,
      });
    };
    const onError = () => capture(`video error ${v.error?.code ?? "?"}`);
    v.addEventListener("error", onError);
    v.src = `${SERVER_URL}${test.url}`;
    void v.play().catch(() => {});
    const timer = window.setTimeout(() => capture(), 4500);
    return () => {
      window.clearTimeout(timer);
      v.removeEventListener("error", onError);
    };
  }, [test]);

  const advance = useCallback(() => {
    if (!test) return;
    setRows((r) => ({ ...r, [test.id]: { auto: auto ?? undefined, manual } }));
    void api
      .capsResult({
        deviceId: deviceId(),
        testId: test.id,
        container: test.container,
        video: test.video,
        audio: test.audio,
        feature: test.feature,
        subtitle: test.subtitle,
        ...(auto ?? {}),
        ...manual,
      })
      .catch(() => {});
    if (idx + 1 >= (tests?.length ?? 0)) {
      setDone(true);
      videoRef.current?.pause();
    } else {
      setIdx(idx + 1);
    }
  }, [test, auto, manual, idx, tests]);

  // Remote: → / OK advance, Back exits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.keyCode === 461 || e.key === "Backspace" || e.key === "XF86Back") {
        e.preventDefault();
        e.stopPropagation();
        videoRef.current?.pause();
        onExit();
      } else if ((e.key === "ArrowRight" || e.key === "Enter") && !done) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [advance, onExit, done]);

  const flag = (r?: Row) => {
    if (!r) return "·";
    if (r.auto?.error || r.auto?.decoded === false) return "❌";
    const m = r.manual;
    if (m.audioOk === false || m.hdrOk === false || m.subtitleOk === false) return "⚠️";
    return "✅";
  };

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-black p-10 text-center">
        <p className="text-red-400">{error}</p>
        <button onClick={onExit} className="rounded-lg border border-zinc-700 px-4 py-2">
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black">
      <video ref={videoRef} className="h-full w-full object-contain" playsInline autoPlay />

      {/* Live results list */}
      <div className="absolute right-0 top-0 h-full w-80 overflow-y-auto bg-black/80 p-3 font-mono text-xs">
        <div className="mb-2 font-bold text-zinc-300">
          Diagnostic {tests ? `${idx + 1}/${tests.length}` : "…"}
        </div>
        {tests?.map((tt, i) => (
          <div
            key={tt.id}
            className={`flex items-center gap-2 rounded px-1 py-0.5 ${i === idx ? "bg-amber-400/20" : ""}`}
          >
            <span>{flag(rows[tt.id])}</span>
            <span className="truncate text-zinc-400">{tt.id}</span>
            {rows[tt.id]?.auto?.decoded && (
              <span className="ml-auto text-zinc-600">
                {rows[tt.id].auto!.decodedWidth}×{rows[tt.id].auto!.decodedHeight}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Current test HUD */}
      {test && !done && (
        <div className="absolute bottom-0 left-0 w-[calc(100%-20rem)] bg-gradient-to-t from-black to-transparent p-6 font-mono">
          <div className="text-lg font-semibold text-white">
            {test.diagnostic} <span className="text-zinc-500">({test.category})</span>
          </div>
          <div className="text-sm text-zinc-400">
            {test.container} · {test.video} · {test.audio}
            {test.feature ? ` · ${test.feature}` : ""}
            {test.realSample ? " · real-sample" : ""}
          </div>
          <div className={`mt-1 text-sm ${auto?.decoded ? "text-green-400" : "text-red-400"}`}>
            {auto
              ? auto.decoded
                ? `▶ decoding ${auto.decodedWidth}×${auto.decodedHeight}${auto.droppedFrames ? ` · dropped ${auto.droppedFrames}` : ""}`
                : `✖ ${auto.error ?? "not decoding"}`
              : "testing…"}
          </div>

          {/* Manual verdicts for subjective axes */}
          {test.manual.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-4">
              {test.manual.map((axis) => {
                const key = `${axis}Ok` as keyof Manual;
                const val = manual[key];
                return (
                  <div key={axis} className="flex items-center gap-2">
                    <span className="text-zinc-300 capitalize">{axis}?</span>
                    <button
                      onClick={() => setManual((m) => ({ ...m, [key]: true }))}
                      className={`rounded px-3 py-1 ${val === true ? "bg-green-500 text-black" : "bg-zinc-800"}`}
                    >
                      👍
                    </button>
                    <button
                      onClick={() => setManual((m) => ({ ...m, [key]: false }))}
                      className={`rounded px-3 py-1 ${val === false ? "bg-red-500 text-black" : "bg-zinc-800"}`}
                    >
                      👎
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={advance}
              className="rounded-lg bg-amber-500 px-6 py-2 font-semibold text-black"
            >
              Next ▶ (OK)
            </button>
            <span className="text-xs text-zinc-500">Back = exit</span>
          </div>
        </div>
      )}

      {done && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 text-center">
          <p className="text-3xl font-semibold">Diagnostic complete</p>
          <p className="text-zinc-400">
            {Object.values(rows).filter((r) => r.auto?.decoded).length} decoded ·{" "}
            {Object.values(rows).filter((r) => r.auto?.decoded === false || r.auto?.error).length}{" "}
            failed · {tests?.length} total — saved to your device record.
          </p>
          <button onClick={onExit} className="rounded-lg bg-amber-500 px-6 py-2 font-semibold text-black">
            Done
          </button>
        </div>
      )}
    </div>
  );
}
