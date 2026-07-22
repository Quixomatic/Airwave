import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { GuideScreen } from "../../features/guide/guide-screen";
import { usePlayer } from "../../features/watch/player-context";
import { setToken } from "../../lib/auth-client";

/** / — the Aurora guide grid. */
export const Route = createFileRoute("/_auth/")({
  component: GuideRoute,
});

function GuideRoute() {
  const navigate = useNavigate();
  const player = usePlayer();
  return (
    <GuideScreen
      // Tuning plays the channel full-screen via the persistent player (which then
      // survives a Back to the guide as a mini feed) — no route change.
      onTune={(channelId) => player.tune(channelId)}
      onSettings={() => void navigate({ to: "/settings" })}
      onDiagnostic={() => void navigate({ to: "/diagnostic" })}
      // The sidebar's Account circle opens the User page — sign-out lives there behind a confirm.
      onAccount={() => void navigate({ to: "/settings/user" })}
      // Only fires when the token is rejected (401), not from any UI affordance.
      onSignOut={() => {
        setToken(null);
        void navigate({ to: "/login" });
      }}
    />
  );
}
