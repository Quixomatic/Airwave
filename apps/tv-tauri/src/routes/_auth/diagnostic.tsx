import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "@airwave/ui/components/button";

/** /diagnostic — mpv-measured capability diagnostic (Phase 2.4). Faithful-port target of tv-web
 *  `routes/_auth/diagnostic.tsx`; the real measurement UI lands next. Placeholder for now. */
export const Route = createFileRoute("/_auth/diagnostic")({
  component: DiagnosticRoute,
});

function DiagnosticRoute() {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-background p-10 text-center text-foreground">
      <h1 className="text-3xl font-bold">Capability diagnostic</h1>
      <p className="max-w-md text-muted-foreground">
        mpv-measured decode caps land here (Phase 2.4).
      </p>
      <Button variant="outline" onClick={() => void navigate({ to: "/" })}>
        Back to guide
      </Button>
    </div>
  );
}
