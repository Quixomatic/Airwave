import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { APP_NAME, APP_VERSION } from "../../../lib/app-info";
import { PageHeader, SectionLabel, SettingRow, useSettingsPage } from "../../../features/settings/settings-ui";
import { SERVER_URL } from "../../../lib/auth-client";
import { getNetwork, probeConnection, type Network } from "../../../lib/plex-connection";
import { clearStoredServerUrl } from "../../../lib/server-url";

const NETWORK_LABEL: Record<Network, string> = {
  local: "Local network",
  remote: "Remote (WAN)",
  relay: "Relay",
};

/** /settings/about — app identity + version + the connected server. */
export const Route = createFileRoute("/_auth/settings/about")({
  component: About,
});

function About() {
  // Clearing the stored server + reloading drops the app back to the onboarding/setup screen.
  const changeServer = () => {
    clearStoredServerUrl();
    window.location.reload();
  };
  const [network, setNetwork] = useState<Network | null>(getNetwork());
  const [checking, setChecking] = useState(false);
  // Re-probe which Plex connection this device reaches (local → remote → relay).
  const recheck = () => {
    if (checking) return;
    setChecking(true);
    probeConnection()
      .then((n) => setNetwork(n))
      .finally(() => setChecking(false));
  };

  const { sel } = useSettingsPage(2, (i) => {
    if (i === 0) changeServer();
    if (i === 1) recheck();
  });

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

      <div style={{ maxWidth: 640 }}>
        <SectionLabel>Server</SectionLabel>
        <SettingRow
          label="Change server"
          sublabel={SERVER_URL || "Not connected"}
          focused={sel === 0}
          onClick={changeServer}
        />
        <SettingRow
          label="Media connection"
          sublabel={checking ? "Checking…" : network ? `${NETWORK_LABEL[network]} — tap to recheck` : "Not determined — tap to check"}
          focused={sel === 1}
          onClick={recheck}
        />
      </div>
    </div>
  );
}
