import { useEffect, useRef, useState } from "react";

import { LAYER, useDpadList, useKeyLayer, useVirtualKeyboard } from "../../lib/input";
import { normalizeServerUrl, setStoredServerUrl } from "../../lib/server-url";
import { scanForServers } from "../../lib/server-scan";

/**
 * First-launch onboarding — point the TV app at a self-hosted Airwave server. The server lives
 * at a different address per install (a LAN IP or an exposed domain), so we let the user scan the
 * local network or type the address, validate it against `/api/health`, store it on the device, and
 * reload so the whole app re-initialises against it. Styled to match the diagnostic/guide screens.
 *
 * ## Input model (the fiddly bit)
 * The address field takes the platform's on-screen keyboard, and while that keyboard is up it owns
 * the keys — LG documents that keydown/keyup don't even fire for it apart from Enter and Back. So
 * this screen has two states:
 *  - **Editing** (the field has DOM focus, keyboard up): we claim NOTHING except Back, which blurs
 *    the field and closes the keyboard. Enter reaches the input's own handler → Connect.
 *  - **Navigating** (keyboard closed): D-pad moves a simulated cursor over [address, Connect,
 *    scan results…, Scan], OK activates. OK on the address field focuses it → back to editing.
 */

const ACCENT = "#4a9fe0";

