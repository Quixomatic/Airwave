import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@airwave/ui/components/badge";
import { Button } from "@airwave/ui/components/button";
import { api, type CapTest } from "../lib/api";
import { deviceId, gatherDeviceReport, markCapsDone } from "../lib/device";
import { getStoredServerUrl } from "../lib/server-url";

/**
 * Device capability onboarding — the desktop port of tv-native's `Diagnostic`. Same thorough check:
 * play each caps-matrix clip and record the REAL decode. Here the decode happens in a THROWAWAY
 * headless mpv instance per clip via the Rust `mpv_probe` command (decoded === decoded dims > 0, a
 * real frame), so — unlike tv-native — there's no live video in the frame (it's a headless
 * measurement); the frame shows a working spinner then a done check. Audio verdict is DERIVED
 * cross-clip after the run (like tv-web/tv-native). Result → per-device server profile; a per-server
 * done-flag runs it once.
 */
type Auto = {
  decoded: boolean;
  decodedWidth: number;
  decodedHeight: number;
  audioTrackPresent?: boolean;
  audioOk?: boolean;
  error?: string;
};
type ProbeResult = { decoded: boolean; width: number; height: number; audio: boolean; error?: string | null };

const PROBE_TIMEOUT_MS = 10000;

export function Diagnostic({ onExit }: { onExit: () => void }) {
  const [tests, setTests] = useState<CapTest[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [rows, setRows] = useState<Record<string, Auto>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Report this device + fetch the matrix.
  useEffect(() => {
    void api.reportDevice(gatherDeviceReport()).catch(() => {});
    api
      .capsManifest()
      .then((r) => setTests(r.tests))
      .catch(() => {
        setError("Could not load the diagnostic matrix (is the server running?)");
        markCapsDone();
      });
  }, []);

  // Auto-run the matrix.
  useEffect(() => {
    if (!tests) return;
    let cancelled = false;
    const base = getStoredServerUrl();

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
          error: r.error,
          ...(audioOk === undefined ? {} : { audioOk }),
        })
        .catch(() => {});

    (async () => {
      const results: Record<string, Auto> = {};
      for (let i = 0; i < tests.length; i++) {
        if (cancelled) return;
        setIdx(i);
        const test = tests[i]!;
        // Each probe is a FRESH headless mpv instance (destroyed when the command returns), so clips
        // don't accumulate decoders — no inter-clip settle needed (tv-native reuses a view, we don't).
        let auto: Auto;
        try {
          const p = await invoke<ProbeResult>("mpv_probe", {
            url: `${base}${test.url}`,
            timeoutMs: PROBE_TIMEOUT_MS,
          });
          auto = {
            decoded: p.decoded,
            decodedWidth: p.width,
            decodedHeight: p.height,
            audioTrackPresent: p.audio,
            error: p.error ?? undefined,
          };
        } catch (e) {
          auto = { decoded: false, decodedWidth: 0, decodedHeight: 0, audioTrackPresent: false, error: String(e) };
        }
        if (cancelled) return;
        results[test.id] = auto;
        setRows((r) => ({ ...r, [test.id]: auto }));
        upsert(test, auto);
      }
      if (cancelled) return;

      // Audio verdict — DERIVED after the full run: a clip that exposed a usable audio track → true; if
      // some clip DID get a track (signal works) but a decoded clip exposed none → false; else unknown.
      const anyTrackPresent = Object.values(results).some((r) => r.audioTrackPresent);
      for (const test of tests) {
        const r = results[test.id];
        if (!r) continue;
        let audioOk: boolean | undefined;
        if (r.audioTrackPresent) audioOk = true;
        else if (anyTrackPresent && r.decoded) audioOk = false;
        if (audioOk === undefined) continue;
        r.audioOk = audioOk;
        setRows((rows) => ({ ...rows, [test.id]: { ...rows[test.id]!, audioOk } }));
        upsert(test, r, audioOk);
      }

      markCapsDone();
      setDone(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [tests]);

  const finish = () => {
    markCapsDone();
    onExit();
  };
  // Esc exits at any point (desktop equivalent of tv-native's Back key-layer).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "Enter" && (done || error)) finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, error]);

  const total = tests?.length ?? 0;
  const pass = Object.values(rows).filter((r) => r.decoded).length;
  const fail = Object.values(rows).filter((r) => !r.decoded).length;
  const pct = total ? ((done ? total : idx) / total) * 100 : 0;
  const cur = tests?.[idx];
  const chips = cur
    ? [cur.container, cur.video, cur.audio, cur.feature, cur.subtitle].filter((x): x is string => !!x && x !== "none")
    : [];

  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-background p-10 text-center text-foreground">
        <p className="max-w-lg text-lg text-destructive">{error}</p>
        <Button variant="outline" onClick={finish}>
          Skip
        </Button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background p-6 text-foreground">
      {/* The "screen" — decorative frame. Headless probe = no live video; shows a spinner then a check. */}
      <div className="relative aspect-video w-[min(52vw,720px)] overflow-hidden rounded-[20px] border border-border bg-black shadow-[0_30px_90px_rgba(0,0,0,0.6)]">
        {!done && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-10 animate-spin text-primary" />
          </div>
        )}
        {done && (
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div
              className="flex size-24 items-center justify-center rounded-full bg-primary"
              style={{ boxShadow: "0 0 40px rgba(59,130,246,0.55)" }}
            >
              <Check size={52} strokeWidth={3} className="text-[#04060c]" />
            </div>
          </motion.div>
        )}
      </div>

      {/* Title */}
      <div className="mt-9 text-center">
        <div className="text-[34px] font-extrabold">{done ? "Setup complete" : "Setting up your TV"}</div>
        <div className="mt-1.5 text-lg text-muted-foreground">
          {done
            ? "We've measured exactly what your TV plays natively."
            : "Checking exactly what your TV can play — just a moment."}
        </div>
      </div>

      {/* The thing being tested — subtle slide-in from the right / slide-away to the left + fade, per
          test (matches tv-web/tv-native). Fixed-height row so incoming/outgoing overlap and crossfade. */}
      <div className="mt-5 h-[74px] w-[min(52vw,720px)]">
        <AnimatePresence mode="popLayout">
          {!done && cur && (
            <motion.div
              key={cur.id}
              initial={{ opacity: 0, x: 56 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -56 }}
              transition={{ duration: 0.26, ease: "easeOut" }}
              className="flex flex-col items-center justify-center gap-2.5"
            >
              <div className="text-center text-[22px] font-bold">{cur.diagnostic}</div>
              <div className="flex flex-row flex-wrap justify-center gap-2">
                {chips.map((chip, i) => (
                  <Badge key={i} variant="secondary" size="lg" className="uppercase tracking-wide">
                    {chip}
                  </Badge>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Progress */}
      <div className="mt-2.5 w-[min(52vw,720px)]">
        <div className="h-2 overflow-hidden rounded-full bg-[rgba(148,163,184,0.18)]">
          <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2.5 flex flex-row justify-between text-sm text-muted-foreground">
          <span>{tests ? `${done ? total : idx + 1} of ${total}` : "Preparing…"}</span>
          <span>
            {pass} native · {fail} transcode
          </span>
        </div>
      </div>

      {done && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-9">
          <Button onClick={finish} size="lg" className="h-14 rounded-xl px-11 text-lg font-bold">
            Continue
          </Button>
        </motion.div>
      )}
    </div>
  );
}
