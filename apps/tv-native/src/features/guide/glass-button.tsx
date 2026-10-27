import type { ReactNode } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";

import { TvPressable as Pressable } from "@/components/tv-pressable";
import { DEFAULT_ACCENT } from "@/lib/tint";

import { accentFg, AURORA, type GuideTokens } from "./guide-tokens";
import { cs, hexA } from "./layout";

/**
 * The glassmorphism circle icon button, ported from tv-web's `glass-button.tsx` — the sidebar's
 * circles. `focused` = D-pad focus (accent tint + ring), `active` = persistent lit. Circle only;
 * when `expanded`, a label sits BESIDE it (a row: circle on the left, label column on the right —
 * exactly like tv-web). `tokens` is the guide's theme; without it the button keeps the standard look, which is what
 * the Settings sidebar (which uses this button too) wants.
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
  tokens,
  onPress,
  onLayout,
}: {
  icon: ReactNode;
  label?: string;
  sublabel?: string;
  expanded?: boolean;
  focused?: boolean;
  active?: boolean;
  accent?: string;
  size?: number;
  tokens?: GuideTokens;
  onPress?: () => void;
  /** Forwarded to the root — lets the sidebar measure each circle's y for D-pad snap-scroll. */
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const tk = tokens ?? AURORA;
  // The ring and the lit border are marks, so they take the theme's shade of the accent; the lit fill is a tint.
  const fg = accentFg(tk, accent);
  const lit = focused || active;
  // Chrome-scaled for Android TV's 960dp space (identity on iPad/Apple TV) — the circle must shrink with
  // the sidebar width, else a 54px circle overflows the ~46px sliver.
  const s = cs(size);
  const ring = cs(8);
  return (
    <Pressable onPress={onPress} onLayout={onLayout} style={({ pressed }) => ({ width: "100%", opacity: pressed ? 0.75 : 1 })}>
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
                borderColor: hexA(fg, tk.glass.ringA),
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
              borderColor: lit ? hexA(fg, tk.glass.litBorderA) : tk.glass.idleBorder,
              backgroundColor: lit ? hexA(accent, tk.glass.litFillA) : tk.glass.idleFill,
            }}
          >
            {icon}
          </View>
        </View>

        {/* label beside the circle */}
        {expanded && label && (
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: cs(17), fontWeight: "600", color: lit ? tk.glass.labelLit : tk.glass.label }}>
              {label}
            </Text>
            {sublabel && (
              <Text numberOfLines={1} style={{ fontSize: cs(13), fontWeight: "500", color: tk.glass.sublabel, marginTop: cs(2) }}>
                {sublabel}
              </Text>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}
