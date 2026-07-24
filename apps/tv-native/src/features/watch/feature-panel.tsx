import { AudioLines, Captions, Check, Clapperboard, Info, Pause, Play, Radio, RotateCcw, SlidersHorizontal, Star, Tv } from "lucide-react-native";
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

import type { GuideChannel } from "@/lib/api";
import { hexA } from "@/features/guide/layout";
import { LAYER, useKeyLayer } from "@/lib/input";

import type { Delivery, useTvPlayer } from "./use-tv-player";

/**
 * The full-screen player's feature panel, ported from tv-web — the DVR scrubber (multi-segment,
 * rewind through the timeline), the control row (Pause/Restart/Surf/Info/Live/Audio/Subs/Quality),
 * and the Info view. Nothing static burns onto the live video; OK opens it, Back peels it (info →
 * menu → close). D-pad nav (row 0 scrubber ⇄ row 1 controls) and touch (tap a control) both drive it.
 */
type Player = ReturnType<typeof useTvPlayer>;
type PickerKey = "audio" | "subtitle" | "quality" | null;

const SEEK = 10;
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
  const { status, controls, tracks } = player;
  const g = status.guide;
  const sc = status.scrubber;
  const delivery = status.delivery;

  const [focus, setFocus] = useState<{ row: 0 | 1; col: number }>({ row: 0, col: 0 });
  const [infoMode, setInfoMode] = useState(false);
  const [picker, setPicker] = useState<PickerKey>(null);
  const [pickerSel, setPickerSel] = useState(0);

  // Items + current value for whichever picker is open — shared by the modal render and the D-pad nav.
  const pickerItems =
    picker === "audio"
      ? [{ value: "", label: "Default" }, ...tracks.audio.map((t) => ({ value: t.id, label: t.label }))]
      : picker === "subtitle"
        ? [{ value: "off", label: "Off" }, ...tracks.subtitle.map((t) => ({ value: t.id, label: t.label }))]
        : picker === "quality"
          ? qualities.map((q) => ({ value: q.id, label: q.label }))
          : [];
  const pickerCurrent = picker === "audio" ? audioStreamId ?? "" : picker === "subtitle" ? subtitleStreamId ?? "off" : quality;
  const pickerTitle = picker === "audio" ? "Audio" : picker === "subtitle" ? "Subtitles" : "Quality";
  const applyPick = (v: string) => {
    if (picker === "audio") onSelectAudio(v || undefined);
    else if (picker === "subtitle") onSelectSub(v);
    else if (picker === "quality") onSelectQuality(v);
    setPicker(null);
  };
  // When a picker opens, focus its current selection.
  useEffect(() => {
    if (!picker) return;
    const idx = pickerItems.findIndex((it) => it.value === pickerCurrent);
    setPickerSel(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker]);

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
      // Picker open — D-pad/keyboard navigates the list (Back, handled above, closes it).
      if (picker) {
        if (e.key === "up") {
          setPickerSel((s) => Math.max(0, s - 1));
          return true;
        }
        if (e.key === "down") {
          setPickerSel((s) => Math.min(pickerItems.length - 1, s + 1));
          return true;
        }
        if (e.key === "ok") {
          const it = pickerItems[pickerSel];
          if (it) applyPick(it.value);
          return true;
        }
        return true;
      }
      if (infoMode) return true; // details view owns the keys; Back (above) exits it
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

  const ctlFocused = (i: number) => focus.row === 1 && focus.col === i && !picker && !infoMode;

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
          {delivery && <DeliveryReadout delivery={delivery} accent={accent} />}
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

          {/* controls — 5 pill buttons (icon + label), then the 3 circle selectors pushed right */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20 }}>
            <Ctl icon={status.paused ? Play : Pause} label={status.paused ? "Play" : "Pause"} focused={ctlFocused(0)} onPress={() => activateControl(0)} />
            <Ctl icon={RotateCcw} label="Restart" dim={!status.canRestart} focused={ctlFocused(1)} onPress={() => activateControl(1)} />
            <Ctl icon={Tv} label="Channel Surf" focused={ctlFocused(2)} onPress={() => activateControl(2)} />
            <Ctl icon={Info} label="Info" focused={ctlFocused(3)} onPress={() => activateControl(3)} />
            <Ctl icon={atLive ? Clapperboard : Radio} label={atLive ? "Continue Watching" : "Jump to Live"} focused={ctlFocused(4)} onPress={() => activateControl(4)} />
            <View style={{ marginLeft: "auto", flexDirection: "row", gap: 12 }}>
              <Ctl icon={AudioLines} focused={ctlFocused(5)} onPress={() => activateControl(5)} />
              <Ctl icon={Captions} focused={ctlFocused(6)} onPress={() => activateControl(6)} />
              <Ctl icon={SlidersHorizontal} focused={ctlFocused(7)} onPress={() => activateControl(7)} />
            </View>
          </View>
        </>
      )}

      {/* picker — a centered glass modal (same treatment as channel-number entry): scrollable, D-pad /
          keyboard navigable (up/down move focus, OK selects, Back closes), and touch. */}
      {picker !== null && (
        <PickerModal
          title={pickerTitle}
          items={pickerItems}
          current={pickerCurrent}
          sel={pickerSel}
          onPick={applyPick}
          onClose={() => setPicker(null)}
          accent={accent}
        />
      )}
    </LinearGradient>
  );
}

