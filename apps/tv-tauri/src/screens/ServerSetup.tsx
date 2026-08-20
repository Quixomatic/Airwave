import { useState } from "react";
import { checkHealth } from "../lib/api";
import { normalizeServerUrl, setStoredServerUrl } from "../lib/server-url";

// Phase 2 onboarding: enter the self-hosted Airwave server, validate it against
// /api/health (scheme-by-host guard in normalizeServerUrl), store it, reload so the
// whole app re-initialises against it. Ported from tv-web features/setup/server-setup.
export function ServerSetup() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [error, setError] = useState("");

  async function connect() {
    const normalized = normalizeServerUrl(url);
    if (!normalized) {
      setError("Enter your server address");
      setStatus("error");
      return;
    }
    setStatus("checking");
    setError("");
    const ok = await checkHealth(normalized);
    if (ok) {
      setStoredServerUrl(normalized);
      window.location.reload();
    } else {
      setError(`Couldn't reach ${normalized} — check the address and that the server is running.`);
      setStatus("error");
    }
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <div className="badge">AIRWAVE</div>
        <h1 className="setup-title">Connect to your server</h1>
        <p className="setup-hint">Enter your Airwave server address to get started.</p>
        <input
          className="setup-input"
          placeholder="your-server.com or 192.168.1.50:3000"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && connect()}
          autoFocus
          spellCheck={false}
          autoCapitalize="off"
        />
        {status === "error" && <div className="setup-error">{error}</div>}
        <button className="setup-btn" onClick={connect} disabled={status === "checking"}>
          {status === "checking" ? "Connecting…" : "Connect"}
        </button>
      </div>
    </div>
  );
}
