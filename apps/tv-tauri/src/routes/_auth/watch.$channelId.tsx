import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "../../lib/api";
import { useGuide } from "../../hooks/use-guide";
import { useFullBleed } from "../../lib/full-bleed";
import { FullChrome } from "../../features/watch/full-chrome";
import { useTvPlayer } from "../../features/watch/use-tv-player";

/**
 * /watch/$channelId — the fullscreen channel player. The video is the full-window Rust mpv surface
 * BEHIND the transparent webview; this route paints only the glass chrome over it (`useFullBleed` →
 * edge-to-edge under the floating titlebar). `FullChrome` is the full tv-web player chrome (channel
 * chip, FeaturePanel with the DVR scrubber + control pills + audio/subtitle/quality menus + Info view,
 * BumperCard, ChannelSurf), driven by `useTvPlayer` (the ported effectiveTime/DVR clock).
 */
export const Route = createFileRoute("/_auth/watch/$channelId")({
  component: WatchRoute,
});

function WatchRoute() {
  const { channelId } = Route.useParams();
  const navigate = useNavigate();
  useFullBleed();

  const [quality, setQuality] = useState("original");
  const [audioStreamId, setAudioStreamId] = useState<string | undefined>(undefined);
  const [subtitleStreamId, setSubtitleStreamId] = useState<string | undefined>(undefined);

  const player = useTvPlayer(channelId, { quality, audioStreamId, subtitleStreamId });

  // The channel (for the chip accent + name) + the quality ladder.
  const { data: guide } = useGuide();
  const channel = useMemo(() => guide?.channels.find((c) => c.id === channelId), [guide, channelId]);
  const { data: qData } = useQuery({ queryKey: ["qualities"], queryFn: () => api.qualities() });

  return (
    <div className="absolute inset-0 text-white" style={{ background: "transparent" }}>
      {(player.status.loading || player.status.buffering) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-10 animate-spin text-white/70" />
        </div>
      )}
      <FullChrome
        channelId={channelId}
        channel={channel}
        player={player}
        quality={quality}
        audioStreamId={audioStreamId}
        subtitleStreamId={subtitleStreamId}
        qualities={qData?.qualities ?? []}
        onSelectQuality={setQuality}
        onSelectAudio={(id) => setAudioStreamId(id || undefined)}
        onSelectSub={(id) => setSubtitleStreamId(id === "off" ? undefined : id || undefined)}
        onBack={() => void navigate({ to: "/" })}
        onTune={(id) => void navigate({ to: "/watch/$channelId", params: { channelId: id } })}
      />
    </div>
  );
}
