import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { GuideScreen } from "../../features/guide/guide-screen";
import { usePlayer } from "../../features/watch/player-context";
import { setToken } from "../../lib/auth-client";
import { capsDoneForCurrentServer } from "../../lib/device";

/** / — the Aurora guide grid. Faithful port of tv-web `routes/_auth/index.tsx`. */
export const Route = createFileRoute("/_auth/")({
  // First launch against a server → run the capability diagnostic once (per-server done flag), like
  // tv-web/tv-native onboarding. Once measured, the guide loads normally.
  beforeLoad: () => {
    if (!capsDoneForCurrentServer()) throw redirect({ to: "/diagnostic" });
  },
  component: GuideRoute,
});

function GuideRoute() {
  const navigate = useNavigate();
  const player = usePlayer();
  return (
    <GuideScreen
      // Tuning is layout-based (the persistent PlayerProvider) — plays the channel full-screen, then a
      // mini feed docks in the guide's featured-panel slot on Back. No route change.
      onTune={(channelId) => player.tune(channelId)}
      onSettings={() => void navigate({ to: "/settings" })}
      onAccount={() => void navigate({ to: "/settings" })}
      onDiagnostic={() => void navigate({ to: "/diagnostic" })}
      // Only fires when the token is rejected (401 from the guide fetch).
      onSignOut={() => {
        setToken(null);
        void navigate({ to: "/login" });
      }}
    />
  );
}
