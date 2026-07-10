import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/channels")({
  component: () => (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
      <p className="text-muted-foreground mt-1 text-sm">Coming soon.</p>
    </div>
  ),
});
