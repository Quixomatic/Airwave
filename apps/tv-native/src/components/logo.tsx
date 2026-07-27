import { Image, Text, View } from "react-native";

import { scaled } from "@/features/guide/layout";
import { APP_NAME } from "@/lib/app-info";

/**
 * The Airwave brand mark (cloud + wave), optionally with the wordmark.
 * - `width` — the mark's design width (chrome-scaled on Android TV; height keeps the native 715×517 aspect).
 * - `wordmark` — also render "Airwave" in white next to / under the mark.
 * - `layout` — `"row"` puts the wordmark beside the mark (default), `"column"` stacks it underneath.
 */
export function Logo({
  width = 200,
  wordmark = false,
  layout = "row",
}: {
  width?: number;
  wordmark?: boolean;
  layout?: "row" | "column";
}) {
  const mark = (
    <Image
      source={require("../../assets/logo.png")}
      resizeMode="contain"
      style={scaled({ width, height: Math.round((width * 517) / 715) })}
    />
  );
  if (!wordmark) return mark;
  const row = layout === "row";
  return (
    <View style={[{ flexDirection: row ? "row" : "column", alignItems: "center" }, scaled({ gap: row ? 18 : 10 })]}>
      {mark}
      <Text className="font-bold tracking-tight" style={[scaled({ fontSize: Math.round(width * 0.66) }), { color: "#fff" }]}>
        {APP_NAME}
      </Text>
    </View>
  );
}
