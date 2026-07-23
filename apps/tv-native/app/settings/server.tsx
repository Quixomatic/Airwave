import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { PageHeader, Pill, SectionLabel, SettingRow, useSettingsPage } from "@/features/settings/settings-ui";
import { clearServerUrl, getServerUrl, setToken } from "@/lib/auth";

/**
 * /settings/server — the connected server, ported from tv-web's server page. Address + Change
 * server (sign out + drop the stored server → back to onboarding).
 *
 * The Media-connection / Force-connection rows from tv-web's server page arrive with the player
 * (they need the Plex connection probe, which is a playback concern) — that's the next arc.
 */
export default function ServerSettings() {
  const router = useRouter();
  const [armChange, setArmChange] = useState(false);
  const changeServer = () => {
    // Sign out + drop the stored server, then bounce through the entry gate → onboarding.
    void Promise.all([setToken(null), clearServerUrl()]).then(() => router.replace("/"));
  };
  const { sel } = useSettingsPage(1, () => {
    if (armChange) changeServer();
    else setArmChange(true);
  });
  useEffect(() => {
    if (sel !== 0) setArmChange(false);
  }, [sel]);

  return (
    <View>
      <PageHeader title="Server" subtitle="The ChannelGuide server this TV is signed in to." />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 28, padding: 22, borderRadius: 14, backgroundColor: "rgba(148,163,184,0.06)", marginBottom: 8 }}>
        <Info label="Address" value={getServerUrl() || "Not connected"} />
      </View>

      <SectionLabel>Change server</SectionLabel>
      <SettingRow
        label="Change server"
        sublabel={armChange ? "Press OK again to sign out and return to server setup" : "Sign out and pick a different ChannelGuide server"}
        focused={sel === 0}
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
      <Text style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 17, fontWeight: "600", color: "#f1f5f9" }}>{value}</Text>
    </View>
  );
}
