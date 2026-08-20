import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "@airwave/ui/components/button";
import { setToken } from "../../lib/auth-client";

/** / — the Aurora guide grid lands here (Phase 3). For now, a placeholder that doubles as the mpv
 *  compositing proof: transparent stage + a glass control bar floating over the video. */
export const Route = createFileRoute("/_auth/")({
  component: GuideRoute,
});

function GuideRoute() {
  const navigate = useNavigate();
  return (
    <div className="stage">
      <div className="topbar">
        <span className="ttl">connected · guide + player land here (Phase 3)</span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => void navigate({ to: "/diagnostic" })}>
            Diagnostic
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setToken(null);
              void navigate({ to: "/login" });
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
      <div className="controls">
        <button className="pill">⏮</button>
        <button className="pill play">⏯</button>
        <button className="pill">⏭</button>
        <div className="scrubber">
          <div className="fill" />
        </div>
        <span className="live">● LIVE</span>
      </div>
    </div>
  );
}
