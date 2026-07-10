import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@ChannelGuide/ui/components/sidebar";
import { Outlet } from "@tanstack/react-router";

import { HeaderLeftSlot, HeaderProvider, HeaderRightSlot } from "@/context/header-provider";

import { AppSidebar } from "./app-sidebar";

export function AppLayout() {
  return (
    <HeaderProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
            <SidebarTrigger className="-ml-1" />
            <HeaderLeftSlot className="flex min-w-0 items-center gap-2" />
            <div className="flex-1" />
            <HeaderRightSlot className="flex items-center gap-2" />
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </HeaderProvider>
  );
}
