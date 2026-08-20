import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Radar, Server } from "lucide-react";

import { Button } from "@airwave/ui/components/button";
import { Input } from "@airwave/ui/components/input";
import { Separator } from "@airwave/ui/components/separator";
import { normalizeServerUrl, setStoredServerUrl } from "../lib/server-url";
import { scanForServers } from "../lib/server-scan";

/**
 * First-launch onboarding — point the desktop app at a self-hosted Airwave server. The server lives at
 * a different address per install (a LAN IP or an exposed domain), so we let the user scan the local
 * network or type the address, validate it against `/api/health`, store it on the device, and reload so
 * the whole app re-initialises against it.
 *
 * ## Faithful port of tv-web `features/setup/server-setup.tsx`, built on the shared design system
 * Same layout, copy, and LAN scan — but rebuilt on the shared **@airwave/ui** (base-lyra shadcn)
 * `Button`/`Input`/`Separator` (the admin + tv-web design system), so sizing/focus/theming are
 * consistent by construction. Two desktop **seams** replace the webOS bits:
 *  - **Input:** tv-web wraps this in the D-pad + on-screen-keyboard machinery (`useDpadList` /
 *    `useKeyLayer` / `useVirtualKeyboard`). Desktop has a real keyboard and a mouse, so that whole layer
 *    is gone — you click and type. (The zone/input machine is Phase 3.6, and only for the guide/player.)
 *  - **Health probe:** goes through the Tauri HTTP plugin `fetch` (routed through Rust) so hitting an
 *    arbitrary self-hosted server isn't blocked by the webview's CORS.
 */

export function ServerSetup() {
  const [url, setUrl] = useState("http://");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [progress, setProgress] = useState(0);
  const [found, setFound] = useState<string[]>([]);

  // Autofocus + caret at the end (so typing lands after "http://").
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const saveAndReload = (target: string) => {
    setStoredServerUrl(target);
    window.location.reload();
  };

  const connect = async () => {
    const target = normalizeServerUrl(url);
    if (!target) {
      setError("Enter your server's address.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      // Validate via the Rust probe (reqwest) — same path as the scan, no webview HTTP scope/CORS.
      const alive = await invoke<string[]>("probe_health", { urls: [target] });
      if (alive.includes(target)) {
        saveAndReload(target);
      } else {
        setChecking(false);
        setError("Couldn't reach that address — check it, and that the server is running.");
      }
    } catch (e) {
      setChecking(false);
      setError(e instanceof Error ? e.message : "Couldn't connect to that address.");
    }
  };

  const runScan = async () => {
    setScanning(true);
    setScanned(false);
    setFound([]);
    setProgress(0);
    setError(null);
    const results = await scanForServers(setProgress);
    setFound(results);
    setScanning(false);
    setScanned(true);
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background p-10 text-foreground">
      <div className="w-[min(56vw,560px)] max-w-full">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight">Connect to your server</h1>
          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
            Scan your network, or enter the address of your Airwave server — a local IP like{" "}
            <span className="font-mono text-foreground/80">192.168.1.50:3000</span>, or a domain.
          </p>
        </div>

        <Input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void connect();
          }}
          placeholder="http://192.168.1.50:3000"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          disabled={checking}
          aria-invalid={error ? true : undefined}
          className="h-14 rounded-xl bg-card text-center text-xl dark:bg-card"
        />

        <Button
          onClick={() => void connect()}
          disabled={checking}
          size="lg"
          className="mt-4 h-14 w-full rounded-xl text-lg"
        >
          {checking ? (
            <>
              <Loader2 className="size-5 animate-spin" /> Connecting…
            </>
          ) : (
            "Connect"
          )}
        </Button>

        <div className="mt-3 h-6 text-center">
          {error && <span className="text-base text-destructive">{error}</span>}
        </div>

        {/* OR divider */}
        <div className="my-5 flex items-center gap-3 text-xs font-medium tracking-widest text-muted-foreground">
          <Separator className="flex-1" />
          OR
          <Separator className="flex-1" />
        </div>

        {/* LAN scan */}
        {scanning ? (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="mt-2.5 text-center text-sm text-muted-foreground">
              Scanning your network… {Math.round(progress * 100)}%
            </div>
          </div>
        ) : scanned ? (
          <div className="flex flex-col gap-2.5">
            {found.length > 0 ? (
              <>
                <div className="text-center text-sm text-muted-foreground">Found on your network</div>
                {found.map((s) => (
                  <Button
                    key={s}
                    onClick={() => saveAndReload(s)}
                    variant="outline"
                    size="lg"
                    className="h-12 w-full rounded-xl font-mono text-base"
                  >
                    <Server className="size-4" /> {s}
                  </Button>
                ))}
                <Button variant="ghost" size="sm" onClick={() => void runScan()} className="mt-1 self-center">
                  Scan again
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="text-sm text-muted-foreground">
                  No servers found automatically — enter the address above.
                </span>
                <Button variant="ghost" size="sm" onClick={() => void runScan()}>
                  Scan again
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Button
            onClick={() => void runScan()}
            variant="outline"
            size="lg"
            className="h-14 w-full rounded-xl text-lg"
          >
            <Radar className="size-5" /> Scan for servers on my network
          </Button>
        )}
      </div>
    </div>
  );
}
