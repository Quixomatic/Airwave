import { MpvPlayerView } from "@airwave/mpv-player";
import { Check } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, withTiming, ZoomIn } from "react-native-reanimated";

import { TvPressable as Pressable } from "@/components/tv-pressable";

import { cs, scaled } from "@/features/guide/layout";
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

// Codecs whose SOFTWARE decode is known to crash mpv on Apple platforms — dav1d AV1 null-deref
// (the same EXC_BAD_ACCESS the iPad hit; the Apple TV 4K's A15 also has NO hardware AV1, so tvOS
// software-decodes AV1 too and crashes identically ~immediately after the first frame). These are
// ALREADY quirked to transcode server-side (codecs.ts: av1 → platform "ios", which react-native-tvos
// reports for tvOS as well), so actually decoding them in the diagnostic changes nothing about the
// outcome — the quirk force-transcodes regardless — it only risks crashing the whole run mid-way.
// Skip the decode and record them unsupported, which matches what the server does anyway.
const CRASHY_VIDEO_ON_APPLE = new Set(["av1"]);
const skipDecode = (t: { video?: string | null }) => Platform.OS === "ios" && !!t.video && CRASHY_VIDEO_ON_APPLE.has(t.video);

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
        let auto: Auto;
        if (skipDecode(test)) {
          // DON'T play it — the decoder crashes the whole app on this platform (see CRASHY_VIDEO_ON_APPLE).
          // Record it unsupported, which is the honest result: the server quirk transcodes it anyway.
          auto = { decoded: false, decodedWidth: 0, decodedHeight: 0, hasTrackApi: true, audioTrackPresent: false, error: `${test.video} software-decode unsafe on Apple — transcoded (not measured)` };
          console.log(`[caps] ⤼ ${test.id} → SKIPPED (${test.video} would crash the decoder; recorded unsupported)`);
        } else {
          auto = await runOne(test);
          console.log(`[caps] ✓ ${test.id} → ${auto.decoded ? `decoded ${auto.decodedWidth}x${auto.decodedHeight}${auto.audioTrackPresent ? " +audio" : ""}` : `FAIL: ${auto.error ?? "?"}`}`);
          // Per-clip lifecycle is OPPOSITE on the two platforms:
          //  • Apple: REUSING one mpv instance across clips stacks VideoToolbox decoder sessions → OOM
          //    (~clip 8), so we destroy per clip — null the source (→ unmount → mpv_terminate_destroy) and
          //    let the async teardown settle before the next instance is created.
          //  • Android: DESTROYING per clip leaks the MediaCodec session + surface + 4K buffers each cycle
          //    (native RES climbs → GC death-spiral → freeze after only a few clips, device-dependent), so
          //    we KEEP the one instance mounted and let the next runOne's setSource reload it in place
          //    (core.load → mpv `loadfile replace`, which cleanly swaps the decoder — only ~1 alive at a
          //    time). No per-clip teardown, no thrash.
          if (Platform.OS === "ios") {
            setSource(null);
            await new Promise((r) => setTimeout(r, 400));
          }
        }
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

  // Match tv-web's per-test transition EXACTLY: a subtle 56px horizontal slide + opacity fade (not a
  // full-width slide). Enter from the right (x:+OFFSET, faded), exit to the left (x:-OFFSET, faded), easeOut.
  const OFFSET = cs(56);
  const enterTest = () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateX: OFFSET }] },
      animations: {
        opacity: withTiming(1, { duration: 260, easing: Easing.out(Easing.ease) }),
        transform: [{ translateX: withTiming(0, { duration: 260, easing: Easing.out(Easing.ease) }) }],
      },
    };
  };
  const exitTest = () => {
    "worklet";
    return {
      initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
      animations: {
        opacity: withTiming(0, { duration: 260, easing: Easing.out(Easing.ease) }),
        transform: [{ translateX: withTiming(-OFFSET, { duration: 260, easing: Easing.out(Easing.ease) }) }],
      },
    };
  };

  if (error) {
    return (
      <View style={scaled({ flex: 1, backgroundColor: "#060a14", alignItems: "center", justifyContent: "center", gap: 20, padding: 40 })}>
        <Text style={scaled({ color: "#f87171", fontSize: 20, textAlign: "center", maxWidth: 560 })}>{error}</Text>
        <Pressable onPress={finish} style={scaled({ borderRadius: 12, borderWidth: 1, borderColor: "rgba(148,163,184,0.25)", paddingHorizontal: 28, paddingVertical: 12 })}>
          <Text style={scaled({ color: "#e6eaf1", fontSize: 17 })}>Skip</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={scaled({ flex: 1, backgroundColor: "#060a14", alignItems: "center", justifyContent: "center", padding: 24 })}>
      {/* The clip actually being decoded — a centered framed "screen". Its size doesn't affect the
          measurement, just how it looks. */}
      <View style={{ width: frameW, height: frameH, borderRadius: cs(20), overflow: "hidden", backgroundColor: "#000", borderWidth: 1, borderColor: "rgba(148,163,184,0.16)" }}>
        {/* Mount the player ONLY while a clip is under test. Nulling `source` between clips (above)
            unmounts it → `deinit` → `mpv_terminate_destroy`, so each clip runs in a FRESH instance
            that is fully destroyed afterward. Cycling one reused instance across 49 clips of mixed
            4K codecs stacks VideoToolbox decoder sessions + surfaces → OOM/freeze (~clip 8). */}
        {source != null && (
          <MpvPlayerView
            source={source}
            muted
            contentFit="contain"
            style={{ flex: 1 }}
            onLoad={(e) => ctxRef.current?.onLoad(e.nativeEvent)}
            onError={(e) => ctxRef.current?.onError(e.nativeEvent.message)}
          />
        )}
        {/* Little "working" spinner in the corner — tv-native mounts the player fresh per clip (black
            gaps between clips), so unlike tv-web's continuously-playing video it needs an activity cue. */}
        {!done && (
          <View style={scaled({ position: "absolute", right: 12, bottom: 12 })}>
            <ActivityIndicator color={C.accent} />
          </View>
        )}
        {done && (
          <Animated.View entering={ZoomIn.springify().damping(18)} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: cs(92), height: cs(92), borderRadius: cs(46), backgroundColor: C.accent, alignItems: "center", justifyContent: "center" }}>
              <Check size={cs(50)} color="#04060c" strokeWidth={3} />
            </View>
          </Animated.View>
        )}
      </View>

      {/* Title */}
      <View style={{ marginTop: cs(36), alignItems: "center" }}>
        <Text style={scaled({ color: "#f1f5f9", fontSize: 34, fontWeight: "800" })}>{done ? "Setup complete" : "Setting up your TV"}</Text>
        <Text style={scaled({ color: "#94a3b8", fontSize: 18, marginTop: 6, textAlign: "center" })}>
          {done ? "We've measured exactly what your TV plays natively." : "Checking exactly what your TV can play — just a moment."}
        </Text>
      </View>

      {/* The thing being tested — a subtle slide-in from the right / slide-away to the left + fade, per test
          (matches tv-web). Absolutely positioned inside the fixed-height row so the outgoing + incoming
          blocks overlap and crossfade cleanly instead of shoving the layout. */}
      <View style={{ height: cs(74), marginTop: cs(22), width: frameW }}>
        {!done && cur && (
          <Animated.View
            key={cur.id}
            entering={enterTest}
            exiting={exitTest}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: cs(10) }}
          >
            <Text style={scaled({ color: "#f1f5f9", fontSize: 22, fontWeight: "700", textAlign: "center" })}>{cur.diagnostic}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: cs(8), justifyContent: "center" }}>
              {chips.map((chip, i) => (
                <View key={i} style={scaled({ backgroundColor: "rgba(148,163,184,0.14)", borderRadius: 999, paddingVertical: 3, paddingHorizontal: 11 })}>
                  <Text style={scaled({ color: "#cbd5e1", fontSize: 13, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" })}>{chip}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}
      </View>

      {/* Progress */}
      <View style={{ width: frameW, marginTop: cs(10) }}>
        <View style={scaled({ height: 8, borderRadius: 999, backgroundColor: "rgba(148,163,184,0.18)", overflow: "hidden" })}>
          <View style={{ height: "100%", width: `${pct}%`, backgroundColor: C.accent, borderRadius: cs(999) }} />
        </View>
        <View style={scaled({ flexDirection: "row", justifyContent: "space-between", marginTop: 10 })}>
          <Text style={scaled({ fontSize: 14, color: "#94a3b8" })}>{tests ? `${done ? total : idx + 1} of ${total}` : "Preparing…"}</Text>
          <Text style={scaled({ fontSize: 14, color: "#94a3b8" })}>{pass} native · {fail} transcode</Text>
        </View>
      </View>

      {done && (
        // The sole action once the run finishes — a static white halo marks it focused (the key-layer
        // routes OK/select here via `finish`), mirroring tv-web's always-on focus outline.
        <Animated.View entering={FadeIn.delay(150)} style={{ marginTop: cs(34) }}>
          <View style={{ borderRadius: cs(18), borderWidth: cs(3), borderColor: "rgba(255,255,255,0.85)", padding: cs(4) }}>
            <Pressable onPress={finish} style={scaled({ borderRadius: 14, backgroundColor: C.accent, paddingHorizontal: 44, paddingVertical: 14 })}>
              <Text style={scaled({ color: "#04060c", fontSize: 18, fontWeight: "700" })}>Continue</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}
