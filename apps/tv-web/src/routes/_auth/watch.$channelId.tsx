import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Watch } from "../../features/watch/watch";
import { useChannels } from "../../hooks/use-channels";

/** /watch/$channelId — the player. Channel name comes from the (cached) lineup. */
export const Route = createFileRoute("/_auth/watch/$channelId")({
  component: WatchRoute,
});

function WatchRoute() {
  const { channelId } = Route.useParams();
  const navigate = useNavigate();
  const { data: channels } = useChannels();
  const ch = channels?.find((c) => c.id === channelId);
  const channelName = ch ? `${ch.number} · ${ch.name}` : "";
  return (
    <Watch
      channelId={channelId}
      channelName={channelName}
      onExit={() => void navigate({ to: "/" })}
    />
  );
}
