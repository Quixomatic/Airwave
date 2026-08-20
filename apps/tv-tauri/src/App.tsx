import { TitleBar } from "./components/TitleBar";
import { ServerSetup } from "./screens/ServerSetup";
import { hasServerUrl } from "./lib/server-url";

export default function App() {
  return (
    <>
      <TitleBar />
      {hasServerUrl() ? <Connected /> : <ServerSetup />}
    </>
  );
}

// Placeholder for the onboarded app — the guide/player land here (Phase 3+). For now
// it doubles as the mpv compositing proof: transparent stage + a glass control bar
// floating over the video (which plays behind the webview via WebView2 DComp).
function Connected() {
  return (
    <div className="stage">
      <div className="topbar">
        <span className="ttl">connected · guide + player land here (Phase 3)</span>
      </div>
      <div className="controls">
        <button className="pill">⏮</button>
        <button className="pill play">⏯</button>
        <button className="pill">⏭</button>
        <div className="scrubber">
          <div className="fill" />
        </div>
        <span className="live">● LIVE</span>
      </div>
    </div>
  );
}
