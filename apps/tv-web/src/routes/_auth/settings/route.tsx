import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Cpu, SlidersHorizontal, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SettingsSidebar, SETTINGS_SLIVER_W } from "../../../features/settings/settings-sidebar";
import { SettingsCtx } from "../../../features/settings/settings-ui";

/**
 * /settings — a master-detail shell. A sliver sidebar (the guide's glass-circle treatment, dedicated
 * to settings) on the left + the selected subpage's content on the right (`<Outlet/>` over nested
 * routes). D-pad zoning: on the RAIL, ▲/▼ move focus between category circles (the rail expands),
 * OK opens a category and hops into its content (Guide returns to live TV), ► enters the current
 * page's content, Back returns to the guide. In CONTENT, each page self-manages option focus
 * (`useSettingsPage`) and ◄/Back returns focus to the rail.
 */
export const Route = createFileRoute("/_auth/settings")({
  component: SettingsShell,
});

const NAV: { key: string; label: string; icon: React.ReactNode; to: string }[] = [
  { key: "guide", label: "Back to Guide", icon: <ArrowLeft size={24} />, to: "/" },
  { key: "general", label: "General", icon: <SlidersHorizontal size={24} />, to: "/settings" },
  { key: "user", label: "User", icon: <UserRound size={24} />, to: "/settings/user" },
  { key: "device", label: "Device", icon: <Cpu size={24} />, to: "/settings/device" },
];

const BACK_KEYS = ["Backspace", "GoBack", "BrowserBack", "XF86Back"];
const isBack = (e: KeyboardEvent) => e.keyCode === 461 || BACK_KEYS.includes(e.key);
const keyForPath = (p: string) =>
  p === "/settings/user" ? "user" : p === "/settings/device" ? "device" : p === "/settings" ? "general" : "";

function SettingsShell() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeKey = keyForPath(pathname);
  // Land straight in the content (General page focused, sidebar collapsed to a sliver) — ◄/Back
  // opens the rail.
  const [zone, setZone] = useState<"rail" | "content">("content");
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (zone !== "rail") return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSel((s) => Math.max(0, s - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSel((s) => Math.min(NAV.length - 1, s + 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        activate(sel);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        if (activeKey) setZone("content");
      } else if (isBack(e)) {
        e.preventDefault();
        e.stopPropagation();
        void navigate({ to: "/" });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zone, sel, activeKey, activate, navigate]);

  const expanded = zone === "rail";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#060a14", color: "#f1f5f9", overflow: "hidden" }}>
      {/* Scrim behind the expanded rail (no blur — perf), so the content reads as "behind". */}
      {expanded && <div style={{ position: "absolute", inset: 0, background: "rgba(6,10,20,0.5)", zIndex: 24 }} />}

      <SettingsSidebar
        items={NAV.map((n) => ({ key: n.key, label: n.label, icon: n.icon }))}
        expanded={expanded}
        focused={expanded}
        sel={sel}
        activeKey={activeKey}
        onActivate={activate}
      />

      <div style={{ marginLeft: SETTINGS_SLIVER_W, height: "100%", overflowY: "auto" }}>
        {/* Inset the content: a centered, max-width column so it doesn't hug the sidebar on a wide panel. */}
        <div style={{ maxWidth: 1024, margin: "0 auto", padding: "56px 64px" }}>
          <SettingsCtx.Provider value={{ active: zone === "content", returnToRail }}>
            <Outlet />
          </SettingsCtx.Provider>
        </div>
      </div>
    </div>
  );
}
