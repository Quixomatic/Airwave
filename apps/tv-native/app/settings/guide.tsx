import { View } from "react-native";

import { rendererNote } from "@/features/guide/guide-renderer";
import { GUIDE_ROWS_SETTING, useGuideRenderer } from "@/features/guide/use-guide-renderer";
import { PageHeader, Pill, SectionLabel, SettingNote, SettingRow, useSettingsPage } from "@/features/settings/settings-ui";
import { type GuideRows, setGuidePrefs, useGuidePrefs } from "@/lib/guide-prefs";

/**
 * /settings/guide: how the channel guide looks and draws on this device. A per-device setting (see `lib/guide-prefs.ts`).
 * Guide rendering picks how the rows are drawn: Native (the default) draws them in one native view, on Android TV and only
 * in a build that has the native module, and the guide switches back to Classic by itself if that ever fails; Classic is the
 * original React Native rows.
 *
 * The D-pad stops on the notes as well as the options (see `SettingNote`), so the status line and the footer can be reached.
 */
const ROW_OPTIONS: { value: GuideRows; label: string; sublabel: string }[] = [
  { value: "native", label: "Native", sublabel: "The default." },
  { value: "classic", label: "Classic", sublabel: "The original rows." },
];

const ROWS_HELP = "Native draws the guide directly on Android for smoother scrolling. Classic uses the original rows.";
const FOOTER = "These settings only change this device. Your channels and schedule aren't affected.";

export default function GuideSettings() {
  const prefs = useGuidePrefs();
  const decision = useGuideRenderer();
  const options = GUIDE_ROWS_SETTING ? ROW_OPTIONS : [];
  // The notes come after the options in the D-pad order: the setting's help and status line, then the page footer.
  const notes = [...(options.length > 0 ? [{ text: ROWS_HELP, dim: false }, { text: rendererNote(decision), dim: false }] : []), { text: FOOTER, dim: true }];
  const { sel } = useSettingsPage(options.length + notes.length, (i) => {
    const o = options[i];
    if (o) setGuidePrefs({ rows: o.value });
  });

  return (
    <View>
      <PageHeader title="Guide" subtitle="How the channel guide looks on this device." />

      {options.length > 0 && (
        <>
          <SectionLabel>Performance</SectionLabel>
          <SectionLabel small>Guide rendering</SectionLabel>
          {options.map((o, i) => (
            <SettingRow
              key={o.value}
              label={o.label}
              sublabel={o.sublabel}
              focused={sel === i}
              onPress={() => setGuidePrefs({ rows: o.value })}
              right={prefs.rows === o.value ? <Pill tone="accent">Selected</Pill> : undefined}
            />
          ))}
        </>
      )}
      {notes.map((n, k) => (
        <SettingNote key={n.text} focused={sel === options.length + k} dim={n.dim}>
          {n.text}
        </SettingNote>
      ))}
    </View>
  );
}
