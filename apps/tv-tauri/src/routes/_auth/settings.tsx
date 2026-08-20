import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "@airwave/ui/components/button";

/** /settings — Phase 5 (the master-detail settings ported from tv-web). Placeholder for now. */
export const Route = createFileRoute("/_auth/settings")({
  component: SettingsRoute,
});

function SettingsRoute() {
  const navigate = useNavigate();
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-background p-10 text-center text-foreground">
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="max-w-md text-muted-foreground">
        General / User / Server / Device / Audio / About land here in Phase 5.
      </p>
      <Button variant="outline" onClick={() => void navigate({ to: "/" })}>
        ← Back to guide
      </Button>
    </div>
  );
}
