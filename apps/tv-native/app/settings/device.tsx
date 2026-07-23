import { Platform, Text, useWindowDimensions, View } from "react-native";

import { PageHeader, SectionLabel, useSettingsPage } from "@/features/settings/settings-ui";

/**
 * /settings/device — this device's info, ported from tv-web's device page. tv-web also shows the
 * measured playback capabilities + per-codec overrides + recent errors; those come from the
 * capability diagnostic + device-caps API, which land with the player arc (that's what measures
 * that iPadOS drops everything to HLS). This page grows those sections then.
 */
export default function DeviceSettings() {
  const { width, height } = useWindowDimensions();
  useSettingsPage(0, () => {});

  return (
    <View>
      <PageHeader title="Device" subtitle="This device's playback capabilities and tools." />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 28, padding: 22, borderRadius: 14, backgroundColor: "rgba(148,163,184,0.06)" }}>
        <Info label="Platform" value={`${Platform.OS} ${Platform.Version}`} />
        <Info label="Resolution" value={`${Math.round(width)}×${Math.round(height)}`} />
        <Info label="TV" value={Platform.isTV ? "Yes" : "No"} />
      </View>

      <SectionLabel>Playback capabilities</SectionLabel>
      <Text style={{ fontSize: 14, color: "#64748b", maxWidth: 640, lineHeight: 20 }}>
        The capability diagnostic measures what this device decodes natively (and, on iPadOS/tvOS,
        confirms playback drops to HLS). It lands with the player — the per-codec overrides and recent
        playback issues will appear here then.
      </Text>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 17, fontWeight: "600", color: "#f1f5f9" }}>{value}</Text>
    </View>
  );
}
