import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useBreadcrumb } from "@/context/breadcrumb-provider";
import { HeaderLeft } from "@/context/header-provider";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/users/$id")({
  staticData: { breadcrumb: "User" },
  component: UserLayout,
});

function UserLayout() {
  const { id } = Route.useParams();
  const user = useQuery(trpc.users.get.queryOptions({ id }));
  const u = user.data;

  // Dynamic breadcrumb — the user's name / username / email (falls back to "User" while loading).
  useBreadcrumb(u ? u.name || u.email || undefined : undefined);

  return (
    <>
      <HeaderLeft>
        <nav className="flex items-center gap-1">
          <TabLink to="/users/$id" params={{ id }} exact>
            Overview
          </TabLink>
          <TabLink to="/users/$id/access" params={{ id }}>
            Access
          </TabLink>
        </nav>
      </HeaderLeft>
      <Outlet />
    </>
  );
}

function TabLink({
  to,
  params,
  exact,
  children,
}: {
  to: string;
  params: { id: string };
  exact?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      params={params}
      activeOptions={{ exact }}
      className="text-muted-foreground hover:text-foreground rounded-md px-2.5 py-1 text-sm font-medium transition-colors"
      activeProps={{ className: "text-foreground bg-accent rounded-md px-2.5 py-1 text-sm font-medium" }}
    >
      {children}
    </Link>
  );
}
