import { useRouter } from "expo-router";
import { Platform, Text, useWindowDimensions, View } from "react-native";

import { PageHeader, SectionLabel, SettingRow, useSettingsPage } from "@/features/settings/settings-ui";

/**
 * /settings/device — device info + tools, ported from tv-web's device page. The measured playback
 * capabilities + per-codec overrides + recent errors (also on tv-web's page) come next; the
 * "Run capability diagnostic" tool re-measures this device against the current server.
 */
export default function DeviceSettings() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const tools = [{ label: "Run capability diagnostic", sublabel: "Re-measure what this device plays natively", onPress: () => router.push("/diagnostic") }];
  const { sel } = useSettingsPage(tools.length, (i) => tools[i]!.onPress());

  return (
    <View>
      <PageHeader title="Device" subtitle="This device's playback capabilities and tools." />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 28, padding: 22, borderRadius: 14, backgroundColor: "rgba(148,163,184,0.06)" }}>
        <Info label="Platform" value={`${Platform.OS} ${Platform.Version}`} />
        <Info label="Resolution" value={`${Math.round(width)}×${Math.round(height)}`} />
        <Info label="TV" value={Platform.isTV ? "Yes" : "No"} />
      </View>

      <SectionLabel small>Tools</SectionLabel>
      {tools.map((t, i) => (
        <SettingRow key={t.label} label={t.label} sublabel={t.sublabel} focused={sel === i} onPress={t.onPress} />
      ))}

      <SectionLabel>Playback capabilities</SectionLabel>
      <Text style={{ fontSize: 14, color: "#64748b", maxWidth: 640, lineHeight: 20 }}>
        The diagnostic measures what this device decodes natively (and, on iPadOS/tvOS, confirms
        playback drops to HLS). The per-codec overrides + recent playback issues shown on tv-web's
        Device page land here next.
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
