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
  return <Watch channelId={channelId} channel={ch} onExit={() => void navigate({ to: "/" })} />;
}
