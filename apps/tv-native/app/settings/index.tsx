import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { PageHeader, SettingRow, useSettingsPage } from "@/features/settings/settings-ui";

/** /settings — General (the landing subpage), ported from tv-web. */
export default function General() {
  const router = useRouter();
  const rows = [{ label: "Back to guide", sublabel: "Return to live TV", onPress: () => router.replace("/guide") }];
  const { sel } = useSettingsPage(rows.length, (i) => rows[i]!.onPress());

  return (
    <View>
      <PageHeader title="General" subtitle="App-wide preferences." />
      {rows.map((r, i) => (
        <SettingRow key={r.label} label={r.label} sublabel={r.sublabel} focused={sel === i} onPress={r.onPress} />
      ))}
      <Text style={{ marginTop: 20, fontSize: 15, color: "#64748b" }}>
        Airwave — your media server as live TV channels. More general preferences will live here.
      </Text>
    </View>
  );
}
