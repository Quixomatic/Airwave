import * as LucideIcons from "lucide-react-native";
import { History, LayoutGrid, ListFilter, Menu, Settings as SettingsIcon, Star, User } from "lucide-react-native";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { TvPressable as Pressable } from "@/components/tv-pressable";
import type { Package } from "@/lib/api";
import { C } from "@/lib/theme";
import { accentVivid } from "@/lib/accent-palette";

import { GlassCircleButton } from "./glass-button";
import { cs, SIDEBAR_EXPANDED_W, SIDEBAR_SLIVER_W } from "./layout";

/**
 * The guide's left sidebar, ported from tv-web — a collapsed sliver of glass circles that expands to
 * reveal the lenses. Same sliver (92) / expanded (300) widths and overlay behavior. Touch model
 * mirrors the TV's "enter the sidebar to use it": tapping the collapsed sliver expands it (the
 * circles are non-interactive until then); expanded, tapping a lens applies it and collapses.
 */
export type Lens =
  | { type: "all" }
  | { type: "favorites" }
  | { type: "recents" }
  | { type: "packages"; ids: string[] };

export type SidebarItem = {
  key: string;
  label: string;
  sublabel?: string;
  icon: ReactNode;
  lens?: Lens;
  kind: "settings" | "account" | "lens";
  group: "action" | "filter";
  accent?: string;
};

const LU = LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; color?: string }>>;
// cs() keeps the icons proportional to the (chrome-scaled) circles on Android TV; identity on iPad/Apple TV.
function pkgIcon(id: string | null): ReactNode {
  const Comp = id && id.startsWith("lucide:") ? LU[id.slice(7)] ?? LucideIcons.Folder : LucideIcons.Folder;
  return <Comp size={cs(24)} color="#f1f5f9" />;
}
const ic = (Cmp: React.ComponentType<{ size?: number; color?: string }>) => <Cmp size={cs(24)} color="#f1f5f9" />;

export function buildSidebarItems(packages: Package[], lens: Lens): SidebarItem[] {
  const filtered = lens.type !== "all";
  return [
    { key: "guide", label: "Guide", icon: ic(Menu), kind: "lens", lens: { type: "all" }, group: "action" },
    { key: "settings", label: "Settings", icon: ic(SettingsIcon), kind: "settings", group: "action" },
    { key: "account", label: "Account", icon: ic(User), kind: "account", group: "action" },
    ...(filtered
      ? [{ key: "show-all", label: "Show All", icon: ic(LayoutGrid), kind: "lens" as const, lens: { type: "all" as const }, group: "filter" as const }]
      : []),
    { key: "favorites", label: "Favorites", icon: ic(Star), kind: "lens", lens: { type: "favorites" }, group: "filter" },
    { key: "recents", label: "Recents", icon: ic(History), kind: "lens", lens: { type: "recents" }, group: "filter" },
    ...packages.map<SidebarItem>((p) => ({
      key: `pkg:${p.id}`,
      label: p.name,
      sublabel: `${p.channelCount} ${p.channelCount === 1 ? "channel" : "channels"}`,
      icon: pkgIcon(p.icon),
      kind: "lens",
      lens: { type: "packages", ids: [p.id] },
      group: "filter",
      accent: accentVivid(p.tint),
    })),
  ];
}

export function lensEquals(a: Lens | undefined, b: Lens): boolean {
  if (!a || a.type !== b.type) return false;
  if (a.type === "packages" && b.type === "packages") {
    return a.ids.length === b.ids.length && a.ids.every((id) => b.ids.includes(id));
  }
  return true;
}

