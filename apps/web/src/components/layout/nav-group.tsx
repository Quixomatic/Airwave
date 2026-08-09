import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@airwave/ui/components/collapsible";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@airwave/ui/components/sidebar";
import { TintedIconTile } from "@airwave/ui/components/tinted-icon-tile";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import type { NavGroup as NavGroupProps, NavLink } from "./types";

export function NavGroup({ title, items }: NavGroupProps) {
  const href = useLocation({ select: (l) => l.href });
  const [open, setOpen] = useState(true);

  return (
    <SidebarGroup className="group/nav-section">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="group/section-title flex h-7 w-full shrink-0 cursor-pointer items-center justify-between rounded-md px-2 text-xs font-medium text-sidebar-foreground/60 outline-hidden ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground/80 focus-visible:ring-2 group-data-[collapsible=icon]:hidden"
              aria-label={`Toggle ${title}`}
            />
          }
        >
          <span>{title}</span>
          <ChevronRight
            className={cn(
              "h-3 w-3 opacity-0 transition-all duration-200",
              "group-hover/section-title:opacity-100",
              open && "rotate-90",
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <SidebarMenu>
            {items.map((item) =>
              item.url ? (
                <SidebarMenuLink
                  key={`${item.title}-${item.url}`}
                  item={item as NavLink}
                  href={href}
                />
              ) : null,
            )}
          </SidebarMenu>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}

function SidebarMenuLink({ item, href }: { item: NavLink; href: string }) {
  const { setOpenMobile } = useSidebar();
  const isActive = href === item.url || href.split("?")[0] === item.url;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={
          <Link to={item.url} onClick={() => setOpenMobile(false)}>
            {item.icon && (
              <TintedIconTile icon={item.icon} tint={item.iconTint ?? "gray"} />
            )}
            <span>{item.title}</span>
          </Link>
        }
        isActive={isActive}
        tooltip={item.title}
      />
    </SidebarMenuItem>
  );
}
