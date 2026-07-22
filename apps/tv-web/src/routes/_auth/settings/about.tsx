import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { APP_NAME, APP_VERSION } from "../../../lib/app-info";
import { PageHeader, Pill, SectionLabel, SettingRow, useSettingsPage } from "../../../features/settings/settings-ui";
import { SERVER_URL, setToken } from "../../../lib/auth-client";
import {
  getNetwork,
  getNetworkOverride,
  probeConnection,
  setNetworkOverride,
  type Network,
} from "../../../lib/plex-connection";
import { clearStoredServerUrl, hasBakedServer } from "../../../lib/server-url";

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
  // Change server = SIGN OUT (the bearer token is server-specific) AND drop the stored server URL.
  // A reload then lands on onboarding (native app, no baked URL) or the login screen (web player,
  // baked URL) — never straight back into the guide, which would otherwise re-run the diagnostic
  // because you'd still be "logged in". Two-tap confirm so a stray OK can't sign you out.
  // On the web player the server URL is baked in (a fixed deployment) → there's no server to change,
  // so this is just "Sign out" (lands on /login). On the installed app it clears the stored server
  // too, so the reload lands on the server-setup screen.
  const baked = hasBakedServer();
  const [armChange, setArmChange] = useState(false);
  const changeServer = () => {
    setToken(null);
    if (!baked) clearStoredServerUrl();
    window.location.reload();
  };
  const [network, setNetwork] = useState<Network | null>(getNetwork());
  const [override, setOverride] = useState<Network | null>(getNetworkOverride());
  const [checking, setChecking] = useState(false);

  // Re-probe which Plex connection this device reaches (local → remote → relay).
  const recheck = () => {
    if (checking) return;
    setChecking(true);
    probeConnection()
      .then(() => setNetwork(getNetwork()))
      .finally(() => setChecking(false));
  };

  // Force a connection for testing (cycle Auto → Remote → Relay). Lets you exercise the remote/
  // relay path from the home LAN. "Auto" follows the launch probe.
  const cycleOverride = () => {
    const next: Network | null = override === null ? "remote" : override === "remote" ? "relay" : null;
    setNetworkOverride(next);
    setOverride(next);
    setNetwork(getNetwork());
  };

  const { sel } = useSettingsPage(3, (i) => {
    if (i === 0) {
      if (armChange) changeServer();
      else setArmChange(true);
    } else if (i === 1) recheck();
    else if (i === 2) cycleOverride();
  });

  // Disarm the change-server confirm if focus moves off that row.
  useEffect(() => {
    if (sel !== 0) setArmChange(false);
  }, [sel]);

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
          label={baked ? "Sign out" : "Change server"}
          sublabel={
            armChange
              ? baked
                ? "Press OK again to sign out of this server"
                : "Press OK again to sign out and return to server setup"
              : SERVER_URL || "Not connected"
          }
          focused={sel === 0}
          right={armChange ? <Pill tone="warn">Confirm</Pill> : undefined}
          onClick={() => {
            if (armChange) changeServer();
            else setArmChange(true);
          }}
        />
        <SettingRow
          label="Media connection"
          sublabel={checking ? "Checking…" : network ? `${NETWORK_LABEL[network]} — tap to recheck` : "Not determined — tap to check"}
          focused={sel === 1}
          onClick={recheck}
        />
        <SettingRow
          label="Force connection (testing)"
          sublabel={override ? `Forced: ${NETWORK_LABEL[override]} — tap to change` : "Off — following auto probe"}
          focused={sel === 2}
          onClick={cycleOverride}
        />
      </div>
    </div>
  );
}
