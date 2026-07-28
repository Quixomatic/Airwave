import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { scaled } from "@/features/guide/layout";
import { PageHeader, Pill, SectionLabel, SettingRow, useSettingsPage } from "@/features/settings/settings-ui";
import { clearServerUrl, getServerUrl, setToken } from "@/lib/auth";
import { getNetwork, getNetworkOverride, probeConnection, setNetworkOverride, type Network } from "@/lib/plex-connection";

const NETWORK_LABEL: Record<Network, string> = {
  local: "Local network",
  remote: "Remote (WAN)",
  relay: "Relay",
};

/**
 * /settings/server — the connected server + how this device reaches Plex. Ported from tv-web's server
 * page (address · media-connection probe · force-connection override · change server). The native app
 * streams DIRECTLY from Plex, so it picks the address it can actually reach — the local network at
 * home, or the remote/relay address away. See `lib/plex-connection.ts`.
 */
export default function ServerSettings() {
  const router = useRouter();
  const [armChange, setArmChange] = useState(false);
  const changeServer = () => {
    // Sign out + drop the stored server, then bounce through the entry gate → onboarding.
    void Promise.all([setToken(null), clearServerUrl()]).then(() => router.replace("/"));
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

  // Force a connection for testing (cycle Auto → Remote → Relay). Lets you exercise the remote/relay
  // path from the home LAN. "Auto" follows the launch probe.
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

  useEffect(() => {
    if (sel !== 2) setArmChange(false);
  }, [sel]);

  return (
    <View>
      <PageHeader title="Server" subtitle="The ChannelGuide server this device is signed in to." />

      <View style={scaled({ flexDirection: "row", flexWrap: "wrap", gap: 28, padding: 22, borderRadius: 14, backgroundColor: "rgba(148,163,184,0.06)", marginBottom: 8 })}>
        <Info label="Address" value={getServerUrl() || "Not connected"} />
        <Info label="Media connection" value={network ? NETWORK_LABEL[network] : "Not determined"} />
        <Info label="Connection mode" value={override ? "Forced" : "Auto"} />
      </View>

      <SectionLabel>Plex connection</SectionLabel>
      <SettingRow
        label="Media connection"
        sublabel={checking ? "Checking…" : network ? `${NETWORK_LABEL[network]} — select to recheck` : "Not determined — select to check"}
        focused={sel === 0}
        onPress={recheck}
      />
      <SettingRow
        label="Force connection (testing)"
        sublabel={override ? `Forced: ${NETWORK_LABEL[override]} — select to change` : "Off — following auto probe"}
        focused={sel === 1}
        onPress={cycleOverride}
      />

      <SectionLabel>Change server</SectionLabel>
      <SettingRow
        label="Change server"
        sublabel={armChange ? "Press OK again to sign out and return to server setup" : "Sign out and pick a different ChannelGuide server"}
        focused={sel === 2}
        right={armChange ? <Pill tone="warn">Confirm</Pill> : undefined}
        onPress={() => {
          if (armChange) changeServer();
          else setArmChange(true);
        }}
      />
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 0 }}>
      <Text style={scaled({ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", marginBottom: 3 })}>{label}</Text>
      <Text style={scaled({ fontSize: 17, fontWeight: "600", color: "#f1f5f9" })}>{value}</Text>
    </View>
  );
}
