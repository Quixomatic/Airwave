import { Text, View } from "react-native";

import { scaled } from "@/features/guide/layout";
import { PageHeader, useSettingsPage } from "@/features/settings/settings-ui";
import { APP_NAME, APP_VERSION } from "@/lib/app-info";

/** /settings/about — app identity + version, ported from tv-web. No focusable rows. */
export default function About() {
  useSettingsPage(0, () => {});

  return (
    <View>
      <PageHeader title="About" />

      <View style={scaled({ gap: 10, padding: 34, borderRadius: 18, backgroundColor: "rgba(148,163,184,0.06)", maxWidth: 640 })}>
        <Text style={scaled({ fontSize: 52, fontWeight: "900", letterSpacing: -1, color: "#f1f5f9" })}>{APP_NAME}</Text>
        <Text style={scaled({ fontSize: 19, color: "#94a3b8" })}>Your media server, as live TV.</Text>
        <View style={scaled({ marginTop: 12, alignSelf: "flex-start", backgroundColor: "rgba(74,159,224,0.16)", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 })}>
          <Text style={scaled({ fontSize: 14, fontWeight: "700", letterSpacing: 0.5, color: "#4a9fe0" })}>Version {APP_VERSION}</Text>
        </View>
      </View>

      <Text style={scaled({ marginTop: 24, fontSize: 16, lineHeight: 26, color: "#94a3b8", maxWidth: 640 })}>
        {APP_NAME} turns your own media-server library into curated, always-on TV channels — a broadcast-style guide with live
        tune-in, DVR, and deterministic scheduling, playing straight from your server.
      </Text>

      <Text style={scaled({ marginTop: 20, fontSize: 15, color: "#64748b", maxWidth: 640 })}>
        Looking for the connected server, the Plex connection, or how to sign out? Those live under{" "}
        <Text style={{ color: "#94a3b8" }}>Server</Text> and <Text style={{ color: "#94a3b8" }}>User</Text>.
      </Text>
    </View>
  );
}