export function GuideSidebar({
  items,
  expanded,
  focused,
  sel,
  lens,
  onActivate,
  onExpand,
}: {
  items: SidebarItem[];
  expanded: boolean;
  /** D-pad focus is in the sidebar (drives the ring on the `sel`'d circle). Always false on touch. */
  focused: boolean;
  sel: number;
  lens: Lens;
  onActivate: (index: number) => void;
  /** Touch: tapping the collapsed sliver expands it to reveal the lenses. */
  onExpand: () => void;
}) {
  const actions = items.filter((i) => i.group === "action");
  const filters = items.filter((i) => i.group === "filter");
  const activeFilter = filters.find((f) => f.lens && lensEquals(f.lens, lens));

  // Chrome widths + inner spacing scaled for Android TV's 960dp space (identity on iPad/Apple TV).
  const SLIVER = cs(SIDEBAR_SLIVER_W);
  const EXPANDED = cs(SIDEBAR_EXPANDED_W);
  const padV = cs(24);
  const padH = cs(18);
  const gap = cs(14);
  // The focus ring (glass-button.tsx) is drawn ~cs(4) OUTSIDE each circle. In the lens list that lives in a
  // ScrollView, which clips its content to its frame — so the ring gets cut on the left (every circle) and the
  // top (the first). Extend the scroll frame outward by RING_ROOM (negative margin) and pad the content back by
  // the same amount, so the rings have room INSIDE the clip while every circle stays pixel-identical. cs(8)
  // leaves a comfortable ~cs(4) margin beyond the ring. (The action circles above the divider aren't scrolled,
  // so they already clear the sidebar's overflow:hidden and need nothing.)
  const RING_ROOM = cs(8);

  const w = useSharedValue(expanded ? EXPANDED : SLIVER);
  useEffect(() => {
    // Match tv-web's Framer spring (stiffness 320 / damping 34) but clamp the overshoot — Reanimated's
    // spring solver bounces harder than Framer's at these params; overshootClamping gives the clean
    // decelerating slide tv-web has.
    w.value = withSpring(expanded ? EXPANDED : SLIVER, {
      mass: 1,
      stiffness: 320,
      damping: 34,
      overshootClamping: true,
    });
  }, [expanded, w, EXPANDED, SLIVER]);
  // Width + the drop shadow fade in together (tv-web animates boxShadow 0→0.5 alpha with the width).
  const outerStyle = useAnimatedStyle(() => {
    const t = (w.value - SLIVER) / (EXPANDED - SLIVER);
    return { width: w.value, shadowOpacity: 0.5 * t };
  });

  const content = expanded ? (
    // Interactive circles + labels; the lens list scrolls (packages exceed the screen).
    <View style={{ flex: 1, gap, paddingVertical: padV, paddingHorizontal: padH }}>
      {actions.map((it, i) => (
        <GlassCircleButton key={it.key} icon={it.icon} label={it.label} expanded focused={focused && sel === i} active={it.lens ? lensEquals(it.lens, lens) : false} accent={it.accent} onPress={() => onActivate(i)} />
      ))}
      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: cs(4) }} />
      <ScrollView
        style={{ flex: 1, marginLeft: -RING_ROOM, marginTop: -RING_ROOM }}
        contentContainerStyle={{ gap, paddingLeft: RING_ROOM, paddingTop: RING_ROOM, paddingBottom: RING_ROOM }}
        showsVerticalScrollIndicator={false}
      >
        {filters.map((it, i) => {
          const idx = actions.length + i;
          return <GlassCircleButton key={it.key} icon={it.icon} label={it.label} sublabel={it.sublabel} expanded focused={focused && sel === idx} active={it.lens ? lensEquals(it.lens, lens) : false} accent={it.accent} onPress={() => onActivate(idx)} />;
        })}
      </ScrollView>
    </View>
  ) : (
    // Collapsed: the sliver background is a tap-to-expand target (outer Pressable), while each ACTION
    // circle fires its action directly (a nested Pressable captures its own tap so the parent doesn't
    // fire). The FILTER circle expands to reveal the lenses (no single lens to apply from collapsed).
    <Pressable onPress={onExpand} style={{ flex: 1, gap, paddingVertical: padV, paddingHorizontal: padH }}>
      {actions.map((it, i) => (
        <GlassCircleButton key={it.key} icon={it.icon} expanded={false} active={it.lens ? lensEquals(it.lens, lens) : false} accent={it.accent} onPress={() => onActivate(i)} />
      ))}
      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: cs(4) }} />
      <GlassCircleButton icon={<ListFilter size={cs(24)} color="#f1f5f9" />} expanded={false} active={!!activeFilter} accent={activeFilter?.accent} onPress={onExpand} />
    </Pressable>
  );

  // Outer: casts the drop shadow (NO overflow — iOS clips a view's own shadow when overflow:hidden).
  // Inner: overflow:hidden clips the labels during the slide + carries the surface + right border.
  return (
    <Animated.View
      style={[
        { position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 25, shadowColor: "#000", shadowOffset: { width: 24, height: 0 }, shadowRadius: 30, elevation: expanded ? 16 : 0 },
        outerStyle,
      ]}
    >
      <View style={{ flex: 1, overflow: "hidden", backgroundColor: C.sidebarBg, borderRightWidth: 1, borderRightColor: C.border }}>{content}</View>
    </Animated.View>
  );
}
