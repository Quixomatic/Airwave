import { useEffect } from "react";

import { useGuide } from "../../hooks/use-guide";
import { ApiError, api } from "../../lib/api";
import { CAPS_DONE_KEY, gatherDeviceReport } from "../../lib/device";
import { AuroraGrid } from "./aurora-grid";

/**
 * The guide screen — fetches the cross-channel grid and renders the Aurora guide.
 * Also carries the two side-effects that used to live in Home: report this device's
 * real capabilities once, and run the capability onboarding on a device's first sign-in.
 */
export function GuideScreen({
  onTune,
  onSettings,
  onDiagnostic,
  onSignOut,
}: {
  onTune: (channelId: string) => void;
  onSettings: () => void;
  onDiagnostic: () => void;
  onSignOut: () => void;
}) {
  const { data, error } = useGuide(180);

  useEffect(() => {
    void gatherDeviceReport()
      .then((r) => api.reportDevice(r))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!localStorage.getItem(CAPS_DONE_KEY)) onDiagnostic();
  }, [onDiagnostic]);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) onSignOut();
  }, [error, onSignOut]);

  if (error && !(error instanceof ApiError && error.status === 401)) {
    return <Centered>Couldn't load the guide.</Centered>;
  }
  if (!data) return <Centered>Loading…</Centered>;
  if (!data.channels.length) return <Centered>No channels yet.</Centered>;

  return (
    <AuroraGrid
      channels={data.channels}
      serverTime={data.serverTime}
      onTune={onTune}
      onSettings={onSettings}
      onSignOut={onSignOut}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#060a14", color: "#94a3b8" }} className="flex items-center justify-center text-2xl">
      {children}
    </div>
  );
}
