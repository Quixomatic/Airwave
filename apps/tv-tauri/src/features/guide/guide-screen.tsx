import { useEffect } from "react";

import { useGuide } from "../../hooks/use-guide";
import { ApiError, api } from "../../lib/api";
import { capsDoneForCurrentServer, gatherDeviceReport } from "../../lib/device";
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
  onAccount,
  onSignOut,
}: {
  onTune: (channelId: string) => void;
  onSettings: () => void;
  onDiagnostic: () => void;
  /** Sidebar Account circle → the User settings page. */
  onAccount: () => void;
  /** Forced sign-out — only for an expired/invalid token (a 401 from the guide fetch). */
  onSignOut: () => void;
}) {
  const { data, error } = useGuide(180);

  useEffect(() => {
    // tv-tauri's gatherDeviceReport is synchronous (desktop identity/screen), unlike tv-web's async one.
    void api.reportDevice(gatherDeviceReport()).catch(() => {});
  }, []);

  useEffect(() => {
    // Run the diagnostic on first sign-in AND whenever this device is pointed at a new server
    // (that server has no capability profile for it yet).
    if (!capsDoneForCurrentServer()) onDiagnostic();
  }, [onDiagnostic]);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) onSignOut();
  }, [error, onSignOut]);

  // NO early return for loading, an error, OR an empty channel list. AuroraGrid renders the full
  // interface (sidebar + featured chrome + its own context-aware GuideGhost) in every case: a
  // first-load shows the ghost skeleton with a "Loading channels…" message, a fetch error shows an
  // "unreachable server" message, and a fresh install / empty filter shows the empty state — all with
  // the sidebar reachable so the user can get to Settings (change server / sign out) and is never
  // stranded on a bare spinner. `serverTime` falls back to the client clock when there's no data yet.
  // (A 401 is handled in the effect above → forced sign-out.)
  const loading = !data && !error;
  const errored = !data && !!error;
  return (
    <AuroraGrid
      channels={data?.channels ?? []}
      serverTime={data?.serverTime ?? new Date().toISOString()}
      onTune={onTune}
      onSettings={onSettings}
      onAccount={onAccount}
      loading={loading}
      errored={errored}
    />
  );
}
