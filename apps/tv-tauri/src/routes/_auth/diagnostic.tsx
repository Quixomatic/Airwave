import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Diagnostic } from "../../screens/Diagnostic";

/** /diagnostic — mpv-measured capability diagnostic (Phase 2.4). Faithful port of tv-native's
 *  mpv-based Diagnostic; exits back to the guide. */
export const Route = createFileRoute("/_auth/diagnostic")({
  component: DiagnosticRoute,
});

function DiagnosticRoute() {
  const navigate = useNavigate();
  return <Diagnostic onExit={() => void navigate({ to: "/" })} />;
}
