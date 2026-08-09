// SidebarTrigger temporarily hidden from the TopHeader — re-add the import to restore it.
import { Button } from "@airwave/ui/components/button";
import { SidebarProvider } from "@airwave/ui/components/sidebar";
import { Outlet, useMatches } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import {
  HeaderCenterSlot,
  HeaderLeftSlot,
  HeaderProvider,
  HeaderRightSlot,
  TopHeaderCenterSlot,
  TopHeaderLeftSlot,
  TopHeaderRightSlot,
} from "@/context/header-provider";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { BreadcrumbProvider } from "@/context/breadcrumb-provider";
import { DetailsPanelProvider, useDetailsPanel } from "@/context/details-panel-provider";
import { PanelHeaderProvider } from "@/context/panel-header-provider";
import { cn } from "@/lib/utils";

import { AppSidebar } from "./app-sidebar";
import { DetailsPanel } from "./details-panel";

/**
 * Routes can opt out of the SubHeader with `staticData: { hideSubHeader: true }`,
 * or drop the content `p-6` with `staticData: { fullBleed: true }`.
 */
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    hideSubHeader?: boolean;
    fullBleed?: boolean;
  }
}

/**
 * Authenticated layout (BasicTimeTracker parity, single-tenant).
 *
 *   SidebarProvider (bg-noisy wrapper, flex row)
 *     AppSidebar
 *     RightArea (flex column)
 *       TopHeader   (transparent h-14, noisy bg shows through)
 *       MainRow
 *         InsetMain (rounded-md border bg-background — the card)
 *           SubHeader   (page-level portal slots, h-10 border-b)
 *           PageContent (Outlet, scrollable)
 */
export function AppLayout() {
  return (
    <SidebarProvider defaultOpen>
      <DetailsPanelProvider>
        <PanelHeaderProvider>
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <HeaderProvider>
              <BreadcrumbProvider>
                <TopHeader />
                <div className="flex min-h-0 flex-1 pr-1 pb-1">
                  <main className="bg-background m-2 mt-0 ml-0 flex flex-1 flex-col overflow-hidden rounded-md border shadow-sm">
                    <SubHeader />
                    <PageContent />
                  </main>
                  <DetailsPanel />
                </div>
              </BreadcrumbProvider>
            </HeaderProvider>
          </div>
        </PanelHeaderProvider>
      </DetailsPanelProvider>
    </SidebarProvider>
  );
}

/** Toggles the global AI assistant panel from the top header. */
function AiPanelTrigger() {
  const { toggleGlobalPanel, globalPanelType } = useDetailsPanel();
  return (
    <Button
      variant={globalPanelType === "chat" ? "secondary" : "ghost"}
      size="sm"
      onClick={() => toggleGlobalPanel("chat")}
    >
      <Sparkles className="h-4 w-4" />
      AI Assistant
    </Button>
  );
}

function TopHeader() {
  return (
    <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3">
      <TopHeaderLeftSlot className="flex items-center gap-2 justify-self-start">
        {/* <SidebarTrigger /> */}
        <Breadcrumbs />
      </TopHeaderLeftSlot>
      <TopHeaderCenterSlot className="justify-self-center" />
      <TopHeaderRightSlot className="flex items-center gap-2 justify-self-end">
        <AiPanelTrigger />
      </TopHeaderRightSlot>
    </header>
  );
}

function PageContent() {
  const matches = useMatches();
  const fullBleed = matches.some((m) => m.staticData?.fullBleed === true);
  // Default: a centered, max-width column with page padding — so every page is consistent
  // and individual pages no longer hand-roll `mx-auto max-w-*`. A page that genuinely needs
  // the full width opts out with `staticData: { fullBleed: true }` (e.g. the guide grid).
  return (
    <div className="flex-1 overflow-auto">
      {fullBleed ? (
        <Outlet />
      ) : (
        <div className="mx-auto max-w-6xl p-6">
          <Outlet />
        </div>
      )}
    </div>
  );
}

function SubHeader() {
  const matches = useMatches();
  const hide = matches.some((m) => m.staticData?.hideSubHeader === true);
  if (hide) return null;

  return (
    <header className="grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-3">
      <div className="flex items-center gap-2 justify-self-start">
        <HeaderLeftSlot className="flex items-center gap-2" />
      </div>
      <HeaderCenterSlot className="justify-self-center" />
      <HeaderRightSlot className="flex items-center gap-2 justify-self-end" />
    </header>
  );
}
