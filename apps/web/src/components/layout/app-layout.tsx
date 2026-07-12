import { SidebarProvider, SidebarTrigger } from "@ChannelGuide/ui/components/sidebar";
import { Outlet, useMatches } from "@tanstack/react-router";

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
import { cn } from "@/lib/utils";

import { AppSidebar } from "./app-sidebar";

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
            </div>
          </BreadcrumbProvider>
        </HeaderProvider>
      </div>
    </SidebarProvider>
  );
}

function TopHeader() {
  return (
    <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3">
      <TopHeaderLeftSlot className="flex items-center gap-2 justify-self-start">
        <SidebarTrigger />
        <Breadcrumbs />
      </TopHeaderLeftSlot>
      <TopHeaderCenterSlot className="justify-self-center" />
      <TopHeaderRightSlot className="flex items-center gap-2 justify-self-end" />
    </header>
  );
}

function PageContent() {
  const matches = useMatches();
  const fullBleed = matches.some((m) => m.staticData?.fullBleed === true);
  return (
    <div className={cn("flex-1 overflow-auto", fullBleed ? "" : "p-6")}>
      <Outlet />
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
