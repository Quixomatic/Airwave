// Phase 1 compositing proof: real React chrome composited OVER the mpv video via
// WebView2/DComp. The stage is transparent (video shows through); the top scrim
// and the bottom glass control bar are translucent to prove UI-over-video alpha.
export default function App() {
  return (
    <div className="stage">
      <div className="topbar">
        <span className="badge">AIRWAVE</span>
        <span className="ttl">tv-tauri · mpv playing BEHIND this React UI (WebView2 DComp)</span>
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
