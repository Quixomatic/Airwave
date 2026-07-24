import { BlurView } from "expo-blur";
import { usePathname } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";

import { useGuide } from "@/hooks/queries";
import { LAYER, useKeyLayer } from "@/lib/input";

import { usePlayer } from "./player-ctx";

/**
 * Global channel-number entry — a mechanical port of tv-web's `channel-number-entry.tsx`. Anywhere on
 * the guide / full player / mini feed, typing a digit (hardware keyboard via the input dispatcher) arms
 * a channel-number buffer shown as a **top-center glass card that slides down**; **OK — and only OK** (a
 * toddler mashing digits must never tune on its own) commits it, tuning full-screen if the channel
 * exists or flashing red if it doesn't. An arrow breaks out and passes through to navigation; Back
 * breaks out and is consumed; inactivity quietly dismisses WITHOUT tuning. CH▲/▼ step the lineup.
 *
 * Rendered once by PlayerProvider (always mounted) so it's armed globally. Its dispatcher layer is
 * OVERLAY priority — above the guide/chrome — but only CONSUMES what it uses (digits + CH always; OK/
 * Back/arrows only while a number is part-typed), so other handlers are untouched otherwise.
 */
const DISMISS_MS = 6000; // inactivity → clear the buffer (never commits)
const FLASH_MS = 950; // how long an invalid number flashes red before clearing

export function ChannelNumberEntry() {
  const pathname = usePathname();
  const player = usePlayer();
  const { data: guide } = useGuide(180);

  const lineup = useMemo(() => [...(guide?.channels ?? [])].sort((a, b) => a.number - b.number), [guide]);
  const byNumber = useCallback((n: number) => lineup.find((c) => c.number === n), [lineup]);
  const maxDigits = Math.max(1, String(lineup.at(-1)?.number ?? 0).length);

  const [buffer, setBuffer] = useState("");
  const [flash, setFlash] = useState(false);
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
      if (bufferRef.current.length >= maxDigits) return; // ignore digits past the widest channel number
      setFlash(false);
      setBuffer((b) => b + d);
      armDismiss();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxDigits],
  );
  const commit = useCallback(() => {
    clearTimers();
    const n = parseInt(bufferRef.current, 10);
    const ch = Number.isFinite(n) ? byNumber(n) : undefined;
    if (ch) {
      setBuffer("");
      player.tune(ch.id); // tune() takes it full-screen
    } else {
      // No such channel — flash red briefly, then clear. Never tunes.
      setFlash(true);
      flashTimer.current = setTimeout(() => {
        setFlash(false);
        setBuffer("");
      }, FLASH_MS);
    }
  }, [byNumber, player]);

  useEffect(() => () => clearTimers(), []);

  // Armed only while browsing/watching — never on login/settings/etc.
  const active = pathname === "/guide" || player.layout === "full" || player.layout === "mini";

  useKeyLayer({
    id: "number-entry",
    priority: LAYER.OVERLAY,
    onKey(e) {
      if (!active) return false;

      // CH▲/▼: step one channel (clamped, in-flight-locked in the provider). Abandons any in-progress
      // number entry first.
      if (e.key === "chUp" || e.key === "chDown") {
        if (bufferRef.current.length > 0) cancel();
        player.channelStep(e.key === "chUp" ? 1 : -1);
        return true;
      }

      if (e.key === "digit" && e.digit != null) {
        append(String(e.digit));
        return true;
      }

      if (bufferRef.current.length === 0) return false; // below only applies mid-entry

      if (e.key === "ok") {
        commit();
        return true;
      }
      // Back breaks out and is CONSUMED (peels the overlay).
      if (e.key === "back") {
        cancel();
        return true;
      }
      // An arrow breaks out but PASSES THROUGH — you changed your mind and want to navigate.
      if (e.key === "up" || e.key === "down" || e.key === "left" || e.key === "right") {
        cancel();
        return false;
      }
      return false;
    },
  });

  if (buffer.length === 0 && !flash) return null;

  const pad = "_".repeat(Math.max(0, maxDigits - buffer.length));

  // Top-CENTER, dropped 28px from the top edge (consistent with the full-chrome channel pill). The card
  // slides down on enter / up on exit (Reanimated), mirroring tv-web's framer-motion y:-30 → 0.
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 28, left: 0, right: 0, alignItems: "center", zIndex: 70 }}>
      <Animated.View
        entering={FadeInUp.duration(250)}
        exiting={FadeOutUp.duration(250)}
        style={{ minWidth: 220, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: flash ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.12)" }}
      >
        {/* Same glass treatment as the full-chrome channel pill (small element → real blur is cheap). */}
        <BlurView intensity={50} tint="dark" style={{ paddingVertical: 16, paddingHorizontal: 34, alignItems: "center", backgroundColor: "rgba(18,24,38,0.45)" }}>
          <Text style={{ fontSize: 13, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", color: flash ? "#fca5a5" : "rgba(255,255,255,0.85)" }}>
            Channel
          </Text>
          <Text style={{ fontSize: 68, fontWeight: "800", lineHeight: 72, color: flash ? "#ef4444" : "#fff", fontVariant: ["tabular-nums"] }}>
            {buffer}
            <Text style={{ color: "rgba(255,255,255,0.3)" }}>{pad}</Text>
          </Text>
          <Text style={{ fontSize: 15, fontWeight: "500", color: flash ? "#fca5a5" : "rgba(255,255,255,0.8)", marginTop: 2 }}>
            {flash ? `No channel ${buffer}` : "OK to watch · Back to cancel"}
          </Text>
        </BlurView>
      </Animated.View>
    </View>
  );
}
