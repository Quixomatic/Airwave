import { AudioLines, Captions, Gauge, Info, Pause, Play, Radio, RotateCcw, Star, Tv } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import type { GuideChannel } from "@/lib/api";
import { LAYER, useKeyLayer } from "@/lib/input";

import type { useTvPlayer } from "./use-tv-player";

/**
 * The full-screen player's feature panel, ported from tv-web — the DVR scrubber (multi-segment,
 * rewind through the timeline), the control row (Pause/Restart/Surf/Info/Live/Audio/Subs/Quality),
 * and the Info view. Nothing static burns onto the live video; OK opens it, Back peels it (info →
 * menu → close). D-pad nav (row 0 scrubber ⇄ row 1 controls) and touch (tap a control) both drive it.
 */
type Player = ReturnType<typeof useTvPlayer>;
type PickerKey = "audio" | "subtitle" | "quality" | null;

const SEEK = 15;
const CTL_COUNT = 8;

function fmt(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
}

export function FeaturePanel({
  channel,
  player,
  accent,
  quality,
  audioStreamId,
  subtitleStreamId,
  qualities,
  onSelectQuality,
  onSelectAudio,
  onSelectSub,
  onClose,
  onOpenSurf,
}: {
  channel?: GuideChannel;
  player: Player;
  accent: string;
  quality: string;
  audioStreamId?: string;
  subtitleStreamId?: string;
  qualities: { id: string; label: string }[];
  onSelectQuality: (id: string) => void;
  onSelectAudio: (id?: string) => void;
  onSelectSub: (id?: string) => void;
  onClose: () => void;
  onOpenSurf: () => void;
}) {
  const { width } = useWindowDimensions();
  const { status, controls, tracks } = player;
  const g = status.guide;
  const sc = status.scrubber;
  const delivery = status.delivery;

  const [focus, setFocus] = useState<{ row: 0 | 1; col: number }>({ row: 0, col: 0 });
  const [infoMode, setInfoMode] = useState(false);
  const [picker, setPicker] = useState<PickerKey>(null);

  const isEpisode = !!g?.showTitle && g?.season != null && g?.episode != null;
  const title = isEpisode ? g?.showTitle : g?.title;
  const subTitle = isEpisode ? `S${g?.season}, E${g?.episode}${g?.title ? ` · ${g.title}` : ""}` : undefined;

  // Auto-hide the panel after inactivity (tv-web parity).
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (picker) return;
    hideTimer.current = setTimeout(onClose, 8000);
  };
  useEffect(() => {
    armHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker]);

  const activateControl = (col: number) => {
    switch (col) {
      case 0:
        controls.togglePause();
        return;
      case 1:
        controls.restart();
        return;
      case 2:
        onOpenSurf();
        return;
      case 3:
        setInfoMode(true);
        return;
      case 4:
        controls.jumpToLive();
        return;
      case 5:
        setPicker("audio");
        return;
      case 6:
        setPicker("subtitle");
        return;
      case 7:
        setPicker("quality");
        return;
    }
  };

  // Owns the keys while the panel is open (CHROME layer). Back peels info → picker → close.
  useKeyLayer({
    id: "feature-panel",
    priority: LAYER.CHROME,
    onKey(e) {
      if (e.key === "back") {
        if (infoMode) setInfoMode(false);
        else if (picker) setPicker(null);
        else onClose();
        return true;
      }
      armHide();
      if (infoMode || picker) return true; // info/picker own the keys; Back (above) exits them
      if (focus.row === 0) {
        switch (e.key) {
          case "left":
            controls.seekBy(-SEEK);
            return true;
          case "right":
            controls.seekBy(SEEK);
            return true;
          case "ok":
            controls.togglePause();
            return true;
          case "down":
            setFocus({ row: 1, col: 0 });
            return true;
        }
        return true;
      }
      switch (e.key) {
        case "left":
          setFocus((f) => ({ row: 1, col: Math.max(0, f.col - 1) }));
          return true;
        case "right":
          setFocus((f) => ({ row: 1, col: Math.min(CTL_COUNT - 1, f.col + 1) }));
          return true;
        case "up":
          setFocus({ row: 0, col: 0 });
          return true;
        case "ok":
          activateControl(focus.col);
          return true;
      }
      return true;
    },
  });

  const posPct = sc?.thumbPct ?? 0;
  const livePct = sc?.livePct ?? 100;
  const liveInWindow = sc?.liveVisible ?? true;
  const atLive = sc?.atLive ?? true;
  const behind = sc?.behindS ?? 0;
  const scrubFocused = focus.row === 0 && !infoMode && !picker;

  const controlDefs = [
    { icon: status.paused ? Play : Pause, key: "pause" },
    { icon: RotateCcw, key: "restart" },
    { icon: Tv, key: "surf" },
    { icon: Info, key: "info" },
    { icon: Radio, key: "live" },
    { icon: AudioLines, key: "audio" },
    { icon: Captions, key: "subs" },
    { icon: Gauge, key: "quality" },
  ];

  return (
    <LinearGradient colors={["transparent", "rgba(6,10,20,0.4)", "rgba(6,10,20,0.92)"]} locations={[0, 0.35, 0.75]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 96, paddingHorizontal: 56, paddingBottom: 40 }}>
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 40, fontWeight: "800", letterSpacing: -0.5, color: "#f1f5f9" }}>{title}</Text>
        {subTitle && <Text style={{ marginTop: 2, fontSize: 20, color: "#c3c9d4" }}>{subTitle}</Text>}
      </View>

      {infoMode ? (
        <ScrollView style={{ maxHeight: 340 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 16 }}>
            {g?.year != null && <Text style={{ fontSize: 20, color: "#c3c9d4" }}>{g.year}</Text>}
            {g?.contentRating && (
              <View style={{ paddingVertical: 2, paddingHorizontal: 10, borderRadius: 6, backgroundColor: "rgba(148,163,184,0.18)" }}>
                <Text style={{ fontSize: 18, color: "#c3c9d4" }}>{g.contentRating}</Text>
              </View>
            )}
            {g?.criticRating != null && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Star size={18} color="#f0a92a" fill="#f0a92a" />
                <Text style={{ fontSize: 18, color: "#c3c9d4" }}>{g.criticRating.toFixed(1)}</Text>
              </View>
            )}
            {g?.durationMs ? <Text style={{ fontSize: 20, color: "#c3c9d4" }}>{Math.round(g.durationMs / 60000)} min</Text> : null}
          </View>
          {g?.summary && <Text style={{ fontSize: 22, lineHeight: 33, color: "#dfe4ec", maxWidth: 1100 }}>{g.summary}</Text>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 40, marginTop: 24 }}>
            {g?.genres?.length ? <DetailCol label="Genres" value={g.genres.join(", ")} /> : null}
            {g?.cast?.length ? <DetailCol label="Cast" value={g.cast.join(", ")} /> : null}
            {g?.directors?.length ? <DetailCol label="Director" value={g.directors.join(", ")} /> : null}
            {g?.studio ? <DetailCol label="Studio" value={g.studio} /> : null}
          </View>
          {delivery && (
            <Text style={{ marginTop: 20, fontSize: 14, color: "#64748b" }}>
              {delivery.mode.toUpperCase()} · {[delivery.container, delivery.videoCodec, delivery.audioCodec].filter(Boolean).join("/")}
              {delivery.connection ? ` · ${delivery.connection}` : ""}
            </Text>
          )}
          <Text style={{ marginTop: 20, fontSize: 15, color: "#64748b" }}>Press Back to return</Text>
        </ScrollView>
      ) : (
        <>
          {/* scrubber */}
          <Pressable onPress={() => controls.togglePause()} style={{ paddingTop: 6, paddingBottom: 4 }}>
            <View style={{ position: "relative", height: 8, width: "100%" }}>
              {sc?.segments.map((seg, i) => (
                <View key={i} style={{ position: "absolute", top: 0, height: 8, left: `${seg.leftPct}%`, width: `${Math.max(0, seg.widthPct)}%`, paddingHorizontal: 2 }}>
                  <View style={{ flex: 1, borderRadius: 999, overflow: "hidden", backgroundColor: seg.kind === "BUMPER" ? "rgba(148,163,184,0.30)" : "rgba(255,255,255,0.18)" }}>
                    {seg.fillPct > 0 && <View style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${seg.fillPct}%`, backgroundColor: accent }} />}
                  </View>
                </View>
              ))}
              {liveInWindow && <View style={{ position: "absolute", top: -4, left: `${livePct}%`, width: 2, height: 16, backgroundColor: "#ef4444" }} />}
              <View style={{ position: "absolute", top: 4, left: `${posPct}%`, width: scrubFocused ? 24 : 16, height: scrubFocused ? 24 : 16, borderRadius: 12, marginLeft: scrubFocused ? -12 : -8, marginTop: scrubFocused ? -12 : -8, backgroundColor: "#fff", borderWidth: scrubFocused ? 4 : 0, borderColor: accent }} />
            </View>
            <View style={{ position: "relative", height: 26, marginTop: 10, width: "100%" }}>
              <Text style={{ position: "absolute", left: `${posPct}%`, fontSize: 17, fontWeight: "600", color: scrubFocused ? "#f1f5f9" : "#c3c9d4" }}>{fmt(sc?.slotPositionS ?? 0)}</Text>
              <Pressable onPress={() => controls.jumpToLive()} style={{ position: "absolute", right: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: atLive ? "#ef4444" : "#64748b" }} />
                <Text style={{ fontSize: 15, fontWeight: "700", letterSpacing: 0.5, color: atLive ? "#ef4444" : "#94a3b8" }}>{atLive ? "LIVE" : `-${fmt(behind)}`}</Text>
              </Pressable>
            </View>
          </Pressable>

          {/* controls */}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 18 }}>
            {controlDefs.map((c, i) => {
              const Icon = c.icon;
              const f = focus.row === 1 && focus.col === i && !picker;
              return (
                <Pressable key={c.key} onPress={() => activateControl(i)} style={{ width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: f ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.12)", backgroundColor: f ? "rgba(59,130,246,0.28)" : "rgba(18,24,38,0.55)" }}>
                  <Icon size={24} color="#f1f5f9" />
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* pickers */}
      <PickerModal
        open={picker !== null}
        title={picker === "audio" ? "Audio" : picker === "subtitle" ? "Subtitles" : "Quality"}
        items={
          picker === "audio"
            ? [{ value: "", label: "Default" }, ...tracks.audio.map((t) => ({ value: t.id, label: t.label }))]
            : picker === "subtitle"
              ? [{ value: "off", label: "Off" }, ...tracks.subtitle.map((t) => ({ value: t.id, label: t.label }))]
              : qualities.map((q) => ({ value: q.id, label: q.label }))
        }
        current={picker === "audio" ? audioStreamId ?? "" : picker === "subtitle" ? subtitleStreamId ?? "off" : quality}
        onPick={(v) => {
          if (picker === "audio") onSelectAudio(v || undefined);
          else if (picker === "subtitle") onSelectSub(v);
          else onSelectQuality(v);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        accent={accent}
      />
    </LinearGradient>
  );
}

function DetailCol({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ maxWidth: 360 }}>
      <Text style={{ fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontSize: 17, color: "#dfe4ec" }}>{value}</Text>
    </View>
  );
}

function PickerModal({ open, title, items, current, onPick, onClose, accent }: { open: boolean; title: string; items: { value: string; label: string }[]; current: string; onPick: (v: string) => void; onClose: () => void; accent: string }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
        <View style={{ minWidth: 320, maxHeight: "70%", borderRadius: 16, backgroundColor: "#0b1120", borderWidth: 1, borderColor: "rgba(148,163,184,0.2)", overflow: "hidden" }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#94a3b8", padding: 16 }}>{title}</Text>
          <ScrollView>
            {items.map((it) => (
              <Pressable key={it.value} onPress={() => onPick(it.value)} style={{ paddingVertical: 14, paddingHorizontal: 18, backgroundColor: it.value === current ? "rgba(74,159,224,0.14)" : "transparent" }}>
                <Text style={{ fontSize: 18, color: it.value === current ? accent : "#f1f5f9" }}>{it.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}
