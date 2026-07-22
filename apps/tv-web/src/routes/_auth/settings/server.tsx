import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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

/**
 * /settings/server — the connected ChannelGuide server and how this TV reaches Plex.
 * (These used to live on About, which made no sense — About is app identity.)
 */
export const Route = createFileRoute("/_auth/settings/server")({
  component: ServerSettings,
});

function ServerSettings() {
  // On the web player the server URL is baked in (a fixed deployment) → there's no server to change,
  // so the action is just "Sign out" (lands on /login). On the installed app it clears the stored
  // server too, so the reload lands on the server-setup screen.
  const baked = hasBakedServer();
  const [armChange, setArmChange] = useState(false);
  // Change server = SIGN OUT (the bearer token is server-specific) AND drop the stored server URL.
  // A reload then lands on onboarding (native app, no baked URL) or the login screen (web player) —
  // never straight back into the guide, which would re-run the diagnostic since you'd still be
  // "logged in". Two-tap confirm so a stray OK can't sign you out.
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
    if (i === 0) recheck();
    else if (i === 1) cycleOverride();
    else if (i === 2) {
      if (armChange) changeServer();
      else setArmChange(true);
    }
  });

  // Disarm the change-server confirm if focus moves off that row.
  useEffect(() => {
    if (sel !== 2) setArmChange(false);
  }, [sel]);

  return (
    <div>
      <PageHeader title="Server" subtitle="The ChannelGuide server this TV is signed in to." />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 28, padding: "16px 22px", borderRadius: 14, background: "rgba(148,163,184,0.06)", marginBottom: 8 }}>
        <Info label="Address" value={SERVER_URL || "Not connected"} />
        <Info label="Media connection" value={network ? NETWORK_LABEL[network] : "Not determined"} />
        <Info label="Connection mode" value={override ? "Forced" : "Auto"} />
      </div>

      <SectionLabel>Plex connection</SectionLabel>
      <p style={{ fontSize: 14, color: "#64748b", marginTop: -6, marginBottom: 18, maxWidth: 640 }}>
        Video streams straight from your media server, so this TV picks the address it can actually reach — the local network at
        home, or the remote/relay address when it's away.
      </p>
      <SettingRow
        label="Media connection"
        sublabel={checking ? "Checking…" : network ? `${NETWORK_LABEL[network]} — tap to recheck` : "Not determined — tap to check"}
        focused={sel === 0}
        onClick={recheck}
      />
      <SettingRow
        label="Force connection (testing)"
        sublabel={override ? `Forced: ${NETWORK_LABEL[override]} — tap to change` : "Off — following auto probe"}
        focused={sel === 1}
        onClick={cycleOverride}
      />

      <SectionLabel>{baked ? "Session" : "Change server"}</SectionLabel>
      <SettingRow
        label={baked ? "Sign out" : "Change server"}
        sublabel={
          armChange
            ? baked
              ? "Press OK again to sign out of this server"
              : "Press OK again to sign out and return to server setup"
            : baked
              ? "Sign this TV out — the server address is fixed by this deployment"
              : "Sign out and pick a different ChannelGuide server"
        }
        focused={sel === 2}
        right={armChange ? <Pill tone="warn">Confirm</Pill> : undefined}
        onClick={() => {
          if (armChange) changeServer();
          else setArmChange(true);
        }}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 600, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}
