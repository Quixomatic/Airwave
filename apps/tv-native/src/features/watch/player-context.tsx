import { MpvPlayerView } from "@ChannelGuide/mpv-player";
import { Maximize2, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { setStatusBarHidden } from "expo-status-bar";

import { useGuide } from "@/hooks/queries";
import { api } from "@/lib/api";
import { C } from "@/lib/theme";

import { BumperCard } from "./bumper-card";
import { ChannelNumberEntry } from "./channel-number-entry";
import { Ctx, type Layout, type PlayerCtx } from "./player-ctx";
import { useTvPlayer } from "./use-tv-player";
import { accentForChannel, FullChrome } from "./watch";

/**
 * The persistent player, ported from tv-web's `player-context.tsx`. Playback lives at the root so it
 * survives guide↔watch navigation: tuning plays `full`-screen, Back drops to a `mini` feed docked in
 * the guide's featured-panel slot (still playing), Close stops it. One video, repositioned between
 * full and the slot. (Increment 1 — the full feature panel / surf / number entry mount here next.)
 */
export { usePlayer } from "./player-ctx";

const MINI_IDLE_FULLSCREEN_MS = 60_000;

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [activeChannelId, setActive] = useState<string | null>(null);
  const [playingChannelId, setPlaying] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>("off");
  const [miniFocused, setMiniFocused] = useState(false);
  const [miniSel, setMiniSel] = useState<0 | 1>(0);
  const [miniSlot, setMiniSlot] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const tune = useCallback((channelId: string) => {
    setActive(channelId);
    setPlaying(channelId);
    setLayout("full");
    setMiniFocused(false);
  }, []);
  const goFull = useCallback(() => {
    setLayout("full");
    setMiniFocused(false);
  }, []);
  const goMini = useCallback(() => {
    setLayout("mini");
    setMiniFocused(false);
  }, []);
  const stop = useCallback(() => {
    setActive(null);
    setPlaying(null);
    setLayout("off");
    setMiniFocused(false);
  }, []);
  const focusMini = useCallback(() => {
    setMiniFocused(true);
    setMiniSel(0);
  }, []);
  const blurMini = useCallback(() => setMiniFocused(false), []);
  const miniMove = useCallback((dir: -1 | 1) => setMiniSel((s) => (s + dir < 0 ? 0 : s + dir > 1 ? 1 : ((s + dir) as 0 | 1))), []);
  const miniActivate = useCallback(() => {
    if (miniSel === 0) goFull();
    else stop();
  }, [miniSel, goFull, stop]);

  // CH▲/▼ — step the ordered lineup by one, clamped, behind an in-flight lock (a change remounts the
  // host; the lock stops rapid presses thrashing the reload). Released when the new channel plays.
  const { data: guide } = useGuide(180);
  const lineup = useMemo(() => [...(guide?.channels ?? [])].sort((a, b) => a.number - b.number), [guide]);
  const lineupRef = useRef(lineup);
  lineupRef.current = lineup;
  const playingRef = useRef(playingChannelId);
  playingRef.current = playingChannelId;
  const chLock = useRef(false);
  const chLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseChannelLock = useCallback(() => {
    chLock.current = false;
    if (chLockTimer.current) clearTimeout(chLockTimer.current);
  }, []);
  const channelStep = useCallback(
    (dir: 1 | -1) => {
      if (chLock.current) return;
      const list = lineupRef.current;
      const idx = list.findIndex((c) => c.id === playingRef.current);
      if (idx < 0) return;
      const target = list[idx + dir];
      if (!target) return;
      chLock.current = true;
      if (chLockTimer.current) clearTimeout(chLockTimer.current);
      chLockTimer.current = setTimeout(() => (chLock.current = false), 5000);
      tune(target.id);
    },
    [tune],
  );

  const value = useMemo<PlayerCtx>(
    () => ({ activeChannelId, playingChannelId, layout, miniFocused, miniSel, tune, goFull, goMini, stop, focusMini, blurMini, miniMove, miniActivate, channelStep, setMiniSlot }),
    [activeChannelId, playingChannelId, layout, miniFocused, miniSel, tune, goFull, goMini, stop, focusMini, blurMini, miniMove, miniActivate, channelStep],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Global channel-number entry + CH▲/▼ (guide + full player). */}
      <ChannelNumberEntry />
      {/* One persistent PlayerHost — never unmounted (that leaks the native VLC player). Channel
          changes + Close flow through channelId (null = released/idle), not a remount. */}
      <PlayerHost
        channelId={activeChannelId}
        layout={layout}
        miniFocused={miniFocused}
        miniSel={miniSel}
        miniSlot={miniSlot}
        onFocusMini={focusMini}
        onBack={goMini}
        onGoFull={goFull}
        onClose={stop}
        onPlaying={releaseChannelLock}
      />
    </Ctx.Provider>
  );
}

