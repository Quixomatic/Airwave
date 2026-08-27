import { Check } from "lucide-react-native";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { BlurView } from "expo-blur";

import { TvPressable as Pressable } from "@/components/tv-pressable";
import { cs, hexA, scaled } from "@/features/guide/layout";
import { LAYER, useKeyLayer } from "@/lib/input";

/**
 * The audio / subtitle / quality picker — lifted OUT of FeaturePanel to the FullChrome root so it can be a
 * full-screen, IN-HIERARCHY overlay (NOT a native `<Modal>`).
 *
 * Why not a Modal: on tvOS a native `<Modal>` presents in its own view controller that has no TV remote
 * handler, so `useTVEventHandler` — the source that feeds our whole zone machine — goes deaf while it's open
 * (react-native-tvos#609). Android is unaffected because its modals get their own handler (#628), which is
 * exactly why this bug was tvOS-only. Rendering the picker in the same view tree keeps the root
 * `useTVEventHandler` alive, so the `LAYER.MODAL` key layer below drives it like any other layer.
 */

export type PickerKind = "audio" | "subtitle" | "quality";

type Track = { id: string; label: string };

type PickerCtx = { openKind: PickerKind | null; open: (k: PickerKind) => void; close: () => void };

const Ctx = createContext<PickerCtx | null>(null);

/** Open/close the picker from anywhere under <PickerProvider> (e.g. FeaturePanel's circle buttons). */
export function usePicker(): PickerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePicker must be used within <PickerProvider>");
  return c;
}

export function PickerProvider({ children }: { children: ReactNode }) {
  const [openKind, setOpenKind] = useState<PickerKind | null>(null);
  return (
    <Ctx.Provider value={{ openKind, open: setOpenKind, close: () => setOpenKind(null) }}>{children}</Ctx.Provider>
  );
}

const PICKER_ITEM_H = cs(62); // approx row height — for auto-scroll to the focused row

/** The overlay itself — mount ONCE at the full-screen FullChrome root. Renders only when a picker is open. */
export function PickerOverlay({
  tracks,
  qualities,
  quality,
  audioStreamId,
  subtitleStreamId,
  onSelectQuality,
  onSelectAudio,
  onSelectSub,
  accent,
}: {
  tracks: { audio: Track[]; subtitle: Track[] };
  qualities: { id: string; label: string }[];
  quality: string;
  audioStreamId?: string;
  subtitleStreamId?: string;
  onSelectQuality: (id: string) => void;
  onSelectAudio: (id?: string) => void;
  onSelectSub: (id?: string) => void;
  accent: string;
}) {
  const { openKind, close } = usePicker();
  const { width, height } = useWindowDimensions();
  const [sel, setSel] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const items =
    openKind === "audio"
      ? [{ value: "", label: "Default" }, ...tracks.audio.map((t) => ({ value: t.id, label: t.label }))]
      : openKind === "subtitle"
        ? [{ value: "off", label: "Off" }, ...tracks.subtitle.map((t) => ({ value: t.id, label: t.label }))]
        : openKind === "quality"
          ? qualities.map((q) => ({ value: q.id, label: q.label }))
          : [];
  const current =
    openKind === "audio" ? audioStreamId ?? "" : openKind === "subtitle" ? subtitleStreamId ?? "off" : quality;
  const title = openKind === "audio" ? "Audio" : openKind === "subtitle" ? "Subtitles" : "Quality";

  const apply = (v: string) => {
    if (openKind === "audio") onSelectAudio(v || undefined);
    else if (openKind === "subtitle") onSelectSub(v);
    else if (openKind === "quality") onSelectQuality(v);
    close();
  };

  // Focus the current selection when a picker opens.
  useEffect(() => {
    if (!openKind) return;
    const idx = items.findIndex((it) => it.value === current);
    setSel(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKind]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, sel * PICKER_ITEM_H - 2 * PICKER_ITEM_H), animated: true });
  }, [sel]);

  // Owns the keys while open (LAYER.MODAL > CHROME): up/down move focus, OK selects, Back closes. Because
  // the overlay is in the normal view tree, the root useTVEventHandler still feeds this layer on tvOS.
  useKeyLayer({
    id: "picker",
    priority: LAYER.MODAL,
    active: openKind != null,
    onKey(e) {
      if (e.key === "back") {
        close();
        return true;
      }
      if (e.key === "up") {
        setSel((s) => Math.max(0, s - 1));
        return true;
      }
      if (e.key === "down") {
        setSel((s) => Math.min(items.length - 1, s + 1));
        return true;
      }
      if (e.key === "ok") {
        const it = items[sel];
        if (it) apply(it.value);
        return true;
      }
      return true; // trap everything else while the picker owns the screen
    },
  });

  if (!openKind) return null;

  return (
    <View style={{ position: "absolute", left: 0, top: 0, width, height, zIndex: 100, alignItems: "center", justifyContent: "center", padding: 40 }}>
      {/* backdrop — tap outside dismisses (touch / iPad; on TV, Back closes via the key layer) */}
      <Pressable
        onPress={close}
        focusable={!Platform.isTV}
        style={{ position: "absolute", left: 0, top: 0, width, height, backgroundColor: "rgba(4,6,12,0.6)" }}
      />
      <View
        onStartShouldSetResponder={() => true}
        style={scaled({ width: 460, maxWidth: "92%", borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowRadius: 44, shadowOpacity: 0.55, elevation: 24 })}
      >
        <BlurView intensity={60} tint="dark" style={scaled({ backgroundColor: "rgba(15,21,35,0.72)", paddingBottom: 6 })}>
          <Text style={scaled({ fontSize: 14, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.62)", paddingTop: 26, paddingHorizontal: 30, paddingBottom: 12 })}>{title}</Text>
          <ScrollView ref={scrollRef} style={{ maxHeight: height * 0.56 }} contentContainerStyle={scaled({ paddingHorizontal: 14, paddingBottom: 6 })} showsVerticalScrollIndicator={false}>
            {items.length === 0 && <Text style={scaled({ color: "#94a3b8", fontSize: 17, paddingVertical: 22, textAlign: "center" })}>None available</Text>}
            {items.map((it, i) => {
              const isSel = it.value === current;
              const isFocus = i === sel;
              return (
                <Pressable
                  key={it.value}
                  onPress={() => apply(it.value)}
                  focusable={!Platform.isTV}
                  style={scaled({ borderRadius: 14, marginVertical: 3, paddingVertical: 15, paddingHorizontal: 18, backgroundColor: isFocus ? accent : isSel ? hexA(accent, 0.16) : "transparent" })}
                >
                  {/* explicit row: leading check slot + label */}
                  <View style={scaled({ flexDirection: "row", alignItems: "center", gap: 14 })}>
                    <View style={scaled({ width: 24, alignItems: "center", justifyContent: "center" })}>{isSel && <Check size={cs(20)} color={isFocus ? "#04060c" : accent} />}</View>
                    <Text numberOfLines={1} style={scaled({ flex: 1, fontSize: 18, fontWeight: isFocus || isSel ? "700" : "500", color: isFocus ? "#04060c" : isSel ? accent : "#f1f5f9" })}>
                      {it.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={scaled({ fontSize: 13, color: "rgba(255,255,255,0.4)", paddingTop: 10, paddingHorizontal: 30, paddingBottom: 8 })}>OK to select · Back to cancel</Text>
        </BlurView>
      </View>
    </View>
  );
}
