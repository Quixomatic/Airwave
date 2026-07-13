import { Clapperboard, LayoutGrid, Server, Settings, Tv, Tv2, Users } from "lucide-react";

import type { SidebarData } from "./types";

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: "Manage",
      items: [
        { title: "Guide", url: "/guide", icon: Tv2, iconTint: "cyan" },
        { title: "Channels", url: "/channels", icon: Tv, iconTint: "indigo" },
        { title: "Packages", url: "/packages", icon: LayoutGrid, iconTint: "violet" },
        { title: "Sources", url: "/sources", icon: Server, iconTint: "sky" },
        { title: "Bumpers", url: "/bumpers", icon: Clapperboard, iconTint: "amber" },
        { title: "Users", url: "/users", icon: Users, iconTint: "emerald" },
        { title: "Settings", url: "/settings/main", icon: Settings, iconTint: "rose" },
      ],
    },
  ],
};
