import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@airwave/ui/components/button";
import { PlexIcon } from "../components/icons/plex-icon";
import { ApiError, plexLink } from "../lib/api";
import { authClient, setToken } from "../lib/auth-client";
import { Logo } from "../lib/logo";
import { Qr } from "../lib/qr";
import { clearStoredServerUrl, getStoredServerUrl, hasBakedServer } from "../lib/server-url";

/* -------------------------------------------------------------------------- */
/*  Login — two device-code flows: Plex (plex.tv/link) and Airwave code.       */
/*  Faithful port of tv-web features/auth/login.tsx, on @airwave/ui + Aurora.   */
/*  Desktop seam: the webOS D-pad list (useDpadList) is dropped — buttons are   */
/*  clicked directly with the mouse.                                            */
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
    const { data, error: codeErr } = await authClient().device.code({
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
      const { data: tok, error: tokErr } = await authClient().device.token({
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
      if (tokErr?.error === "expired_token" || tokErr?.error === "access_denied") {
        reset("That code expired or was denied — try again.");
      }
    }, (data.interval ?? 5) * 1000);
  }, [onSignedIn]);

  // "Change server" — clear the onboarded URL and reload; main.tsx re-gates to <ServerSetup />. Always
  // available on the installed desktop app (no baked server persona).
  const showChangeServer = !hasBakedServer();
  const changeServer = useCallback(() => {
    clearStoredServerUrl();
    window.location.reload();
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 overflow-auto bg-background p-10 text-center text-foreground">
      <div className="flex flex-col items-center gap-2">
        <Logo markWidth={130} wordmark animate />
        <p className="text-muted-foreground">Sign in to start watching.</p>
      </div>

      {pending ? (
        // Two columns (16:9 has width to spare, height is tight): heading + instruction + Back on the
        // left, a divider, then the QR + code on the right — matching tv-web / tv-native.
        <div className="flex flex-row items-stretch rounded-2xl border border-border bg-card/60 p-8">
          <div className="flex max-w-sm flex-col justify-between pr-8 text-left">
            <div className="flex flex-col gap-4">
              <p className="text-2xl font-semibold">{pending.heading}</p>
              <p className="leading-relaxed text-muted-foreground">{pending.instruction}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => reset(null)} className="mt-6 self-start">
              ← Back
            </Button>
          </div>

          <div className="w-px self-stretch bg-white/10" />

          <div className="flex flex-col items-center justify-center gap-4 pl-8">
            <div className="rounded-xl bg-white p-3">
              <Qr value={pending.qrValue} size={190} />
            </div>
            <p className="font-mono text-4xl font-bold tracking-[0.2em]">{pending.code}</p>
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-md flex-col gap-4">
          <Button
            onClick={startPlex}
            className="h-16 rounded-xl bg-[#e5a00d] text-xl font-semibold text-black hover:bg-[#f0b429]"
          >
            <PlexIcon className="size-6" />
            Log in with Plex
          </Button>
          <Button onClick={startDevice} variant="outline" className="h-16 rounded-xl text-xl font-semibold">
            Log in with a code
          </Button>
          {showChangeServer && (
            <Button variant="ghost" size="sm" onClick={changeServer} className="mt-2 self-center">
              Change server
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground/60">Server: {getStoredServerUrl()}</p>
    </div>
  );
}
