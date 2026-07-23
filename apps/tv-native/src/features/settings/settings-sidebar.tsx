import type { ReactNode } from "react";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { GlassCircleButton } from "@/features/guide/glass-button";
import { SIDEBAR_EXPANDED_W, SIDEBAR_SLIVER_W } from "@/features/guide/layout";
import { C } from "@/lib/theme";

/**
 * The settings shell's category rail — the same sliver-of-glass-circles treatment as the guide
 * sidebar, ported from tv-web's `settings-sidebar.tsx`. Collapsed it's a tap-to-expand sliver;
 * expanded it shows the category labels. D-pad focus drives the ring on `sel`.
 */
export type SettingsNavItem = { key: string; label: string; icon: ReactNode };

export function SettingsSidebar({
  items,
  expanded,
  focused,
  sel,
  activeKey,
  onActivate,
  onExpand,
}: {
  items: SettingsNavItem[];
  expanded: boolean;
  focused: boolean;
  sel: number;
  activeKey: string;
  onActivate: (index: number) => void;
  onExpand: () => void;
}) {
  const w = useSharedValue(expanded ? SIDEBAR_EXPANDED_W : SIDEBAR_SLIVER_W);
  useEffect(() => {
    w.value = withSpring(expanded ? SIDEBAR_EXPANDED_W : SIDEBAR_SLIVER_W, { mass: 1, stiffness: 320, damping: 34, overshootClamping: true });
  }, [expanded, w]);
  const outerStyle = useAnimatedStyle(() => {
    const t = (w.value - SIDEBAR_SLIVER_W) / (SIDEBAR_EXPANDED_W - SIDEBAR_SLIVER_W);
    return { width: w.value, shadowOpacity: 0.5 * t };
  });

  const content = (
    <View style={{ flex: 1, gap: 14, paddingVertical: 24, paddingHorizontal: 18 }}>
      {items.map((it, i) => (
        <View key={it.key}>
          <GlassCircleButton
            icon={it.icon}
            label={it.label}
            expanded={expanded}
            focused={expanded && focused && sel === i}
            active={it.key === activeKey}
            onPress={expanded ? () => onActivate(i) : undefined}
          />
          {/* separate "Back to Guide" from the categories (matches the guide sidebar) */}
          {i === 0 && <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 8 }} />}
        </View>
      ))}
    </View>
  );

  return (
    <Animated.View
      style={[
        { position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 25, shadowColor: "#000", shadowOffset: { width: 24, height: 0 }, shadowRadius: 30, elevation: expanded ? 16 : 0 },
        outerStyle,
      ]}
    >
      {expanded ? (
        <View style={{ flex: 1, overflow: "hidden", backgroundColor: C.sidebarBg, borderRightWidth: 1, borderRightColor: C.border }}>{content}</View>
      ) : (
        <Pressable onPress={onExpand} style={{ flex: 1 }}>
          <View style={{ flex: 1, overflow: "hidden", backgroundColor: C.sidebarBg, borderRightWidth: 1, borderRightColor: C.border }}>{content}</View>
        </Pressable>
      )}
    </Animated.View>
  );
}
