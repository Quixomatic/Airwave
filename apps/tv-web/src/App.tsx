import { useCallback, useEffect, useRef, useState } from "react";

import { authClient } from "./lib/auth-client";
import { ApiError, api, plexLink, type GuideChannel } from "./lib/api";
import { SERVER_URL, getToken, setToken } from "./lib/auth-client";
import { gatherDeviceReport } from "./lib/device";
import { Qr } from "./lib/qr";
import { Watch } from "./features/watch/watch";

type Screen =
  | { name: "login" }
  | { name: "home" }
  | { name: "watch"; channel: GuideChannel };

export function App() {
  const [screen, setScreen] = useState<Screen>(getToken() ? { name: "home" } : { name: "login" });

  if (screen.name === "login") return <Login onSignedIn={() => setScreen({ name: "home" })} />;
  if (screen.name === "watch")
    return (
      <Watch
        channelId={screen.channel.id}
        channelName={`${screen.channel.number} · ${screen.channel.name}`}
        onExit={() => setScreen({ name: "home" })}
      />
    );
  return (
    <Home
      onSignOut={() => setScreen({ name: "login" })}
      onWatch={(channel) => setScreen({ name: "watch", channel })}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Login — two device-code flows: Plex (plex.tv/link) and ChannelGuide code   */
/* -------------------------------------------------------------------------- */

type Pending = {
  heading: string;
  instruction: string;
  code: string;
  qrValue: string;
};

function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };
  const reset = (msg: string | null) => {
    stopPolling();
    setPending(null);
    setError(msg);
  };
  useEffect(() => stopPolling, []);

  // --- Plex (custom /api/tv/auth/plex/* flow, proven in v0.3.16) ---
  const startPlex = useCallback(async () => {
    setError(null);
    try {
      const started = await plexLink.start();
      setPending({
        heading: "Log in with Plex",
        instruction: `Go to ${started.verificationUrl} and enter this code, or scan:`,
        code: started.code,
        qrValue: started.verificationUrl,
      });
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await plexLink.poll(started.pinId);
          if (res.status === "ok") {
            stopPolling();
            setToken(res.token);
            onSignedIn();
          } else if (res.status === "expired") {
            reset("That code expired — try again.");
          } else if (res.status === "unregistered") {
            reset(`No ChannelGuide account for ${res.email}. Ask an admin to import you.`);
          }
        } catch {
          /* transient — keep polling */
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    }
  }, [onSignedIn]);

  // --- ChannelGuide device code (better-auth deviceAuthorization) ---
  const startDevice = useCallback(async () => {
    setError(null);
    const { data, error: codeErr } = await authClient.device.code({
      client_id: "channelguide-tv",
    });
    if (codeErr || !data) {
      setError(codeErr?.error_description ?? "Could not start device login.");
      return;
    }
    setPending({
      heading: "Log in with a code",
      instruction: `Go to ${data.verification_uri} and enter this code, or scan:`,
      code: data.user_code,
      qrValue: data.verification_uri_complete ?? data.verification_uri,
    });
    stopPolling();
    pollRef.current = setInterval(async () => {
      const { data: tok, error: tokErr } = await authClient.device.token({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: data.device_code,
        client_id: "channelguide-tv",
      });
      if (tok?.access_token) {
        stopPolling();
        setToken(tok.access_token);
        onSignedIn();
        return;
      }
      // While pending the endpoint returns authorization_pending / slow_down;
      // only stop on a terminal error.
      if (tokErr?.error === "expired_token" || tokErr?.error === "access_denied") {
        reset("That code expired or was denied — try again.");
      }
    }, (data.interval ?? 5) * 1000);
  }, [onSignedIn]);

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-8 p-10 text-center">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">ChannelGuide</h1>
        <p className="mt-2 text-zinc-400">Sign in to start watching.</p>
      </div>

      {pending ? (
        <div className="flex flex-col items-center gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
          <p className="text-lg font-medium">{pending.heading}</p>
          <p className="max-w-sm text-zinc-400">{pending.instruction}</p>
          <Qr value={pending.qrValue} />
          <p className="font-mono text-5xl font-bold tracking-[0.3em]">{pending.code}</p>
          <button onClick={() => reset(null)} className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Back
          </button>
        </div>
      ) : (
        <div className="flex w-full max-w-md flex-col gap-4">
          <button
            onClick={startPlex}
            className="rounded-xl bg-amber-500 px-6 py-5 text-xl font-semibold text-black transition hover:bg-amber-400"
          >
            Log in with Plex
          </button>
          <button
            onClick={startDevice}
            className="rounded-xl border border-zinc-700 px-6 py-5 text-xl font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            Log in with a code
          </button>
        </div>
      )}

      {error && <p className="text-red-400">{error}</p>}
      <p className="text-xs text-zinc-600">Server: {SERVER_URL}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Home — proves the bearer token authorizes /api/v1 (grows into the guide)   */
/* -------------------------------------------------------------------------- */

function Home({
  onSignOut,
  onWatch,
}: {
  onSignOut: () => void;
  onWatch: (channel: GuideChannel) => void;
}) {
  const [channels, setChannels] = useState<GuideChannel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(0);
  const COLS = 2;

  // Report this device's real capabilities once (web probe + webOS Luna facts).
  useEffect(() => {
    void gatherDeviceReport()
      .then((r) => api.reportDevice(r))
      .catch(() => {});
  }, []);

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

  useEffect(() => {
    api
      .channels()
      .then((r) => setChannels(r.channels))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setToken(null);
          onSignOut();
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load channels.");
      });
  }, [onSignOut]);

  return (
    <div className="mx-auto max-w-4xl p-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Channels</h1>
        <button
          onClick={() => {
            setToken(null);
            onSignOut();
          }}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Sign out
        </button>
      </div>

      {error && <p className="mt-6 text-red-400">{error}</p>}
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
                  {c.callsign && (
                    <span className="ml-auto text-xs text-zinc-600">{c.callsign}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
