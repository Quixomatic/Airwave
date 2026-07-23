import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, Text, useWindowDimensions, View } from "react-native";

import { channelIcon, liveProgramIndex } from "@/features/guide/layout";
import { imageUrl, type GuideGridChannel } from "@/lib/api";
import { LAYER, useKeyLayer } from "@/lib/input";
import { channelVivid } from "@/lib/tint";

/**
 * Channel surf, ported from tv-web — a horizontal carousel of channel tiles that slides up from the
 * closed player chrome. ◄/► move (wrapping), OK tunes, Back closes, ~12s of no input auto-hides.
 * The top MODAL layer (owns every key while up); touch taps a tile to tune. Opens centered on the
 * channel you're watching (a "Watching" flag).
 */
const TILE_W = 220;
const GAP = 18;
const ART_H = Math.round((TILE_W * 9) / 16);
const AUTO_HIDE_MS = 12_000;

export function ChannelSurf({ channels, currentChannelId, onTune, onClose }: { channels: GuideGridChannel[]; currentChannelId: string; onTune: (id: string) => void; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlashListRef<GuideGridChannel>>(null);
  const startIdx = useMemo(() => Math.max(0, channels.findIndex((c) => c.id === currentChannelId)), [channels, currentChannelId]);
  const [focused, setFocused] = useState(startIdx);
  const focusedRef = useRef(startIdx);
  focusedRef.current = focused;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => onCloseRef.current(), AUTO_HIDE_MS);
  }, []);
  useEffect(() => {
    resetHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [resetHide]);

  const move = useCallback(
    (dir: 1 | -1) => {
      const len = channels.length;
      if (len === 0) return;
      const nf = (focusedRef.current + dir + len) % len;
      focusedRef.current = nf;
      setFocused(nf);
      listRef.current?.scrollToIndex({ index: nf, animated: true, viewPosition: 0.5 });
    },
    [channels.length],
  );

  useEffect(() => {
    const raf = requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: startIdx, animated: false, viewPosition: 0.5 }));
    return () => cancelAnimationFrame(raf);
  }, [startIdx]);

  // Top MODAL layer that owns every key while up — returning true for ALL keys (even unhandled)
  // means nothing leaks to the chrome / guide beneath (the tv-native dispatcher has no "exclusive"
  // mode; a top layer that always consumes is the same thing).
  useKeyLayer({
    id: "channel-surf",
    priority: LAYER.MODAL,
    onKey(e) {
      switch (e.key) {
        case "left":
          resetHide();
          move(-1);
          break;
        case "right":
          resetHide();
          move(1);
          break;
        case "ok": {
          const ch = channels[focusedRef.current];
          if (ch && ch.id !== currentChannelId) onTune(ch.id);
          onCloseRef.current();
          break;
        }
        case "back":
          onCloseRef.current();
          break;
        default:
          resetHide();
      }
      return true; // swallow everything
    },
  });

  const nowMs = Date.now();

  return (
    <LinearGradient colors={["transparent", "rgba(4,6,12,0.96)"]} locations={[0, 0.4]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 420, paddingTop: 22, zIndex: 56 }}>
      <Text style={{ fontSize: 14, fontWeight: "700", letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,0.7)", textAlign: "center", marginBottom: 14 }}>Channel Surf</Text>
      <FlashList
        ref={listRef}
        horizontal
        data={channels}
        keyExtractor={(c) => c.id}
        extraData={focused}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: width / 2 - TILE_W / 2 }}
        renderItem={({ item, index }) => <SurfTile channel={item} isFocused={index === focused} isCurrent={item.id === currentChannelId} nowMs={nowMs} onPress={() => (index === focused ? (item.id !== currentChannelId && onTune(item.id), onClose()) : (setFocused(index), (focusedRef.current = index)))} />}
      />
    </LinearGradient>
  );
}

function SurfTile({ channel, isFocused, isCurrent, nowMs, onPress }: { channel: GuideGridChannel; isFocused: boolean; isCurrent: boolean; nowMs: number; onPress: () => void }) {
  const accent = channelVivid(channel) ?? "#4a9fe0";
  const prog = channel.programs.length ? channel.programs[liveProgramIndex(channel.programs, nowMs)] : undefined;
  const g = prog?.guide;
  const art = imageUrl(channel.id, g?.art ?? g?.thumb, 480);
  const isEpisode = !!g?.showTitle && g?.season != null && g?.episode != null;
  const title = g ? (isEpisode ? g.showTitle : g.title) : "—";
  const sub = isEpisode ? `S${g?.season} E${g?.episode}${g?.title ? ` · ${g.title}` : ""}` : undefined;
  let pct = 0;
  if (prog) {
    const s = new Date(prog.startsAt).getTime();
    pct = Math.max(0, Math.min(1, (nowMs - s) / (prog.durationSeconds * 1000)));
  }
  const Icon = channelIcon(channel.icon ?? channel.package?.icon);

  return (
    <Pressable onPress={onPress} style={{ width: TILE_W, marginHorizontal: GAP / 2, opacity: isFocused ? 1 : 0.5, transform: [{ scale: isFocused ? 1.06 : 1 }] }}>
      <View style={{ height: 22, alignItems: "center", justifyContent: "flex-end", marginBottom: 6 }}>
        {isCurrent && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.13)" }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accent }} />
            <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,0.9)" }}>Watching</Text>
          </View>
        )}
      </View>
      <View style={{ width: TILE_W, height: ART_H, borderRadius: 12, overflow: "hidden", backgroundColor: `${accent}22`, borderWidth: 2, borderColor: isFocused ? accent : "transparent", alignItems: "center", justifyContent: "center" }}>
        {art ? <Image source={{ uri: art }} style={{ width: "100%", height: "100%" }} /> : <Icon size={44} color={accent} />}
      </View>
      <View style={{ height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", marginTop: 8, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${pct * 100}%`, backgroundColor: accent }} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: `${accent}33`, alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} color={accent} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: "800", color: accent }}>{channel.number}</Text>
        <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "600", color: "#e6eaf1", flexShrink: 1 }}>{channel.name}</Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 15, color: "#f1f5f9", marginTop: 4 }}>{title}</Text>
      {sub && <Text numberOfLines={1} style={{ fontSize: 13, color: "#94a3b8" }}>{sub}</Text>}
    </Pressable>
  );
}
