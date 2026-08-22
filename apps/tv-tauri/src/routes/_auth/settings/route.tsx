import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Cpu, Info, Server, SlidersHorizontal, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { COLLAPSED_W, EXPANDED_W, SIDEBAR_SLIVER_W } from "../../../features/guide/guide-sidebar";
import { SettingsSidebar } from "../../../features/settings/settings-sidebar";
import { SettingsCtx } from "../../../features/settings/settings-ui";
import { LAYER, useKeyLayer } from "../../../lib/input";

/**
 * /settings — a master-detail shell over nested routes (faithful port of tv-web's settings route). The
 * left rail is the SAME desktop sidebar as the guide; the right pane is the selected subpage's content
 * (`<Outlet/>`), its header STICKY while the body scrolls. Zone machine mirrors tv-web: on the RAIL,
 * ▲/▼ move between sections and OK/► enter the content; in CONTENT each page self-manages option focus
 * (`useSettingsPage`) and ◄/Back returns to the rail. Mouse: hover expands the rail, click switches
 * section, click drives every content row.
 */
export const Route = createFileRoute("/_auth/settings")({
  component: SettingsShell,
});

const NAV = [
  { key: "guide", label: "Back to Guide", icon: <ArrowLeft size={20} />, to: "/" },
  { key: "general", label: "General", icon: <SlidersHorizontal size={20} />, to: "/settings" },
  { key: "user", label: "User", icon: <UserRound size={20} />, to: "/settings/user" },
  { key: "server", label: "Server", icon: <Server size={20} />, to: "/settings/server" },
  { key: "device", label: "Device", icon: <Cpu size={20} />, to: "/settings/device" },
  { key: "about", label: "About", icon: <Info size={20} />, to: "/settings/about" },
] as const;

const KEY_BY_PATH: Record<string, string> = {
  "/settings": "general",
  "/settings/user": "user",
  "/settings/server": "server",
  "/settings/device": "device",
  "/settings/about": "about",
};
const keyForPath = (p: string) => KEY_BY_PATH[p] ?? "";

function SettingsShell() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeKey = keyForPath(pathname);

  // Land straight in the content (General focused) — ◄/Back moves keyboard focus onto the rail.
  const [zone, setZone] = useState<"rail" | "content">("content");
  // The rail is PERSISTENT + expanded by default and pushes the content over (it no longer overlays);
  // the rail's bottom toggle folds it to a slim icon rail. This is width only, independent of focus.
  const [collapsed, setCollapsed] = useState(false);
  const [sel, setSel] = useState(() => Math.max(1, NAV.findIndex((n) => n.key === activeKey)));

  // Keep the rail highlight on the current route if it changes from elsewhere.
  useEffect(() => {
    const i = NAV.findIndex((n) => n.key === activeKey);
    if (i >= 0) setSel(i);
  }, [activeKey]);

  const returnToRail = useCallback(() => setZone("rail"), []);
  const activate = useCallback(
    (i: number) => {
      const item = NAV[i]!;
      if (item.key === "guide") {
        void navigate({ to: "/" });
        return;
      }
      void navigate({ to: item.to });
      setZone("content");
    },
    [navigate],
  );

  // The category rail — only on the stack while the rail is focused; the content zone is owned by each
  // subpage's `useSettingsPage` layer, so the two never both act on a key.
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
          if (activeKey) setZone("content");
          return true;
        case "back":
          void navigate({ to: "/" });
          return true;
      }
      return false;
    },
  });

  // The rail sits in the layout, so reserve its width: the slim sliver when collapsed, else the sliver
  // plus the extra expanded width. Animates in step with the rail's own width spring.
  const contentLeft = collapsed ? SIDEBAR_SLIVER_W : SIDEBAR_SLIVER_W + (EXPANDED_W - COLLAPSED_W);

  return (
    <div style={{ position: "absolute", inset: 0, background: "#060a14", color: "#f1f5f9", overflow: "hidden" }}>
      <SettingsSidebar
        items={NAV.map((n) => ({ key: n.key, label: n.label, icon: n.icon }))}
        activeKey={activeKey}
        collapsed={collapsed}
        focused={zone === "rail"}
        sel={sel}
        onActivate={activate}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />

      <div
        className="cg-grid-scroll"
        style={{ marginLeft: contentLeft, height: "100%", overflowY: "auto", transition: "margin-left 0.28s ease" }}
      >
        <div style={{ maxWidth: 1024, margin: "0 auto" }}>
          <SettingsCtx.Provider value={{ active: zone === "content", returnToRail }}>
            <Outlet />
          </SettingsCtx.Provider>
        </div>
      </div>
    </div>
  );
}
