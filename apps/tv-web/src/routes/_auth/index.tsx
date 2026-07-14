import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Home } from "../../features/guide/home";
import { setToken } from "../../lib/auth-client";

/** / — the guide (channel list → Aurora grid). */
export const Route = createFileRoute("/_auth/")({
  component: GuideRoute,
});

function GuideRoute() {
  const navigate = useNavigate();
  return (
    <Home
      onSignOut={() => {
        setToken(null);
        void navigate({ to: "/login" });
      }}
      onWatch={(channel) => void navigate({ to: "/watch/$channelId", params: { channelId: channel.id } })}
      onDiagnostic={() => void navigate({ to: "/diagnostic" })}
    />
  );
}
