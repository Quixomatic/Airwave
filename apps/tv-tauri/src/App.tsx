import { useEffect, useState } from "react";

// Scaffold shell — confirms the Tauri webview + Rust bridge is live. The real
// 10-foot experience (guide, player) lands here next, largely reusing tv-web's
// React UI; the libmpv video composites behind this transparent webview.
export default function App() {
  const [version, setVersion] = useState<string>("…");

  useEffect(() => {
    let cancelled = false;
    // Lazy-import the Tauri API so a plain `vite dev` (browser) still runs.
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then((v) => !cancelled && setVersion(v))
      .catch(() => !cancelled && setVersion("(browser)"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="shell">
      <div className="badge">AIRWAVE</div>
      <h1>tv-tauri</h1>
      <p className="sub">desktop shell · v{version}</p>
      <p className="hint">libmpv player + tv-web UI land here next.</p>
    </main>
  );
}
