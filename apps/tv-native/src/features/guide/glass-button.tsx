import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { TvPressable as Pressable } from "@/components/tv-pressable";
import { DEFAULT_ACCENT } from "@/lib/tint";

import { cs, hexA } from "./layout";

/**
 * The glassmorphism circle icon button, ported from tv-web's `glass-button.tsx` — the sidebar's
 * circles. `focused` = D-pad focus (accent tint + ring), `active` = persistent lit. Circle only;
 * when `expanded`, a label sits BESIDE it (a row: circle on the left, label column on the right —
 * exactly like tv-web).
 */
export function GlassCircleButton({
  icon,
  label,
  sublabel,
  expanded = false,
  focused = false,
  active = false,
  accent = DEFAULT_ACCENT,
  size = 54,
  onPress,
}: {
  icon: ReactNode;
  label?: string;
  sublabel?: string;
  expanded?: boolean;
  focused?: boolean;
  active?: boolean;
  accent?: string;
  size?: number;
  onPress?: () => void;
}) {
  const lit = focused || active;
  // Chrome-scaled for Android TV's 960dp space (identity on iPad/Apple TV) — the circle must shrink with
  // the sidebar width, else a 54px circle overflows the ~46px sliver.
  const s = cs(size);
  const ring = cs(8);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: "100%", opacity: pressed ? 0.75 : 1 })}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: expanded ? cs(14) : 0, width: "100%" }}>
        {/* circle (with the D-pad focus ring) */}
        <View style={{ width: s, height: s, flexShrink: 0 }}>
          {focused && (
            <View
              style={{
                position: "absolute",
                top: -ring / 2,
                left: -ring / 2,
                width: s + ring,
                height: s + ring,
                borderRadius: (s + ring) / 2,
                borderWidth: 2,
                borderColor: hexA(accent, 0.7),
              }}
            />
          )}
          <View
            style={{
              width: s,
              height: s,
              borderRadius: s / 2,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: lit ? hexA(accent, 0.4) : "rgba(255,255,255,0.12)",
              backgroundColor: lit ? hexA(accent, 0.28) : "rgba(18,24,38,0.55)",
            }}
          >
            {icon}
          </View>
        </View>

        {/* label beside the circle */}
        {expanded && label && (
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: cs(17), fontWeight: "600", color: lit ? "#f8fafc" : "#c3c9d4" }}>
              {label}
            </Text>
            {sublabel && (
              <Text numberOfLines={1} style={{ fontSize: cs(13), fontWeight: "500", color: "#64748b", marginTop: cs(2) }}>
                {sublabel}
              </Text>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}
