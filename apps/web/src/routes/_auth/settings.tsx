import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { HeaderLeft } from "@/context/header-provider";

const TABS = [
  { label: "General", to: "/settings/main" },
  { label: "AI Assistant", to: "/settings/ai" },
  { label: "Jobs & Cache", to: "/settings/jobs" },
  { label: "Workflows", to: "/settings/workflows" },
  { label: "About", to: "/settings/about" },
] as const;

/**
 * Layout for `/settings/*` — declares the "Settings" breadcrumb (with its sidebar
 * icon) and renders the section tabs into the SubHeader (HeaderLeft).
 */
export const Route = createFileRoute("/_auth/settings")({
  staticData: { breadcrumb: "Settings", breadcrumbIcon: Settings, breadcrumbTint: "rose" },
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <>
      <HeaderLeft>
        <nav className="flex items-center gap-1">
          {TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              className="text-muted-foreground hover:text-foreground rounded-md px-2.5 py-1 text-sm font-medium transition-colors"
              activeProps={{ className: "text-foreground bg-accent" }}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </HeaderLeft>
      <Outlet />
    </>
  );
}
