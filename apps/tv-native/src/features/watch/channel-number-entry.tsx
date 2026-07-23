import { usePathname } from "expo-router";
import { ChevronDown, ChevronUp, Delete, Hash } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { useGuide } from "@/hooks/queries";
import { LAYER, useKeyLayer } from "@/lib/input";
import { C } from "@/lib/theme";

import { usePlayer } from "./player-ctx";

/**
 * Channel-number entry + CH▲/▼, ported from tv-web — but adapted for a platform with no number pad.
 * tv-web types digits on the LG remote; here the input path is an **on-screen keypad** (touch, and the
 * Apple TV / RN-TV remotes have no digits) plus **CH▲/▼ buttons** while watching. The dispatcher layer
 * still handles `digit`/`chUp`/`chDown` for a future native key path / webOS.
 *
 * Global (mounted by PlayerProvider): a floating **keypad** button on the guide + full player opens a
 * numeric pad; typing shows a top-right buffer; OK/Go commits (tunes the channel if it exists, flashes
 * if not). CH▲/▼ float on the full player (a while-watching gesture) and step the lineup.
 */
const DISMISS_MS = 6000;
const FLASH_MS = 950;

export function ChannelNumberEntry() {
  const pathname = usePathname();
  const player = usePlayer();
  const { data: guide } = useGuide(180);

  const lineup = useMemo(() => [...(guide?.channels ?? [])].sort((a, b) => a.number - b.number), [guide]);
  const byNumber = useCallback((n: number) => lineup.find((c) => c.number === n), [lineup]);
  const maxDigits = Math.max(1, String(lineup.at(-1)?.number ?? 0).length);

  const [buffer, setBuffer] = useState("");
  const [flash, setFlash] = useState(false);
  const [padOpen, setPadOpen] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferRef = useRef("");
  bufferRef.current = buffer;

  const clearTimers = () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    if (flashTimer.current) clearTimeout(flashTimer.current);
  };
  const cancel = useCallback(() => {
    clearTimers();
    setFlash(false);
    setBuffer("");
  }, []);
  const armDismiss = () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(cancel, DISMISS_MS);
  };
  const append = useCallback(
    (d: string) => {
      if (bufferRef.current.length >= maxDigits) return;
      setFlash(false);
      setBuffer((b) => b + d);
      armDismiss();
    },
    [maxDigits],
  );
  const commit = useCallback(() => {
    clearTimers();
    const n = parseInt(bufferRef.current, 10);
    const ch = Number.isFinite(n) ? byNumber(n) : undefined;
    if (ch) {
      setBuffer("");
      player.tune(ch.id);
    } else {
      setFlash(true);
      flashTimer.current = setTimeout(() => {
        setFlash(false);
        setBuffer("");
      }, FLASH_MS);
    }
  }, [byNumber, player]);

  useEffect(() => () => clearTimers(), []);

  // Dispatcher layer (OVERLAY) — future/webOS remote path. Digits/CH don't arrive via
  // useTVEventHandler on the current targets, so this is dormant there; the on-screen controls drive
  // the same logic. Only active while a number is part-typed (so it doesn't eat OK/Back otherwise).
  useKeyLayer({
    id: "number-entry",
    priority: LAYER.OVERLAY,
    onKey(e) {
      if (e.key === "chUp") {
        player.channelStep(1);
        return true;
      }
      if (e.key === "chDown") {
        player.channelStep(-1);
        return true;
      }
      if (e.key === "digit" && e.digit != null) {
        append(String(e.digit));
        return true;
      }
      if (bufferRef.current.length === 0) return false;
      if (e.key === "ok") {
        commit();
        return true;
      }
      if (e.key === "back") {
        cancel();
        return true;
      }
      return false;
    },
  });

  const onGuide = pathname === "/guide";
  const watching = player.layout === "full";
  const showControls = onGuide || watching;
  if (!showControls) return null;

  const pad = "_".repeat(Math.max(0, maxDigits - buffer.length));

  return (
    <>
      {/* the typed-number buffer — top-right slide-in */}
      {buffer.length > 0 && (
        <View style={{ position: "absolute", top: 28, right: 40, zIndex: 60, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 14, backgroundColor: flash ? "rgba(120,40,40,0.9)" : "rgba(18,24,38,0.85)", borderWidth: 1, borderColor: flash ? "#f87171" : "rgba(148,163,184,0.25)" }}>
          <Hash size={22} color={flash ? "#f87171" : C.accent} />
          <Text style={{ fontSize: 30, fontWeight: "800", letterSpacing: 4, color: "#f1f5f9", fontVariant: ["tabular-nums"] }}>
            {buffer}
            <Text style={{ color: "#475569" }}>{pad}</Text>
          </Text>
        </View>
      )}

      {/* CH▲/▼ — floating on the full player (a while-watching gesture) */}
      {watching && (
        <View style={{ position: "absolute", right: 28, top: "38%", zIndex: 40, gap: 12 }}>
          <RoundBtn icon={<ChevronUp size={26} color="#f1f5f9" />} onPress={() => player.channelStep(1)} />
          <RoundBtn icon={<ChevronDown size={26} color="#f1f5f9" />} onPress={() => player.channelStep(-1)} />
        </View>
      )}

      {/* keypad FAB — opens the numeric pad (touch input path) */}
      <Pressable onPress={() => setPadOpen(true)} style={{ position: "absolute", right: 28, bottom: 28, zIndex: 40, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(18,24,38,0.8)", borderWidth: 1, borderColor: "rgba(148,163,184,0.25)" }}>
        <Hash size={26} color={C.accent} />
      </Pressable>

      {/* the numeric keypad */}
      <Modal visible={padOpen} transparent animationType="fade" onRequestClose={() => setPadOpen(false)}>
        <Pressable onPress={() => setPadOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ padding: 20, borderRadius: 20, backgroundColor: "#0b1120", borderWidth: 1, borderColor: "rgba(148,163,184,0.2)", gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6, alignSelf: "center" }}>
              <Hash size={22} color={C.accent} />
              <Text style={{ fontSize: 32, fontWeight: "800", letterSpacing: 4, color: flash ? "#f87171" : "#f1f5f9", fontVariant: ["tabular-nums"] }}>{buffer || "—"}</Text>
            </View>
            {[
              ["1", "2", "3"],
              ["4", "5", "6"],
              ["7", "8", "9"],
            ].map((row, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 12 }}>
                {row.map((d) => (
                  <Key key={d} label={d} onPress={() => append(d)} />
                ))}
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Key label="⌫" onPress={() => setBuffer((b) => b.slice(0, -1))} />
              <Key label="0" onPress={() => append("0")} />
              <Key
                label="Go"
                accent
                onPress={() => {
                  commit();
                  setPadOpen(false);
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function RoundBtn({ icon, onPress }: { icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(18,24,38,0.8)", borderWidth: 1, borderColor: "rgba(148,163,184,0.25)" }}>
      {icon}
    </Pressable>
  );
}

function Key({ label, onPress, accent }: { label: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ width: 76, height: 64, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: accent ? C.accent : "rgba(148,163,184,0.1)" }}>
      {label === "⌫" ? <Delete size={24} color="#f1f5f9" /> : <Text style={{ fontSize: 26, fontWeight: "700", color: accent ? "#04060c" : "#f1f5f9" }}>{label}</Text>}
    </Pressable>
  );
}
