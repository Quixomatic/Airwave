import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { usePlayer } from "../../features/watch/player-context";

/**
 * /watch/$channelId — deep-link entry only. The player is now a persistent overlay
 * (see player-context.tsx), so this route just tunes the channel and bounces to the
 * guide; the full-screen player takes over from there.
 */
export const Route = createFileRoute("/_auth/watch/$channelId")({
  component: WatchRoute,
});

function WatchRoute() {
  const { channelId } = Route.useParams();
  const navigate = useNavigate();
  const player = usePlayer();
  useEffect(() => {
    player.tune(channelId);
    void navigate({ to: "/" });
  }, [channelId, player, navigate]);
  return null;
}
