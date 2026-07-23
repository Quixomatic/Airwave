import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { DEFAULT_ACCENT } from "@/lib/tint";

import { hexA } from "./layout";

/**
 * The glassmorphism circle icon button, ported from tv-web's `glass-button.tsx` — the sidebar's
 * circles. `focused` = D-pad focus (accent tint + ring), `active` = persistent lit (accent tint, no
 * ring). Circle only; when `expanded`, a label sits beside it.
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
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: expanded ? 14 : 0,
        width: "100%",
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {/* Focus ring — the web's `0 0 0 2px accent` box-shadow, as an offset bordered ring. */}
      <View style={{ position: "relative", flexShrink: 0 }}>
        {focused && (
          <View
            style={{
              position: "absolute",
              top: -4,
              left: -4,
              width: size + 8,
              height: size + 8,
              borderRadius: (size + 8) / 2,
              borderWidth: 2,
              borderColor: hexA(accent, 0.7),
            }}
          />
        )}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
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
      {expanded && label && (
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "600", color: lit ? "#f8fafc" : "#c3c9d4" }}>
            {label}
          </Text>
          {sublabel && (
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "500", color: "#64748b", marginTop: 2 }}>
              {sublabel}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}
