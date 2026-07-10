import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@ChannelGuide/ui/components/sidebar";

import { NavGroup } from "./nav-group";
import { sidebarData } from "./sidebar-data";
import { UserMenu } from "./user-menu";

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-14 flex-row items-center px-2 py-0">
        <UserMenu />
      </SidebarHeader>
      <SidebarContent className="[&>[data-slot=sidebar-group]:first-child]:pt-0">
        {sidebarData.navGroups.map((group) => (
          <NavGroup key={group.title} {...group} />
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
