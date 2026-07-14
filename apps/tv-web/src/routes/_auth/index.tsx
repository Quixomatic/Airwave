import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { GuideScreen } from "../../features/guide/guide-screen";
import { setToken } from "../../lib/auth-client";

/** / — the Aurora guide grid. */
export const Route = createFileRoute("/_auth/")({
  component: GuideRoute,
});

function GuideRoute() {
  const navigate = useNavigate();
  return (
    <GuideScreen
      onTune={(channelId) => void navigate({ to: "/watch/$channelId", params: { channelId } })}
      onSettings={() => void navigate({ to: "/settings" })}
      onDiagnostic={() => void navigate({ to: "/diagnostic" })}
      onSignOut={() => {
        setToken(null);
        void navigate({ to: "/login" });
      }}
    />
  );
}
