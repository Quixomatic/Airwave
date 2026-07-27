import { Slot, usePathname, useRouter } from "expo-router";
import { ArrowLeft, Cpu, Info, Server as ServerIcon, SlidersHorizontal, UserRound } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TvPressable as Pressable } from "@/components/tv-pressable";

import { SettingsSidebar } from "@/features/settings/settings-sidebar";
import { SettingsCtx } from "@/features/settings/settings-ui";
import { cs, SIDEBAR_SLIVER_W } from "@/features/guide/layout";
import { LAYER, useKeyLayer } from "@/lib/input";
import { C } from "@/lib/theme";

/**
 * The settings shell — a master-detail, ported from tv-web's `/settings` route. A sliver category
 * rail (the guide's glass-circle treatment) + the selected subpage (`<Slot/>`). D-pad zoning: on the
 * RAIL ▲/▼ move between categories, OK opens one (Guide returns to the guide), ► enters content,
 * Back returns to the guide; in CONTENT each page self-manages option focus (`useSettingsPage`).
 */
const ic = (Cmp: React.ComponentType<{ size?: number; color?: string }>) => <Cmp size={cs(24)} color="#f1f5f9" />;
const NAV = [
  { key: "guide", label: "Back to Guide", icon: ic(ArrowLeft), to: "/" as const },
  { key: "general", label: "General", icon: ic(SlidersHorizontal), to: "/settings" as const },
  { key: "user", label: "User", icon: ic(UserRound), to: "/settings/user" as const },
  { key: "server", label: "Server", icon: ic(ServerIcon), to: "/settings/server" as const },
  { key: "device", label: "Device", icon: ic(Cpu), to: "/settings/device" as const },
  { key: "about", label: "About", icon: ic(Info), to: "/settings/about" as const },
];

const KEY_BY_PATH: Record<string, string> = {
  "/settings": "general",
  "/settings/user": "user",
  "/settings/server": "server",
  "/settings/device": "device",
  "/settings/about": "about",
};

export default function SettingsShell() {
  const router = useRouter();
  const pathname = usePathname();
  const activeKey = KEY_BY_PATH[pathname] ?? "general";
  const [zone, setZone] = useState<"rail" | "content">("content");
  const [sel, setSel] = useState(() => Math.max(1, NAV.findIndex((n) => n.key === activeKey)));

  const returnToRail = useCallback(() => setZone("rail"), []);
  const activate = useCallback(
    (i: number) => {
      const item = NAV[i]!;
      if (item.key === "guide") {
        router.replace("/guide");
        return;
      }
      router.replace(item.to);
      setZone("content");
    },
    [router],
  );

  // The rail's D-pad layer — active only while the rail is focused (content is owned by the page's
  // useSettingsPage layer), so the two never both act on a key.
  useKeyLayer({
    id: "settings-rail",
    priority: LAYER.BASE,
    active: zone === "rail",
    onKey(e) {
      switch (e.key) {
        case "up":
          setSel((s) => Math.max(0, s - 1));
          return true;
        case "down":
          setSel((s) => Math.min(NAV.length - 1, s + 1));
          return true;
        case "ok":
          activate(sel);
          return true;
        case "right":
          setZone("content");
          return true;
        case "back":
          router.replace("/guide");
          return true;
      }
      return false;
    },
  });

  const expanded = zone === "rail";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={{ width: cs(SIDEBAR_SLIVER_W), flexShrink: 0 }} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ maxWidth: 1024, width: "100%", alignSelf: "center", paddingVertical: 40, paddingHorizontal: 48 }}>
          <SettingsCtx.Provider value={{ active: zone === "content", returnToRail }}>
            <Slot />
          </SettingsCtx.Provider>
        </ScrollView>
      </View>

      {expanded && <Pressable onPress={() => setZone("content")} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(6,10,20,0.5)", zIndex: 24 }} />}

      <SettingsSidebar
        items={NAV.map((n) => ({ key: n.key, label: n.label, icon: n.icon }))}
        expanded={expanded}
        focused={expanded}
        sel={sel}
        activeKey={activeKey}
        onActivate={activate}
        onExpand={() => setZone("rail")}
      />
    </SafeAreaView>
  );
}
