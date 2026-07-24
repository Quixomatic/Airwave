import { ArrowLeft, Tv } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeInUp, FadeOutDown, FadeOutUp } from "react-native-reanimated";

import { useGuide } from "@/hooks/queries";
import type { GuideChannel } from "@/lib/api";
import { LAYER, useKeyLayer } from "@/lib/input";
import { channelVivid } from "@/lib/tint";

import { ChannelSurf } from "./channel-surf";
import { FeaturePanel } from "./feature-panel";
import { usePlayer } from "./player-ctx";
import type { useTvPlayer } from "./use-tv-player";

/**
 * Full-screen player CHROME — overlays over the persistent video in `full` layout, ported from
 * tv-web. Nothing static on the live video (burn-in): OK/tap opens the FeaturePanel, Back returns to
 * the guide (mini), ◄/► open channel surf (increment 3). The FeaturePanel owns the keys while open.
 */
export const ACCENTS = ["#2f9e8f", "#4a9fe0", "#3b82f6", "#8b5cf6", "#3fa66a", "#d08b2f", "#d0587e", "#7c8aa3"];
export const accentForChannel = (channel?: Pick<GuideChannel, "number" | "tint" | "package">) =>
  (channel ? channelVivid(channel) : undefined) ?? (channel?.number == null ? "#3b82f6" : ACCENTS[channel.number % ACCENTS.length]!);

type Player = ReturnType<typeof useTvPlayer>;

export function FullChrome({
  channel,
  player,
  quality,
  audioStreamId,
  subtitleStreamId,
  qualities,
  onSelectQuality,
  onSelectAudio,
  onSelectSub,
  onBack,
}: {
  channel?: GuideChannel;
  player: Player;
  quality: string;
  audioStreamId?: string;
  subtitleStreamId?: string;
  qualities: { id: string; label: string }[];
  onSelectQuality: (id: string) => void;
  onSelectAudio: (id?: string) => void;
  onSelectSub: (id?: string) => void;
  onBack: () => void;
}) {
  const accent = accentForChannel(channel);
  const { tune } = usePlayer();
  const { data: guide } = useGuide(180);
  const [panelOpen, setPanelOpen] = useState(true);
  const [surfOpen, setSurfOpen] = useState(false);

  // Player-chrome input layer — active only when the panel/surf are closed (they own the keys when
  // open). Back → mini, OK/▲/▼ → open the panel, ◄/► → channel surf.
  useKeyLayer({
    id: "player-chrome",
    priority: LAYER.CHROME,
    active: !panelOpen && !surfOpen,
    onKey(e) {
      switch (e.key) {
        case "back":
          onBack();
          return true;
        case "ok":
        case "up":
        case "down":
          setPanelOpen(true);
          return true;
        case "left":
        case "right":
          setSurfOpen(true);
          return true;
      }
      return false;
    },
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* panel closed → tap the video to bring the panel back (no static chrome burns in) */}
      {!panelOpen && !surfOpen && <Pressable style={StyleSheet.absoluteFill} onPress={() => setPanelOpen(true)} />}

      {panelOpen && (
        <>
          {/* Glass channel chip, top-right — slides DOWN from the top (tv-web parity: y:-30 → 0).
              NOTE: in this Reanimated build FadeInUp starts ABOVE and moves down; FadeInDown starts
              below and moves up. So "from the top" = FadeInUp, and the exit up = FadeOutUp. */}
          <Animated.View
            entering={FadeInUp.duration(250)}
            exiting={FadeOutUp.duration(250)}
            style={{ position: "absolute", top: 28, right: 40, flexDirection: "row", alignItems: "center", gap: 12, height: 56, paddingLeft: 12, paddingRight: 22, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(18,24,38,0.55)" }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: `${accent}33` }}>
              <Tv size={20} color={accent} />
            </View>
            <Text style={{ fontSize: 22, fontWeight: "700", color: accent }}>{channel?.number}</Text>
            <Text style={{ fontSize: 22, fontWeight: "600", color: "#e6eaf1" }}>{channel?.name}</Text>
          </Animated.View>
          {/* touch back-to-guide affordance (D-pad uses Back) — slides down with the chip */}
          <Animated.View entering={FadeInUp.duration(250)} exiting={FadeOutUp.duration(250)} style={{ position: "absolute", top: 28, left: 24, zIndex: 2 }}>
            <Pressable onPress={onBack} style={{ borderRadius: 999, backgroundColor: "rgba(18,24,38,0.6)", padding: 10 }}>
              <ArrowLeft size={24} color="#f1f5f9" />
            </Pressable>
          </Animated.View>
          {/* Feature panel — slides UP from the bottom (tv-web parity: y:48 → 0). FadeInDown = starts
              below, moves up in this Reanimated build; exit down = FadeOutDown. */}
          <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOutDown.duration(250)} style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
            <FeaturePanel
              channel={channel}
              player={player}
              accent={accent}
              quality={quality}
              audioStreamId={audioStreamId}
              subtitleStreamId={subtitleStreamId}
              qualities={qualities}
              onSelectQuality={onSelectQuality}
              onSelectAudio={onSelectAudio}
              onSelectSub={onSelectSub}
              onClose={() => setPanelOpen(false)}
              onOpenSurf={() => {
                setPanelOpen(false);
                setSurfOpen(true);
              }}
            />
          </Animated.View>
        </>
      )}

      {surfOpen && (
        <ChannelSurf
          channels={[...(guide?.channels ?? [])].sort((a, b) => a.number - b.number)}
          currentChannelId={channel?.id ?? ""}
          onTune={(id) => tune(id)}
          onClose={() => setSurfOpen(false)}
        />
      )}
    </View>
  );
}
