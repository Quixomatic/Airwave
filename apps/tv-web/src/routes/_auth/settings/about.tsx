import { createFileRoute } from "@tanstack/react-router";

import { APP_NAME, APP_VERSION } from "../../../lib/app-info";
import { PageHeader, useSettingsPage } from "../../../features/settings/settings-ui";

/** /settings/about — app identity + version. */
export const Route = createFileRoute("/_auth/settings/about")({
  component: About,
});

function About() {
  useSettingsPage(0, () => {}); // no focusable rows; ◄/Back returns to the rail

  return (
    <div>
      <PageHeader title="About" />

      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "36px 34px", borderRadius: 18, background: "rgba(148,163,184,0.06)", maxWidth: 640 }}>
        <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-1px", color: "#f1f5f9" }}>{APP_NAME}</div>
        <div style={{ fontSize: 19, color: "#94a3b8" }}>Your media server, as live TV.</div>
        <div
          style={{
            marginTop: 12,
            alignSelf: "flex-start",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 0.5,
            padding: "6px 14px",
            borderRadius: 999,
            background: "rgba(74,159,224,0.16)",
            color: "#4a9fe0",
          }}
        >
          Version {APP_VERSION}
        </div>
      </div>

      <p style={{ marginTop: 24, fontSize: 16, lineHeight: 1.6, color: "#94a3b8", maxWidth: 640 }}>
        {APP_NAME} turns your own media-server library into curated, always-on TV channels — a broadcast-style guide with live
        tune-in, DVR, and deterministic scheduling, playing straight from your server.
      </p>
    </div>
  );
}
