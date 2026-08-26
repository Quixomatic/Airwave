import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@airwave/ui/components/sidebar";

import { Logo } from "@/components/logo";
import { APP_VERSION } from "@/lib/app-info";

import { NavGroup } from "./nav-group";
import { OnboardingChecklist } from "./onboarding-checklist";
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
        {/* Onboarding checklist directly beneath the menu items (scrolls with the nav). */}
        <OnboardingChecklist />
      </SidebarContent>
      {/* Subtle brand + version, pinned to the bottom. Hidden when the sidebar is icon-collapsed. */}
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <a
          href="https://github.com/Quixomatic/Airwave"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 px-2 py-1 text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <Logo markWidth={14} />
          <span className="text-[11px] font-medium">Airwave v{APP_VERSION}</span>
        </a>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
