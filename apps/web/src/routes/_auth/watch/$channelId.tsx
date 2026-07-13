import { Button } from "@ChannelGuide/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import Hls from "hls.js";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/watch/$channelId")({
  staticData: { breadcrumb: "Watch" },
  component: Watch,
});

/**
 * Playback spike — proves direct-play-from-Plex-at-offset in the browser (the go/no-go
 * before the webOS client). Resolves what's on the channel now and plays it: native
 * <video> + client seek for direct-play files, hls.js for transcoded ones.
 * See `.docs/playback-model.md`.
 */
function Watch() {
  const { channelId } = Route.useParams();
  const query = useQuery(trpc.playback.resolve.queryOptions({ channelId }));
  const videoRef = useRef<HTMLVideoElement>(null);
  const data = query.data;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !data || data.state !== "program") return;
    let hls: Hls | null = null;

    if (data.mode === "hls") {
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        hls.loadSource(data.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => {}));
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Native HLS (Safari): offset is already baked into the URL.
        video.src = data.url;
        video.addEventListener("loadedmetadata", () => void video.play().catch(() => {}), {
          once: true,
        });
      }
    } else {
      // Direct play the original file; seek to the live offset once metadata is ready.
      video.src = data.url;
      const onMeta = () => {
        if (data.offsetSeconds > 0) video.currentTime = data.offsetSeconds;
        void video.play().catch(() => {});
      };
      video.addEventListener("loadedmetadata", onMeta, { once: true });
    }

    return () => {
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
    // Re-run whenever the resolved slot changes (url/mode/offset live on `data`).
  }, [data]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <Link
          to="/channels/$channelId"
          params={{ channelId }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Channel
        </Link>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Re-resolve
        </Button>
      </div>

      <div className="bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          className="aspect-video w-full bg-black"
        />
      </div>

      {query.isLoading && <p className="text-muted-foreground text-sm">Resolving…</p>}
      {query.error && (
        <p className="text-destructive text-sm">
          {query.error instanceof Error ? query.error.message : "Failed to resolve playback."}
        </p>
      )}

      {data?.state === "program" && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">{guideTitle(data.guide)}</p>
          <p className="text-muted-foreground text-xs">
            Playing at offset {formatOffset(data.offsetSeconds)} ·{" "}
            <span className="uppercase">{data.mode}</span>
            {data.mode === "direct" ? " (client seek)" : " (server offset)"} ·{" "}
            {data.container}/{data.videoCodec}/{data.audioCodec}
          </p>
          {data.next && (
            <p className="text-muted-foreground text-xs">Up next · {guideTitle(data.next.guide)}</p>
          )}
        </div>
      )}
      {data?.state === "bumper" && (
        <p className="text-muted-foreground text-sm">
          On a break right now (interstitial). Up next · {data.next ? guideTitle(data.next.guide) : "…"}
        </p>
      )}
      {data?.state === "off" && (
        <p className="text-muted-foreground text-sm">
          Nothing on now — generate a schedule for this channel first.
        </p>
      )}
    </div>
  );
}

type GuideLike = { title: string; showTitle?: string };
function guideTitle(g: GuideLike): string {
  return g.showTitle ? `${g.showTitle} — ${g.title}` : g.title;
}

function formatOffset(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
