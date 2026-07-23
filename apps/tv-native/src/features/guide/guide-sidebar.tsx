import * as LucideIcons from "lucide-react-native";
import { History, LayoutGrid, ListFilter, Menu, Settings as SettingsIcon, Star, User } from "lucide-react-native";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import type { Package } from "@/lib/api";
import { C } from "@/lib/theme";
import { accentVivid } from "@/lib/accent-palette";

import { GlassCircleButton } from "./glass-button";
import { SIDEBAR_EXPANDED_W, SIDEBAR_SLIVER_W } from "./layout";

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
function pkgIcon(id: string | null): ReactNode {
  const Comp = id && id.startsWith("lucide:") ? LU[id.slice(7)] ?? LucideIcons.Folder : LucideIcons.Folder;
  return <Comp size={24} color="#f1f5f9" />;
}
const ic = (Cmp: React.ComponentType<{ size?: number; color?: string }>) => <Cmp size={24} color="#f1f5f9" />;

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
  lens,
  onActivate,
  onExpand,
}: {
  items: SidebarItem[];
  expanded: boolean;
  lens: Lens;
  onActivate: (index: number) => void;
  /** Touch: tapping the collapsed sliver expands it to reveal the lenses. */
  onExpand: () => void;
}) {
  const actions = items.filter((i) => i.group === "action");
  const filters = items.filter((i) => i.group === "filter");
  const activeFilter = filters.find((f) => f.lens && lensEquals(f.lens, lens));

  const w = useSharedValue(expanded ? SIDEBAR_EXPANDED_W : SIDEBAR_SLIVER_W);
  useEffect(() => {
    w.value = withSpring(expanded ? SIDEBAR_EXPANDED_W : SIDEBAR_SLIVER_W, { stiffness: 320, damping: 34 });
  }, [expanded, w]);
  const animStyle = useAnimatedStyle(() => ({ width: w.value }));

  const base = {
    position: "absolute" as const,
    left: 0,
    top: 0,
    bottom: 0,
    overflow: "hidden" as const,
    backgroundColor: C.sidebarBg,
    borderRightWidth: 1,
    borderRightColor: C.border,
    zIndex: 25,
  };

  // Collapsed: the whole sliver is one tap target that expands. Circles are visual only.
  if (!expanded) {
    return (
      <Animated.View style={[base, animStyle]}>
        <Pressable onPress={onExpand} style={{ flex: 1, flexDirection: "column", gap: 14, paddingVertical: 24, paddingHorizontal: 18 }}>
          {actions.map((it) => (
            <GlassCircleButton
              key={it.key}
              icon={it.icon}
              expanded={false}
              active={it.lens ? lensEquals(it.lens, lens) : false}
              accent={it.accent}
            />
          ))}
          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 4 }} />
          <GlassCircleButton icon={<ListFilter size={24} color="#f1f5f9" />} expanded={false} active={!!activeFilter} accent={activeFilter?.accent} />
        </Pressable>
      </Animated.View>
    );
  }

  // Expanded: interactive circles + labels; the lens list scrolls (packages exceed the screen).
  return (
    <Animated.View style={[base, animStyle]}>
      <View style={{ flex: 1, flexDirection: "column", gap: 14, paddingVertical: 24, paddingHorizontal: 18 }}>
        {actions.map((it, i) => (
          <GlassCircleButton
            key={it.key}
            icon={it.icon}
            label={it.label}
            expanded
            active={it.lens ? lensEquals(it.lens, lens) : false}
            accent={it.accent}
            onPress={() => onActivate(i)}
          />
        ))}
        <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 4 }} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
          {filters.map((it, i) => {
            const idx = actions.length + i;
            return (
              <GlassCircleButton
                key={it.key}
                icon={it.icon}
                label={it.label}
                sublabel={it.sublabel}
                expanded
                active={it.lens ? lensEquals(it.lens, lens) : false}
                accent={it.accent}
                onPress={() => onActivate(idx)}
              />
            );
          })}
        </ScrollView>
      </View>
    </Animated.View>
  );
}
