import * as LucideIcons from "lucide-react-native";
import { History, LayoutGrid, ListFilter, Menu, Settings as SettingsIcon, Star, User } from "lucide-react-native";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import type { Package } from "@/lib/api";
import { C } from "@/lib/theme";
import { accentVivid } from "@/lib/accent-palette";

import { GlassCircleButton } from "./glass-button";
import { SIDEBAR_EXPANDED_W, SIDEBAR_SLIVER_W } from "./layout";

/**
 * The guide's left sidebar, ported from tv-web's `guide-sidebar.tsx` — a collapsed sliver of glass
 * circles (actions Guide/Settings/Account + one "Filters" stand-in) that expands to reveal the
 * lenses (Favorites, Recents, each package in its tint). Same sliver (92) / expanded (300) widths,
 * same overlay behavior (absolute, grows over the grid; the layout only ever reserves the sliver).
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

export function buildSidebarItems(packages: Package[], lens: Lens): SidebarItem[] {
  const filtered = lens.type !== "all";
  const ic = (C: React.ComponentType<{ size?: number; color?: string }>) => <C size={24} color="#f1f5f9" />;
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
  onExpandFilters,
}: {
  items: SidebarItem[];
  expanded: boolean;
  focused: boolean;
  sel: number;
  lens: Lens;
  onActivate: (index: number) => void;
  /** Touch: tapping the collapsed "Filters" stand-in expands the sidebar to reveal the lenses. */
  onExpandFilters?: () => void;
}) {
  const actions = items.filter((i) => i.group === "action");
  const filters = items.filter((i) => i.group === "filter");
  const activeFilter = filters.find((f) => f.lens && lensEquals(f.lens, lens));

  const w = useSharedValue(expanded ? SIDEBAR_EXPANDED_W : SIDEBAR_SLIVER_W);
  useEffect(() => {
    w.value = withSpring(expanded ? SIDEBAR_EXPANDED_W : SIDEBAR_SLIVER_W, { stiffness: 320, damping: 34 });
  }, [expanded, w]);
  const animStyle = useAnimatedStyle(() => ({ width: w.value }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          overflow: "hidden",
          flexDirection: "column",
          gap: 14,
          paddingVertical: 24,
          paddingHorizontal: 18,
          backgroundColor: C.sidebarBg,
          borderRightWidth: 1,
          borderRightColor: C.border,
          zIndex: 25,
        },
        animStyle,
      ]}
    >
      {actions.map((it, i) => (
        <View key={it.key} style={{ flexShrink: 0 }}>
          <GlassCircleButton
            icon={it.icon}
            label={it.label}
            expanded={expanded}
            focused={focused && sel === i}
            active={it.lens ? lensEquals(it.lens, lens) : false}
            accent={it.accent}
            onPress={() => onActivate(i)}
          />
        </View>
      ))}

      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 4, flexShrink: 0 }} />

      <View style={{ flex: 1, minHeight: 0, gap: 14 }}>
        {expanded ? (
          filters.map((it, i) => {
            const idx = actions.length + i;
            return (
              <View key={it.key} style={{ flexShrink: 0 }}>
                <GlassCircleButton
                  icon={it.icon}
                  label={it.label}
                  sublabel={it.sublabel}
                  expanded
                  focused={focused && sel === idx}
                  active={it.lens ? lensEquals(it.lens, lens) : false}
                  accent={it.accent}
                  onPress={() => onActivate(idx)}
                />
              </View>
            );
          })
        ) : (
          <View style={{ flexShrink: 0 }}>
            <GlassCircleButton
              icon={<ListFilter size={24} color="#f1f5f9" />}
              expanded={false}
              active={!!activeFilter}
              accent={activeFilter?.accent}
              onPress={onExpandFilters}
            />
          </View>
        )}
      </View>
    </Animated.View>
  );
}
