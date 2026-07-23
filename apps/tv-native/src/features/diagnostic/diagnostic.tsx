import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

import { api, type CapTest } from "@/lib/api";
import { getServerUrl } from "@/lib/auth";
import { deviceId, gatherDeviceReport, markCapsDone } from "@/lib/device";
import { LAYER, useKeyLayer } from "@/lib/input";
import { C } from "@/lib/theme";

/**
 * Device capability onboarding — the native port of tv-web's `Diagnostic`. Plays each capability
 * clip through expo-video and records whether it reaches ready-to-play (decodes) or errors. Same
 * flow + appearance as tv-web; the measurement differs by necessity — AVPlayer/ExoPlayer don't
 * expose decoded-frame counts, so "reached readyToPlay without erroring" is the decode signal (which
 * is exactly what confirms iPadOS drops the un-decodable containers → HLS). Result → the server's
 * per-device profile; a per-server done-flag so it runs once on first sign-in.
 */
type Auto = { decoded: boolean; error?: string };

export function Diagnostic({ onExit }: { onExit: () => void }) {
  const { width } = useWindowDimensions();
  const player = useVideoPlayer(null, (p) => {
    p.muted = true;
  });
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

    // Ground-truth decode signal: does playback actually advance? If the clip decodes, currentTime
    // moves; an unsupported codec/container errors (status "error") or never advances (timeout).
    const played = () => {
      try {
        return player.currentTime > 0.4;
      } catch {
        return false;
      }
    };
    const runOne = (test: CapTest): Promise<Auto> =>
      new Promise((resolve) => {
        let settled = false;
        const finish = (r: Auto) => {
          if (settled) return;
          settled = true;
          clearInterval(poll);
          clearTimeout(hard);
          resolve(r);
        };
        // replaceAsync (not the deprecated sync replace) — and its rejection tells us a clip
        // genuinely failed to LOAD (404 / Range / unreachable) vs failed to DECODE.
        player
          .replaceAsync({ uri: `${getServerUrl()}${test.url}` })
          .then(() => player.play())
          .catch((e: unknown) => finish({ decoded: false, error: `load: ${e instanceof Error ? e.message : "failed"}` }));
        const poll = setInterval(() => {
          try {
            if (player.status === "error") return finish({ decoded: false, error: "decode error" });
            if (played()) return finish({ decoded: true });
          } catch {
            /* keep polling */
          }
        }, 250);
        const hard = setTimeout(() => finish({ decoded: played(), error: played() ? undefined : "timeout (no frame)" }), 8000);
      });

    const upsert = (test: CapTest, r: Auto) =>
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
          decodedWidth: 0,
          decodedHeight: 0,
          error: r.error,
        })
        .catch(() => {});

    (async () => {
      for (let i = 0; i < tests.length; i++) {
        if (cancelled) return;
        setIdx(i);
        const test = tests[i]!;
        const auto = await runOne(test);
        if (cancelled) return;
        setRows((r) => ({ ...r, [test.id]: auto }));
        upsert(test, auto);
      }
      if (cancelled) return;
      void markCapsDone();
      setDone(true);
      player.pause();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests]);

  const finish = () => {
    void markCapsDone();
    player.pause();
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
        <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls={false} />
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
            <Text style={{ color: r?.decoded ? "#5cc98a" : "#f0a92a", fontSize: 12, marginTop: 4 }}>{r ? (r.decoded ? "DECODED (native)" : `FAILED — ${r.error ?? "unknown"}`) : "not tested yet"}</Text>
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
