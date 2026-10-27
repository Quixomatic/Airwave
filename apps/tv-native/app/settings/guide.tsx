import { Fragment } from "react";
import { View } from "react-native";

import { rendererNote } from "@/features/guide/guide-renderer";
import { GUIDE_ROWS_SETTING, useGuideRenderer } from "@/features/guide/use-guide-renderer";
import { PageHeader, Pill, SectionLabel, SettingNote, SettingRow, useSettingsPage } from "@/features/settings/settings-ui";
import { type GuideArt, type GuideRows, setGuidePrefs, useGuidePrefs } from "@/lib/guide-prefs";

/**
 * /settings/guide: how the channel guide looks and draws on this device. A per-device setting (see `lib/guide-prefs.ts`).
 *
 *  - Program art shows each program's artwork behind its title (off by default: it costs memory and network).
 *  - Guide rendering picks how the rows are drawn: Native (the default) draws them in one native view, on Android TV and
 *    only in a build that has the native module, and the guide switches back to Classic by itself if that ever fails;
 *    Classic is the original React Native rows.
 *
 * The D-pad stops on the notes as well as the options (see `SettingNote`), so the status line and the footer can be reached.
 */
const ART_OPTIONS: { value: GuideArt; label: string; sublabel: string }[] = [
  { value: "off", label: "Off", sublabel: "Plain program cells." },
  {
    value: "on",
    label: "On",
    sublabel: "Show each program's artwork behind its title. Uses more memory and network, which can slow down lower-end TVs.",
  },
];

const ROW_OPTIONS: { value: GuideRows; label: string; sublabel: string }[] = [
  { value: "native", label: "Native", sublabel: "The default." },
  { value: "classic", label: "Classic", sublabel: "The original rows." },
];

const ROWS_HELP = "Native draws the guide directly on Android for smoother scrolling. Classic uses the original rows.";
const FOOTER = "These settings only change this device. Your channels and schedule aren't affected.";

/** One selectable row on this page. Rows with the same `group` sit under one small heading, and with the same `section` under one big one. */
type Option = { section: string; group: string; label: string; sublabel: string; selected: boolean; apply: () => void };

export default function GuideSettings() {
  const prefs = useGuidePrefs();
  const decision = useGuideRenderer();

  const options: Option[] = [
    ...ART_OPTIONS.map((o): Option => ({
      section: "Look",
      group: "Program art",
      label: o.label,
      sublabel: o.sublabel,
      selected: prefs.art === o.value,
      apply: () => setGuidePrefs({ art: o.value }),
    })),
    ...(GUIDE_ROWS_SETTING
      ? ROW_OPTIONS.map((o): Option => ({
          section: "Performance",
          group: "Guide rendering",
          label: o.label,
          sublabel: o.sublabel,
          selected: prefs.rows === o.value,
          apply: () => setGuidePrefs({ rows: o.value }),
        }))
      : []),
  ];
  // The notes follow the options in the D-pad order: the setting's help and status line, then the page footer.
  const notes = [...(GUIDE_ROWS_SETTING ? [{ text: ROWS_HELP, dim: false }, { text: rendererNote(decision), dim: false }] : []), { text: FOOTER, dim: true }];
  const { sel } = useSettingsPage(options.length + notes.length, (i) => options[i]?.apply());

  return (
    <View>
      <PageHeader title="Guide" subtitle="How the channel guide looks on this device." />

      {options.map((o, i) => {
        const prev = options[i - 1];
        return (
          <Fragment key={`${o.group}:${o.label}`}>
            {prev?.section !== o.section && <SectionLabel>{o.section}</SectionLabel>}
            {prev?.group !== o.group && <SectionLabel small>{o.group}</SectionLabel>}
            <SettingRow label={o.label} sublabel={o.sublabel} focused={sel === i} onPress={o.apply} right={o.selected ? <Pill tone="accent">Selected</Pill> : undefined} />
          </Fragment>
        );
      })}
      {notes.map((n, k) => (
        <SettingNote key={n.text} focused={sel === options.length + k} dim={n.dim}>
          {n.text}
        </SettingNote>
      ))}
    </View>
  );
}
