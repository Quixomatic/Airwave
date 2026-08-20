import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "@airwave/ui/components/button";
import { useFullBleed } from "../../lib/full-bleed";

/** /watch/$channelId — the fullscreen player. Phase 4 ports tv-native's mpv player here (transparent
 *  stage + glass chrome over the edge-to-edge video). For now, a placeholder that DOES exercise the
 *  full-bleed mechanism: the video region goes to the very top with the titlebar floating over it. */
export const Route = createFileRoute("/_auth/watch/$channelId")({
  component: WatchRoute,
});

function WatchRoute() {
  const { channelId } = Route.useParams();
  const navigate = useNavigate();
  // Edge-to-edge: drop the titlebar clearance + make the titlebar transparent (video will fill to the
  // very top behind it in Phase 4). Esc returns to the guide.
  useFullBleed();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void navigate({ to: "/" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/70 text-center text-foreground">
      <div className="text-sm uppercase tracking-widest text-muted-foreground">Now tuning</div>
      <div className="font-mono text-2xl">{channelId}</div>
      <p className="max-w-md text-muted-foreground">
        The mpv player lands here in Phase 4 — full-screen video with glass chrome composited over it.
      </p>
      <Button variant="outline" onClick={() => void navigate({ to: "/" })}>
        ← Back to guide
      </Button>
    </div>
  );
}
