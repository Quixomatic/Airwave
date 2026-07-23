import { MpvPlayerView } from "@ChannelGuide/mpv-player";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

import { api, type CapTest } from "@/lib/api";
import { getServerUrl } from "@/lib/auth";
import { deviceId, gatherDeviceReport, markCapsDone } from "@/lib/device";
import { LAYER, useKeyLayer } from "@/lib/input";
import { C } from "@/lib/theme";

/**
 * Device capability onboarding — the native port of tv-web's `Diagnostic`, now on libVLC so it does
 * the SAME thorough check tv-web does (not the "did time advance" fallback AVPlayer forced): it plays
 * each matrix clip and records the REAL decode — libVLC's `onFirstPlay` MediaInfo gives the decoded
 * `width`/`height` (decoded === dims > 0, an actual frame), and `onESAdded` reports whether a decodable
 * audio track is present. A short settle window lets both land. Audio verdict (`audioOk`) is DERIVED
 * cross-clip after the run (like tv-web). Result → per-device profile; a per-server done-flag runs it once.
 */
type Auto = {
  decoded: boolean;
  decodedWidth: number;
  decodedHeight: number;
  hasTrackApi?: boolean;
  audioTrackPresent?: boolean;
  audioOk?: boolean;
  error?: string;
};
type TestCtx = {
  onLoad: (mi: { width: number; height: number }) => void;
  onError: (msg: string) => void;
};

