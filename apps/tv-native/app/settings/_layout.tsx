import { Slot, usePathname, useRouter } from "expo-router";
import { ArrowLeft, Cpu, Info, Server as ServerIcon, SlidersHorizontal, UserRound } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { ScrollView, View } from "react-native";

import { TvPressable as Pressable } from "@/components/tv-pressable";

import { SettingsSidebar } from "@/features/settings/settings-sidebar";
import { SettingsCtx } from "@/features/settings/settings-ui";
import { cs, scaled, SIDEBAR_SLIVER_W } from "@/features/guide/layout";
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

  // D-pad snap-scroll for the content pane. `SettingRow` calls `ensureVisible` when it gains focus; the
  // shell measures the row's position within the scroll content and snaps it into view ONLY when it's
  // off-screen (mirrors the guide grid + guide sidebar). measureLayout is used because rows are nested in
  // sections/columns, so a plain onLayout Y wouldn't be content-relative.
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const viewHRef = useRef(0);
  const scrollYRef = useRef(0);
  const ensureVisible = useCallback((node: View | null) => {
    const content = contentRef.current;
    const sv = scrollRef.current;
    const h = viewHRef.current;
    if (!node || !content || !sv || h <= 0) return;
    node.measureLayout(
      content,
      (_x, y, _w, hh) => {
        const cushion = cs(20); // leave breathing room above/below the focused row
        const off = scrollYRef.current;
        const top = y - cushion;
        const bottom = y + hh + cushion;
        if (top < off) {
          const ny = Math.max(0, top);
          sv.scrollTo({ y: ny, animated: false });
          scrollYRef.current = ny;
        } else if (bottom > off + h) {
          const ny = bottom - h;
          sv.scrollTo({ y: ny, animated: false });
          scrollYRef.current = ny;
        }
        // else: already fully visible → leave it put.
      },
      () => {},
    );
  }, []);
  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    scrollYRef.current = 0;
  }, []);

  return (
    // Full-bleed on Apple TV / iPad (a plain View — NOT SafeAreaView, which on tvOS applies the title-safe
    // overscan margin on all four edges and pushed the whole shell + sidebar massively inward). The
    // Android-TV overscan inset is applied ONCE at the app root (app/_layout.tsx), so every screen uses this
    // Apple TV layout unchanged — no per-screen overscan.
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={{ width: cs(SIDEBAR_SLIVER_W), flexShrink: 0 }} />
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          onLayout={(e) => { viewHRef.current = e.nativeEvent.layout.height; }}
          onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
        >
          {/* Inner content view carries the max-width/centering/padding (moved off contentContainerStyle) so
              it's a stable measurement root: a focused row's y measured against this view maps 1:1 to the
              scroll offset. */}
          <View ref={contentRef} style={scaled({ maxWidth: 1024, width: "100%", alignSelf: "center", paddingVertical: 40, paddingHorizontal: 48 })}>
            <SettingsCtx.Provider value={{ active: zone === "content", returnToRail, ensureVisible, scrollToTop }}>
              <Slot />
            </SettingsCtx.Provider>
          </View>
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
    </View>
  );
}
