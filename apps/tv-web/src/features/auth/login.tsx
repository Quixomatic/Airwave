import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, plexLink } from "../../lib/api";
import { authClient } from "../../lib/auth-client";
import { SERVER_URL, setToken } from "../../lib/auth-client";
import { useDpadList } from "../../lib/input";
import { Logo } from "../../lib/logo";
import { Qr } from "../../lib/qr";

const ACCENT = "#4a9fe0";

/* -------------------------------------------------------------------------- */
/*  Login — two device-code flows: Plex (plex.tv/link) and Airwave code   */
/*  UNCHANGED from the original App.tsx — this login flow works well; the only  */
/*  edit is that it now lives on the /login route (onSignedIn → navigate("/")). */
/* -------------------------------------------------------------------------- */

type Pending = {
  heading: string;
  instruction: string;
  code: string;
  qrValue: string;
};

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
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
            reset(`No Airwave account for ${res.email}. Ask an admin to import you.`);
          }
        } catch {
          /* transient — keep polling */
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    }
  }, [onSignedIn]);

  // --- Airwave device code (better-auth deviceAuthorization) ---
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

  // Two focusable buttons on the chooser; one ("← Back") once a code is pending. Back on the
  // pending view returns to the chooser, matching what the on-screen button does.
  const choices = pending ? [() => reset(null)] : [startPlex, startDevice];
  const { sel } = useDpadList({
    id: "login",
    count: choices.length,
    onActivate: (i) => choices[i]?.(),
    onBack: () => {
      if (!pending) return false; // nothing above the chooser — let it fall through
      reset(null);
      return true;
    },
  });

  /** D-pad focus ring, matching the rest of the 10-foot UI (simulated focus, not DOM focus). */
  const ring = (i: number) =>
    sel === i ? { outline: `3px solid ${ACCENT}`, outlineOffset: 4 } : undefined;

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-8 p-10 text-center">
      <div className="flex flex-col items-center gap-2">
        <Logo markWidth={130} wordmark animate />
        <p className="text-zinc-400">Sign in to start watching.</p>
      </div>

      {pending ? (
        <div className="flex flex-col items-center gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
          <p className="text-lg font-medium">{pending.heading}</p>
          <p className="max-w-sm text-zinc-400">{pending.instruction}</p>
          <Qr value={pending.qrValue} />
          <p className="font-mono text-5xl font-bold tracking-[0.3em]">{pending.code}</p>
          <button
            onClick={() => reset(null)}
            style={ring(0)}
            className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition hover:text-zinc-200"
          >
            ← Back
          </button>
        </div>
      ) : (
        <div className="flex w-full max-w-md flex-col gap-4">
          <button
            onClick={startPlex}
            style={ring(0)}
            className="rounded-xl bg-amber-500 px-6 py-5 text-xl font-semibold text-black transition hover:bg-amber-400"
          >
            Log in with Plex
          </button>
          <button
            onClick={startDevice}
            style={ring(1)}
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
