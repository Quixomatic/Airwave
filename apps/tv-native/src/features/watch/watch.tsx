import { ArrowLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { GuideChannel } from "@/lib/api";
import { LAYER, useKeyLayer } from "@/lib/input";
import { channelVivid } from "@/lib/tint";

import type { useTvPlayer } from "./use-tv-player";

/**
 * Full-screen player CHROME — the overlays over the persistent video in `full` layout. Increment 1
 * is the shell (back + now-playing) and the player-chrome input layer (Back → mini, OK/▲/▼ → the
 * feature panel, ◄/► → channel surf). The full feature panel + scrubber (increment 2) and channel
 * surf (increment 3) mount here next.
 */
export const ACCENTS = ["#2f9e8f", "#4a9fe0", "#3b82f6", "#8b5cf6", "#3fa66a", "#d08b2f", "#d0587e", "#7c8aa3"];
export const accentForChannel = (channel?: Pick<GuideChannel, "number" | "tint" | "package">) =>
  (channel ? channelVivid(channel) : undefined) ?? (channel?.number == null ? "#3b82f6" : ACCENTS[channel.number % ACCENTS.length]!);

type Player = ReturnType<typeof useTvPlayer>;

export function FullChrome({ channel, player, onBack }: { channel?: GuideChannel; player: Player; onBack: () => void }) {
  const g = player.status.guide;
  const title = g ? (g.showTitle ?? g.title) : "";
  const sub = g?.showTitle && g.season != null && g.episode != null ? `S${g.season}, E${g.episode}${g.title ? ` · ${g.title}` : ""}` : "";

  // Player-chrome input layer. Increment 1: Back → mini. (OK/arrows will open the panel / surf.)
  useKeyLayer({
    id: "player-chrome",
    priority: LAYER.CHROME,
    onKey(e) {
      if (e.key === "back") {
        onBack();
        return true;
      }
      return false;
    },
  });

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 14, padding: 24 }}>
      <Pressable onPress={onBack} style={{ borderRadius: 999, backgroundColor: "rgba(18,24,38,0.55)", padding: 10 }}>
        <ArrowLeft size={24} color="#f1f5f9" />
      </Pressable>
      {!!channel && (
        <Text style={{ color: "#c3c9d4", fontSize: 16, fontWeight: "700" }}>
          {channel.number} · {channel.name}
        </Text>
      )}
      {!!title && (
        <View style={{ marginLeft: 8 }}>
          <Text style={{ color: "#f1f5f9", fontSize: 20, fontWeight: "700" }}>{title}</Text>
          {!!sub && <Text style={{ color: "#c3c9d4", fontSize: 14 }}>{sub}</Text>}
        </View>
      )}
    </View>
  );
}