function PlayerHost({
  channelId,
  layout,
  miniFocused,
  miniSel,
  miniSlot,
  onFocusMini,
  onBack,
  onGoFull,
  onClose,
  onPlaying,
}: {
  channelId: string | null;
  layout: Layout;
  miniFocused: boolean;
  miniSel: 0 | 1;
  miniSlot: { x: number; y: number; width: number; height: number } | null;
  onFocusMini: () => void;
  onBack: () => void;
  onGoFull: () => void;
  onClose: () => void;
  onPlaying: () => void;
}) {
  const { width: vw, height: vh } = useWindowDimensions();
  const { data: guide } = useGuide(180);
  const channel = guide?.channels.find((c) => c.id === channelId);
  const accent = accentForChannel(channel);
  const [quality, setQuality] = useState("original");
  const [audioStreamId, setAudioStreamId] = useState<string | undefined>(undefined);
  const [subtitleStreamId, setSubtitleStreamId] = useState<string | undefined>(undefined);
  const [qualities, setQualities] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    api.qualities().then((r) => setQualities(r.qualities)).catch(() => {});
  }, []);
  const tv = useTvPlayer(channelId, { quality, audioStreamId, subtitleStreamId });
  const { status } = tv;

  // Release the CH▲/▼ lock once this channel is actually showing content.
  useEffect(() => {
    if (!status.loading && (status.state === "program" || status.state === "bumper")) onPlaying();
  }, [status.state, status.loading, onPlaying]);

  const full = layout === "full";

  // Hide the iPad status bar (time/battery/etc.) during full-screen playback for a clean 10-foot frame;
  // restore it in mini/off. Imperative so it doesn't fight the root <StatusBar style="light" />.
  useEffect(() => {
    setStatusBarHidden(full, "fade");
  }, [full]);
  // full → fill the screen; mini + docked → the featured slot; mini with no slot (e.g. on Settings,
  // where the guide's dock is unmounted) → hidden (audio keeps playing), matching tv-web.
  const hiddenMini = { x: vw - vw * 0.42, y: 80, width: vw * 0.42, height: (vw * 0.42 * 9) / 16 };
  const target = full
    ? { x: 0, y: 0, width: vw, height: vh, radius: 0, opacity: 1 }
    : miniSlot
      ? { ...miniSlot, radius: 14, opacity: 1 }
      : { ...hiddenMini, radius: 14, opacity: 0 };

  // NO animation (deliberate — James's call): the mini↔full transition jumps instantly. A
  // Reanimated-animated container SIZE doesn't drive RN's real layout pass, and libVLC's native surface
  // only (re)binds on a real layout — so the animation left the video decoded-but-unpainted until a
  // manual resize. Plain style = a real layout on every change = the surface attaches + repaints.
  return (
    <View
      style={{ position: "absolute", overflow: "hidden", backgroundColor: "#000", zIndex: full ? 50 : 15, left: target.x, top: target.y, width: target.width, height: target.height, borderRadius: target.radius, opacity: target.opacity }}
      pointerEvents={layout === "off" ? "none" : "auto"}
    >
      {/* Mount ON DEMAND (only when there's a source), not always: an always-mounted view is created
          while hidden/tiny at app start, so its native surface attaches to that bad frame and never
          re-attaches to full (decodes but never paints). Rendering only when a source exists mounts it
          fresh + visible at the current (full) size → the surface attaches correctly. It stays mounted
          across channel changes (source just swaps) and unmounts on Close (clean teardown). absoluteFill
          pins it to the container's exact bounds (the container size comes from a Reanimated style,
          which doesn't drive flex layout). */}
      {tv.source != null && (
        <MpvPlayerView ref={tv.viewRef} source={tv.source} startTime={tv.startTime} {...tv.videoEvents} style={StyleSheet.absoluteFill} contentFit={full ? "contain" : "cover"} />
      )}

      {/* bumper interstitial — full (blurred art + big title + donut) or compact (mini feed) */}
      {status.state === "bumper" && status.guide && channelId && (
        <BumperCard channelId={channelId} guide={status.guide} remaining={status.bumperRemaining} accent={accent} compact={!full} />
      )}

      {status.loading && status.state !== "bumper" && (
        <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
          <ActivityIndicator color="#fff" size={full ? "large" : "small"} />
        </View>
      )}

      {full && (
        <FullChrome
          channel={channel}
          player={tv}
          quality={quality}
          audioStreamId={audioStreamId}
          subtitleStreamId={subtitleStreamId}
          qualities={qualities}
          onSelectQuality={setQuality}
          onSelectAudio={setAudioStreamId}
          onSelectSub={setSubtitleStreamId}
          onBack={onBack}
        />
      )}

      {/* mini: tap to focus; green hint while unfocused; two buttons when focused. */}
      {layout === "mini" && !miniFocused && (
        <Pressable style={{ position: "absolute", inset: 0 }} onPress={onFocusMini}>
          <GreenHint />
        </Pressable>
      )}
      {layout === "mini" && miniFocused && (
        <View style={{ position: "absolute", inset: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, backgroundColor: "rgba(6,10,20,0.55)" }}>
          <MiniButton label="Full screen" icon={<Maximize2 size={26} color={miniSel === 0 ? "#06121f" : "#dfe4ec"} />} selected={miniSel === 0} accent={accent} onPress={onGoFull} />
          <MiniButton label="Close" icon={<X size={26} color={miniSel === 1 ? "#06121f" : "#dfe4ec"} />} selected={miniSel === 1} accent={accent} onPress={onClose} />
        </View>
      )}
    </View>
  );
}

/** "press ▭ to focus" — the LG green button drawn as its physical shape (a wide thin rounded bar). */
function GreenHint() {
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingTop: 7, paddingBottom: 8, backgroundColor: "rgba(6,10,20,0.5)" }}>
      <View style={{ width: 30, height: 11, borderRadius: 6, backgroundColor: "#22c55e" }} />
      <Text style={{ fontSize: 12, fontWeight: "600", color: "#e6eaf1" }}>to focus</Text>
    </View>
  );
}

function MiniButton({ label, icon, selected, accent, onPress }: { label: string; icon: React.ReactNode; selected: boolean; accent: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", gap: 8 }}>
      <View style={{ width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: selected ? accent : "rgba(30,41,59,0.85)" }}>{icon}</View>
      <Text style={{ fontSize: 14, fontWeight: "600", color: selected ? "#f1f5f9" : "#94a3b8" }}>{label}</Text>
    </Pressable>
  );
}