export function ServerSetup() {
  const [url, setUrl] = useState("http://");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [progress, setProgress] = useState(0);
  const [found, setFound] = useState<string[]>([]);

  // Is the address field currently taking input (and so owning the keys)? Tracked from real DOM
  // focus, which works in the browser web player too; the webOS keyboard event is a second signal
  // for the installed app, where the keyboard can close without the field blurring.
  const [editing, setEditing] = useState(true);
  const keyboardUp = useVirtualKeyboard();

  const focusInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  };
  const blurInput = () => inputRef.current?.blur();

  // Autofocus + caret at the end (so the remote/keyboard types after "http://").
  useEffect(() => {
    focusInput();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      let res: Response;
      try {
        res = await fetch(`${target}/api/health`, { signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`The server responded with ${res.status}.`);
      const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!body?.ok) throw new Error("That address didn't look like a Airwave server.");
      saveAndReload(target);
    } catch (e) {
      setChecking(false);
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "Couldn't reach that address — check it, and that the server is running."
          : e instanceof Error
            ? e.message
            : "Couldn't connect to that address.",
      );
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

  // The focusable list, in visual order. Indices are derived (address 0, Connect 1, then whatever
  // the scan section is currently showing) so the D-pad order always matches what's on screen.
  const scanItems: { key: string; run: () => void }[] = scanning
    ? []
    : scanned
      ? [
          ...found.map((s) => ({ key: s, run: () => saveAndReload(s) })),
          { key: "rescan", run: () => void runScan() },
        ]
      : [{ key: "scan", run: () => void runScan() }];
  const items = [
    { key: "address", run: focusInput },
    { key: "connect", run: () => void connect() },
    ...scanItems,
  ];
  const SCAN_BASE = 2;

  const { sel } = useDpadList({
    id: "server-setup",
    count: items.length,
    active: !editing,
    onActivate: (i) => items[i]?.run(),
    // First screen in the app — there's nowhere to go back to, so let Back fall through.
    onBack: () => false,
  });

  // While the field is taking input, the on-screen keyboard owns the keys. Claim ONLY Back, which
  // closes the keyboard and hands control to the D-pad list.
  useKeyLayer({
    id: "server-setup-editing",
    priority: LAYER.BASE,
    active: editing,
    onKey(e) {
      if (e.key === "back") {
        blurInput();
        return true;
      }
      return false;
    },
  });

  // The installed app can close the keyboard without blurring the field (the system Done/Back);
  // treat that as leaving edit mode. Only fires on a true→false transition, so the browser web
  // player (which never reports a keyboard) is unaffected.
  const sawKeyboard = useRef(false);
  useEffect(() => {
    if (sawKeyboard.current && !keyboardUp) blurInput();
    sawKeyboard.current = keyboardUp;
  }, [keyboardUp]);

  /** The D-pad focus ring — only while navigating; editing has the caret instead. */
  const ring = (i: number): React.CSSProperties =>
    !editing && sel === i ? { outline: `3px solid ${ACCENT}`, outlineOffset: 3 } : {};

  const ghost: React.CSSProperties = {
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.25)",
    background: "transparent",
    color: "#e6eaf1",
    padding: "12px 24px",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#060a14",
        color: "#f1f5f9",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      <div style={{ width: "min(56vw, 720px)", maxWidth: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.5px" }}>Connect to your server</div>
          <div style={{ fontSize: 18, color: "#94a3b8", marginTop: 8, lineHeight: 1.5 }}>
            Scan your network, or enter the address of your Airwave server — a local IP like{" "}
            <span style={{ fontFamily: "monospace", color: "#c3c9d4" }}>192.168.1.50:3000</span>, or a domain.
          </div>
        </div>

        <input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void connect();
          }}
          placeholder="http://192.168.1.50:3000"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          disabled={checking}
          style={{
            width: "100%",
            boxSizing: "border-box",
            textAlign: "center",
            fontSize: 24,
            padding: "18px 20px",
            borderRadius: 16,
            background: "#0b1120",
            color: "#f1f5f9",
            border: `1px solid ${error ? "#f87171" : editing ? ACCENT : "rgba(148,163,184,0.25)"}`,
            outline: "none",
            ...ring(0),
          }}
        />

        <button
          onClick={() => void connect()}
          disabled={checking}
          style={{
            width: "100%",
            marginTop: 16,
            borderRadius: 16,
            background: ACCENT,
            color: "#04060c",
            padding: "16px 44px",
            fontSize: 20,
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            opacity: checking ? 0.6 : 1,
            ...ring(1),
          }}
        >
          {checking ? "Connecting…" : "Connect"}
        </button>

        {!editing && (
          <div style={{ textAlign: "center", marginTop: 10, fontSize: 14, color: "#64748b" }}>
            Press OK on the address to type it · ▲▼ to move
          </div>
        )}

        <div style={{ height: 24, marginTop: 12, textAlign: "center" }}>
          {error && <span style={{ color: "#f87171", fontSize: 16 }}>{error}</span>}
        </div>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "6px 0 20px", color: "#475569", fontSize: 13 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(148,163,184,0.16)" }} />
          OR
          <div style={{ flex: 1, height: 1, background: "rgba(148,163,184,0.16)" }} />
        </div>

        {/* LAN scan */}
        {scanning ? (
          <div>
            <div style={{ height: 8, borderRadius: 999, background: "rgba(148,163,184,0.18)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round(progress * 100)}%`, background: ACCENT, borderRadius: 999, transition: "width 0.2s" }} />
            </div>
            <div style={{ textAlign: "center", marginTop: 10, color: "#94a3b8", fontSize: 15 }}>
              Scanning your network… {Math.round(progress * 100)}%
            </div>
          </div>
        ) : scanned ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {found.length > 0 ? (
              <>
                <div style={{ color: "#94a3b8", fontSize: 14, textAlign: "center" }}>Found on your network</div>
                {found.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => saveAndReload(s)}
                    style={{
                      width: "100%",
                      textAlign: "center",
                      borderRadius: 14,
                      border: "1px solid rgba(148,163,184,0.25)",
                      background: "#0b1120",
                      color: "#f1f5f9",
                      padding: "14px 20px",
                      fontSize: 18,
                      fontFamily: "monospace",
                      cursor: "pointer",
                      ...ring(SCAN_BASE + i),
                    }}
                  >
                    {s}
                  </button>
                ))}
                <button
                  onClick={() => void runScan()}
                  style={{ ...ghost, alignSelf: "center", marginTop: 4, ...ring(SCAN_BASE + found.length) }}
                >
                  Scan again
                </button>
              </>
            ) : (
              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ color: "#94a3b8", fontSize: 15 }}>
                  No servers found automatically — enter the address above.
                </span>
                <button onClick={() => void runScan()} style={{ ...ghost, alignSelf: "center", ...ring(SCAN_BASE) }}>
                  Scan again
                </button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => void runScan()} style={{ ...ghost, width: "100%", ...ring(SCAN_BASE) }}>
            Scan for servers on my network
          </button>
        )}
      </div>
    </div>
  );
}
