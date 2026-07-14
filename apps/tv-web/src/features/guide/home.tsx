import { useEffect, useState } from "react";

import { useChannels, type GuideChannel } from "../../hooks/use-channels";
import { ApiError, api } from "../../lib/api";
import { CAPS_DONE_KEY, gatherDeviceReport } from "../../lib/device";

/* -------------------------------------------------------------------------- */
/*  Home — the channel list (grows into the Aurora guide grid, .docs/tv-        */
/*  design-spec.md). Ported from App.tsx onto the /_auth/ route; the channel    */
/*  fetch is now the useChannels() Query hook, everything else is unchanged.    */
/* -------------------------------------------------------------------------- */

export function Home({
  onSignOut,
  onWatch,
  onDiagnostic,
}: {
  onSignOut: () => void;
  onWatch: (channel: GuideChannel) => void;
  onDiagnostic: () => void;
}) {
  const { data: channels, error } = useChannels();
  const [focused, setFocused] = useState(0);
  const COLS = 2;

  // A 401 means the token's dead → sign out.
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) onSignOut();
  }, [error, onSignOut]);

  // Report this device's real capabilities once (web probe + webOS Luna facts).
  useEffect(() => {
    void gatherDeviceReport()
      .then((r) => api.reportDevice(r))
      .catch(() => {});
  }, []);

  // First sign-in on this device → run the capability onboarding once.
  useEffect(() => {
    if (!localStorage.getItem(CAPS_DONE_KEY)) onDiagnostic();
  }, [onDiagnostic]);

  // D-pad / remote navigation over the channel grid (arrow keys + OK/Enter to tune).
  useEffect(() => {
    if (!channels?.length) return;
    const n = channels.length;
    const onKey = (e: KeyboardEvent) => {
      let next = focused;
      switch (e.key) {
        case "ArrowRight": next = Math.min(n - 1, focused + 1); break;
        case "ArrowLeft": next = Math.max(0, focused - 1); break;
        case "ArrowDown": next = Math.min(n - 1, focused + COLS); break;
        case "ArrowUp": next = Math.max(0, focused - COLS); break;
        case "Enter": e.preventDefault(); onWatch(channels[focused]); return;
        default: return;
      }
      e.preventDefault();
      setFocused(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [channels, focused, onWatch]);

  // Keep the focused channel scrolled into view.
  useEffect(() => {
    document.getElementById(`ch-${focused}`)?.scrollIntoView({ block: "nearest" });
  }, [focused]);

  return (
    <div className="mx-auto max-w-4xl p-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Channels</h1>
        <div className="flex gap-3">
          <button
            onClick={onDiagnostic}
            className="rounded-lg border border-amber-600 px-4 py-2 text-sm text-amber-400 hover:bg-amber-400/10"
          >
            Run diagnostic
          </button>
          <button
            onClick={onSignOut}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Sign out
          </button>
        </div>
      </div>

      {error && !(error instanceof ApiError && error.status === 401) && (
        <p className="mt-6 text-red-400">
          {error instanceof ApiError ? error.message : "Failed to load channels."}
        </p>
      )}
      {!channels && !error && <p className="mt-6 text-zinc-500">Loading…</p>}

      {channels && (
        <>
          <p className="mt-2 text-zinc-500">{channels.length} channels</p>
          <ul className="mt-6 grid grid-cols-2 gap-3">
            {channels.map((c, i) => (
              <li key={c.id}>
                <button
                  id={`ch-${i}`}
                  onClick={() => {
                    setFocused(i);
                    onWatch(c);
                  }}
                  onMouseEnter={() => setFocused(i)}
                  className={`flex w-full items-baseline gap-3 rounded-lg border px-4 py-3 text-left transition ${
                    i === focused
                      ? "border-amber-400 bg-amber-400/10 ring-2 ring-amber-400"
                      : "border-zinc-800 bg-zinc-900/40"
                  }`}
                >
                  <span className="font-mono text-zinc-500">{c.number}</span>
                  <span className="font-medium">{c.name}</span>
                  {c.callsign && <span className="ml-auto text-xs text-zinc-600">{c.callsign}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
