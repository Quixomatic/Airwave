import type { LucideIcon } from "lucide-react";

import type { TintedIconTileTint } from "@ChannelGuide/ui/components/tinted-icon-tile";

type BaseNavItem = {
  title: string;
  badge?: string;
  icon?: LucideIcon;
  /** Color shade for the tinted icon tile next to the label. */
  iconTint?: TintedIconTileTint;
};

export type NavLink = BaseNavItem & {
  url: string;
  items?: never;
};

export type NavCollapsible = BaseNavItem & {
  url?: never;
  items: NavLink[];
};

export type NavItem = NavLink | NavCollapsible;

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export type SidebarData = {
  navGroups: NavGroup[];
};
