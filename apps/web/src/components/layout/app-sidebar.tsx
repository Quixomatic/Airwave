import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@ChannelGuide/ui/components/sidebar";
import { Link, useLocation } from "@tanstack/react-router";
import { Clapperboard, LayoutGrid, Radio, Server, Settings, Tv, Users } from "lucide-react";

import { UserMenu } from "./user-menu";

const NAV = [
  { title: "Channels", url: "/channels", icon: Tv },
  { title: "Packages", url: "/packages", icon: LayoutGrid },
  { title: "Sources", url: "/sources", icon: Server },
  { title: "Bumpers", url: "/bumpers", icon: Clapperboard },
  { title: "Users", url: "/users", icon: Users },
  { title: "Settings", url: "/settings", icon: Settings },
] as const;

export function AppSidebar() {
  const href = useLocation({ select: (l) => l.href });

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-14 justify-center px-3">
        <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
          <Radio className="text-primary size-5 shrink-0" />
          <span className="truncate group-data-[collapsible=icon]:hidden">ChannelGuide</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV.map((item) => {
              const isActive = href === item.url || href.split("?")[0] === item.url;
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    render={
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    }
                    isActive={isActive}
                    tooltip={item.title}
                  />
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
