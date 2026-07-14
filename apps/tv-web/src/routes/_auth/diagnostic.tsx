import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Diagnostic } from "../../features/diagnostic/diagnostic";

/** /diagnostic — the hands-off capability onboarding (auto-run on first sign-in). */
export const Route = createFileRoute("/_auth/diagnostic")({
  component: DiagnosticRoute,
});

function DiagnosticRoute() {
  const navigate = useNavigate();
  return <Diagnostic onExit={() => void navigate({ to: "/" })} />;
}
