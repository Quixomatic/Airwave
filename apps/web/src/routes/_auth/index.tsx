import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/")({
  staticData: { breadcrumb: "Dashboard" },
  component: RouteComponent,
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const privateData = useQuery(trpc.privateData.queryOptions());

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Welcome{session.data?.user.name ? `, ${session.data.user.name}` : ""}.
      </p>
      <p className="text-muted-foreground mt-3 text-xs">
        API: {privateData.data?.message ?? "…"}
      </p>
    </div>
  );
}
