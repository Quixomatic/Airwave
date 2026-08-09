import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@airwave/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@airwave/ui/components/sidebar";
import { tintClassesForSeed } from "@airwave/ui/lib/string-to-tint";
import { useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, LogOut, Monitor, Moon, Sun, User } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { authClient, useSession } from "@/lib/auth-client";

function getInitials(value: string): string {
  const parts = value.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return value.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const { theme, setTheme } = useTheme();
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate({ to: "/login" });
  };

  if (isPending || !session) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <div className="bg-muted flex aspect-square size-7 items-center justify-center rounded-md border">
              <User className="size-4" />
            </div>
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate font-semibold">Loading…</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const user = session.user;
  const displayName = user.name || user.email;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={displayName}
                className="h-10 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              />
            }
          >
            <div
              className={cn(
                "flex aspect-square size-7 items-center justify-center overflow-hidden rounded-md border",
                user.image ? "bg-background" : tintClassesForSeed(user.id),
              )}
            >
              {user.image ? (
                <img src={user.image} alt={displayName} className="size-7 object-cover" />
              ) : (
                <span className="text-xs font-semibold">{getInitials(displayName)}</span>
              )}
            </div>
            {!isCollapsed && (
              <>
                <span className="flex-1 truncate text-start text-sm font-semibold">
                  {user.name || "Account"}
                </span>
                <ChevronsUpDown className="ms-auto" />
              </>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent className="w-64" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{user.name || "Account"}</p>
                  <p className="text-muted-foreground text-xs">{user.email}</p>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Monitor className="mr-2 h-4 w-4" />
                  <span>Theme</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setTheme("light")}>
                    <Sun className="mr-2 h-4 w-4" />
                    <span>Light</span>
                    {theme === "light" && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme("dark")}>
                    <Moon className="mr-2 h-4 w-4" />
                    <span>Dark</span>
                    {theme === "dark" && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme("system")}>
                    <Monitor className="mr-2 h-4 w-4" />
                    <span>System</span>
                    {theme === "system" && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