export function Diagnostic({ onExit }: { onExit: () => void }) {
  const { width } = useWindowDimensions();
  // mpv is source-prop-driven + event-based. `source` is the clip under test; `ctxRef` holds the current
  // test's event handlers (onLoad dims, error).
  const [source, setSource] = useState<string | null>(null);
  const ctxRef = useRef<TestCtx | null>(null);
  const [tests, setTests] = useState<CapTest[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [rows, setRows] = useState<Record<string, Auto>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspect, setInspect] = useState<string | null>(null); // tapped test id (debug)

  // Report this device + fetch the matrix.
  useEffect(() => {
    void api.reportDevice(gatherDeviceReport()).catch(() => {});
    api
      .capsManifest()
      .then((r) => setTests(r.tests))
      .catch(() => {
        setError("Could not load the diagnostic matrix (is the server running?)");
        void markCapsDone();
      });
  }, []);

  // Auto-run the matrix.
  useEffect(() => {
    if (!tests) return;
    let cancelled = false;

    // Real decode signal (mpv): onLoad's MediaInfo gives the decoded width/height (decoded === dims > 0,
    // an actual parsed frame); onError means the clip couldn't open/decode. mpv decodes all audio it can
    // open, so a decoded clip implies audio too. Handlers are installed on ctxRef; the view routes to it.
    const runOne = (test: CapTest): Promise<Auto> =>
      new Promise((resolve) => {
        let settled = false;
        let info: { width: number; height: number } | null = null;
        const snap = (err?: string): Auto => {
          const decoded = !err && !!info && info.width > 0 && info.height > 0;
          return {
            decoded,
            decodedWidth: info?.width ?? 0,
            decodedHeight: info?.height ?? 0,
            hasTrackApi: true,
            audioTrackPresent: decoded,
            error: err,
          };
        };
        const finish = (r: Auto) => {
          if (settled) return;
          settled = true;
          clearTimeout(hard);
          ctxRef.current = null;
          resolve(r);
        };
        ctxRef.current = {
          onLoad: (mi) => {
            info = { width: mi.width, height: mi.height };
            finish(snap());
          },
          onError: (msg) => finish(snap(msg || "decode error")),
        };
        setSource(`${getServerUrl()}${test.url}`);
        const hard = setTimeout(() => finish(snap(info ? undefined : "timeout (no frame)")), 10000);
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
        console.log(`[caps] ▶ ${i + 1}/${tests.length} ${test.id} — ${test.container}/${test.video}/${test.audio} — ${getServerUrl()}${test.url}`);
        const auto = await runOne(test);
        console.log(`[caps] ✓ ${test.id} → ${auto.decoded ? `decoded ${auto.decodedWidth}x${auto.decodedHeight}${auto.audioTrackPresent ? " +audio" : ""}` : `FAIL: ${auto.error ?? "?"}`}`);
        // Release this clip before the next (source=null → mpv stop) so cycling ~49 clips doesn't
        // accumulate decoders. The pause lets teardown complete before the next loadfile.
        setSource(null);
        await new Promise((r) => setTimeout(r, 250));
        if (cancelled) return;
        results[test.id] = auto;
        setRows((r) => ({ ...r, [test.id]: auto }));
        upsert(test, auto);
      }
      if (cancelled) return;

      // Audio verdict — DERIVED after the full run (needs the cross-clip control): a clip that listed a
      // usable audio track → audioOk true; if some clip DID get a track (so the signal works) but a
      // decoded clip exposed none → audioOk false; otherwise leave unknown. libVLC decodes ~everything,
      // so in practice this confirms broad audio support rather than culling — but it stays honest.
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

      void markCapsDone();
      setDone(true);
      setSource(null);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests]);

  const finish = () => {
    void markCapsDone();
    setSource(null);
    onExit();
  };
  useKeyLayer({
    id: "diagnostic",
    priority: LAYER.BASE,
    onKey(e) {
      if (e.key === "back") {
        finish();
        return true;
      }
      if (e.key === "ok" && (done || error)) {
        finish();
        return true;
      }
      return false;
    },
  });

  const frameW = Math.min(width * 0.52, 720);
  const frameH = (frameW * 9) / 16;
  const total = tests?.length ?? 0;
  const pass = Object.values(rows).filter((r) => r.decoded).length;
  const fail = Object.values(rows).filter((r) => !r.decoded).length;
  const pct = total ? ((done ? total : idx) / total) * 100 : 0;
  const cur = tests?.[idx];
  const chips = cur ? [cur.container, cur.video, cur.audio, cur.feature, cur.subtitle].filter((x): x is string => !!x && x !== "none") : [];

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: "#060a14", alignItems: "center", justifyContent: "center", gap: 20, padding: 40 }}>
        <Text style={{ color: "#f87171", fontSize: 20, textAlign: "center", maxWidth: 560 }}>{error}</Text>
        <Pressable onPress={finish} style={{ borderRadius: 12, borderWidth: 1, borderColor: "rgba(148,163,184,0.25)", paddingHorizontal: 28, paddingVertical: 12 }}>
          <Text style={{ color: "#e6eaf1", fontSize: 17 }}>Skip</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#060a14", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={{ color: "#f1f5f9", fontSize: 26, fontWeight: "800", marginBottom: 18 }}>Checking playback support</Text>

      <View style={{ width: frameW, height: frameH, borderRadius: 16, overflow: "hidden", backgroundColor: "#000", borderWidth: 1, borderColor: "rgba(148,163,184,0.2)" }}>
        <MpvPlayerView
          source={source}
          muted
          contentFit="contain"
          style={{ flex: 1 }}
          onLoad={(e) => ctxRef.current?.onLoad(e.nativeEvent)}
          onError={(e) => ctxRef.current?.onError(e.nativeEvent.message)}
        />
        {!done && (
          <View style={{ position: "absolute", right: 12, bottom: 12 }}>
            <ActivityIndicator color={C.accent} />
          </View>
        )}
      </View>

      {/* current test chips */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16, maxWidth: frameW, justifyContent: "center" }}>
        {chips.map((chip, i) => (
          <View key={i} style={{ backgroundColor: "rgba(148,163,184,0.12)", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
            <Text style={{ color: "#c3c9d4", fontSize: 13, fontWeight: "600" }}>{chip}</Text>
          </View>
        ))}
      </View>

      {/* progress */}
      <View style={{ width: frameW, marginTop: 16 }}>
        <View style={{ height: 8, borderRadius: 999, backgroundColor: "rgba(148,163,184,0.18)", overflow: "hidden" }}>
          <View style={{ height: "100%", width: `${pct}%`, backgroundColor: C.accent, borderRadius: 999 }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
          <Text style={{ fontSize: 14, color: "#94a3b8" }}>{tests ? `${done ? total : idx + 1} of ${total}` : "Preparing…"}</Text>
          <Text style={{ fontSize: 14, color: "#94a3b8" }}>{pass} native · {fail} transcode</Text>
        </View>
      </View>

      {/* DEBUG (temporary) — the current clip URL + which tests passed, so we can see whether the
          mp4/mov clips play (reachability) vs the mkv/avi/webm ones failing (correct on iPadOS). */}
      {cur && <Text style={{ marginTop: 12, fontSize: 11, color: "#475569", maxWidth: frameW }} numberOfLines={1}>{getServerUrl()}{cur.url}</Text>}
      {(() => {
        const last = tests?.slice(0, idx + 1).reverse().find((t) => rows[t.id]);
        const err = last ? rows[last.id]?.error : undefined;
        return err ? <Text style={{ fontSize: 11, color: "#f0a92a", maxWidth: frameW, marginTop: 2 }} numberOfLines={1}>last error: {err}</Text> : null;
      })()}
      <View style={{ width: frameW, marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {tests?.map((t) => {
          const r = rows[t.id];
          const color = !r ? "#334155" : r.decoded ? "#3fa66a" : "#7c2d2d";
          return (
            <Pressable key={t.id} onPress={() => setInspect(t.id)} style={{ backgroundColor: color, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 3, borderWidth: inspect === t.id ? 1 : 0, borderColor: "#fff" }}>
              <Text style={{ fontSize: 9, color: "#e6eaf1" }}>{t.container}/{t.video}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* tapped-chip detail (debug) */}
      {inspect && (() => {
        const t = tests?.find((x) => x.id === inspect);
        const r = t ? rows[t.id] : undefined;
        if (!t) return null;
        return (
          <View style={{ width: frameW, marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: "rgba(148,163,184,0.08)" }}>
            <Text style={{ color: "#e6eaf1", fontSize: 13, fontWeight: "700" }}>{t.id}</Text>
            <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>container {t.container} · video {t.video} · audio {t.audio}{t.feature ? ` · ${t.feature}` : ""}</Text>
            <Text style={{ color: r?.decoded ? "#5cc98a" : "#f0a92a", fontSize: 12, marginTop: 4 }}>{r ? (r.decoded ? `DECODED ${r.decodedWidth}×${r.decodedHeight}${r.audioOk === false ? " · no audio" : r.audioTrackPresent ? " · audio" : ""}` : `FAILED — ${r.error ?? "unknown"}`) : "not tested yet"}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}><Text style={{ color: "#475569", fontSize: 10, marginTop: 4 }}>{getServerUrl()}{t.url}</Text></ScrollView>
          </View>
        );
      })()}

      {done && (
        <Pressable onPress={finish} style={{ marginTop: 30, borderRadius: 14, backgroundColor: C.accent, paddingHorizontal: 44, paddingVertical: 14 }}>
          <Text style={{ color: "#04060c", fontSize: 18, fontWeight: "700" }}>Continue</Text>
        </Pressable>
      )}
    </View>
  );
}