/** A control: a pill (icon + label) when `label` is given, else a circle icon button. */
function Ctl({ icon: Icon, label, focused, dim, onPress }: { icon: ComponentType<{ size?: number; color?: string }>; label?: string; focused: boolean; dim?: boolean; onPress: () => void }) {
  const circle = !label;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: circle ? 0 : 9,
        height: 54,
        width: circle ? 54 : undefined,
        paddingHorizontal: circle ? 0 : 20,
        borderRadius: circle ? 27 : 999,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: focused ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.12)",
        backgroundColor: focused ? "rgba(59,130,246,0.28)" : "rgba(18,24,38,0.55)",
        opacity: dim ? 0.4 : 1,
      }}
    >
      <Icon size={24} color="#f1f5f9" />
      {label && <Text style={{ fontSize: 17, fontWeight: "600", color: "#f1f5f9" }}>{label}</Text>}
    </Pressable>
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

const MODE_LABEL: Record<Delivery["mode"], string> = {
  direct: "Direct Play",
  http: "Progressive Transcode",
  hls: "HLS Transcode",
};
const CONN_LABEL: Record<NonNullable<Delivery["connection"]>, string> = {
  local: "Local",
  remote: "Remote",
  relay: "Relay",
};

/** A gray codec/container chip: MAIN in caps + an optional sub (Plex's copy/transcode call, orange on transcode). */
function DeliveryChip({ main, sub }: { main: string; sub?: string | null }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 6, backgroundColor: "rgba(148,163,184,0.14)" }}>
      <Text style={{ fontSize: 15, color: "#dfe4ec" }}>{main.toUpperCase()}</Text>
      {sub && <Text style={{ fontSize: 12, color: sub === "transcode" ? "#f0a92a" : "#64748b" }}>{sub}</Text>}
    </View>
  );
}

/** "Playback" readout — HOW the current program is delivered, as chips (mode / container / video+audio
 *  codec with Plex's copy-vs-transcode call / connection). Mechanical port of tv-web's DeliveryReadout. */
function DeliveryReadout({ delivery, accent }: { delivery: Delivery; accent: string }) {
  return (
    <View style={{ marginTop: 28 }}>
      <Text style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", marginBottom: 8 }}>Playback</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <View style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 6, backgroundColor: hexA(accent, 0.13) }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: accent }}>{MODE_LABEL[delivery.mode]}</Text>
        </View>
        {delivery.container && <DeliveryChip main={delivery.container} />}
        {delivery.videoCodec && <DeliveryChip main={delivery.videoCodec} sub={delivery.videoDecision} />}
        {delivery.audioCodec && <DeliveryChip main={delivery.audioCodec} sub={delivery.audioDecision} />}
        {delivery.connection && (
          <View style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 6, backgroundColor: delivery.connection === "local" ? "rgba(148,163,184,0.14)" : hexA(accent, 0.13) }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: delivery.connection === "local" ? "#dfe4ec" : accent }}>{CONN_LABEL[delivery.connection].toUpperCase()}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const PICKER_ITEM_H = 62; // approx row height (padding + margin + text) — for auto-scroll to the focus

/** Centered glass picker modal — the same blur + border treatment as the channel-number entry, with
 *  generous padding. Scrollable; the D-pad-focused row is accent-filled and the current selection is
 *  check-marked. Nav comes from the panel's key layer (up/down/OK/Back); a row tap picks; an outside
 *  tap closes. Conditionally mounted (no visible-toggle stacking); the card claims its own touches. */
function PickerModal({ title, items, current, sel, onPick, onClose, accent }: { title: string; items: { value: string; label: string }[]; current: string; sel: number; onPick: (v: string) => void; onClose: () => void; accent: string }) {
  const { height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, sel * PICKER_ITEM_H - 2 * PICKER_ITEM_H), animated: true });
  }, [sel]);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(4,6,12,0.6)", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <View
          onStartShouldSetResponder={() => true}
          style={{ width: 460, maxWidth: "92%", borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowRadius: 44, shadowOpacity: 0.55, elevation: 24 }}
        >
          <BlurView intensity={60} tint="dark" style={{ backgroundColor: "rgba(15,21,35,0.72)", paddingBottom: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.62)", paddingTop: 26, paddingHorizontal: 30, paddingBottom: 12 }}>{title}</Text>
            <ScrollView ref={scrollRef} style={{ maxHeight: height * 0.56 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 6 }} showsVerticalScrollIndicator={false}>
              {items.length === 0 && <Text style={{ color: "#94a3b8", fontSize: 17, paddingVertical: 22, textAlign: "center" }}>None available</Text>}
              {items.map((it, i) => {
                const isSel = it.value === current;
                const isFocus = i === sel;
                return (
                  <Pressable
                    key={it.value}
                    onPress={() => onPick(it.value)}
                    style={{ borderRadius: 14, marginVertical: 3, paddingVertical: 15, paddingHorizontal: 18, backgroundColor: isFocus ? accent : isSel ? hexA(accent, 0.16) : "transparent" }}
                  >
                    {/* explicit row (don't rely on Pressable's own flex): leading check slot + label */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                      <View style={{ width: 24, alignItems: "center", justifyContent: "center" }}>{isSel && <Check size={20} color={isFocus ? "#04060c" : accent} />}</View>
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: 18, fontWeight: isFocus || isSel ? "700" : "500", color: isFocus ? "#04060c" : isSel ? accent : "#f1f5f9" }}>
                        {it.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", paddingTop: 10, paddingHorizontal: 30, paddingBottom: 8 }}>OK to select · Back to cancel</Text>
          </BlurView>
        </View>
      </Pressable>
    </Modal>
  );
}
