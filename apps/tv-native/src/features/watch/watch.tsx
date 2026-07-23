import { ArrowLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { GuideChannel } from "@/lib/api";
import { LAYER, useKeyLayer } from "@/lib/input";
import { channelVivid } from "@/lib/tint";

import { FeaturePanel } from "./feature-panel";
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
  const [panelOpen, setPanelOpen] = useState(true);
  const [surfOpen, setSurfOpen] = useState(false); // channel surf — increment 3

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
          {/* touch back-to-guide affordance (D-pad uses Back) */}
          <Pressable onPress={onBack} style={{ position: "absolute", top: 24, left: 24, zIndex: 2, borderRadius: 999, backgroundColor: "rgba(18,24,38,0.6)", padding: 10 }}>
            <ArrowLeft size={24} color="#f1f5f9" />
          </Pressable>
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
        </>
      )}

      {/* ChannelSurf mounts here in increment 3; for now surf just closes back to the video. */}
      {surfOpen && <Pressable style={StyleSheet.absoluteFill} onPress={() => setSurfOpen(false)} />}
    </View>
  );
}
