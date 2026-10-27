import { Fragment, type ReactNode } from "react";
import { View } from "react-native";

import { rendererNote } from "@/features/guide/guide-renderer";
import { findGuideTheme, findGuideVariant, GUIDE_THEMES, guideSwatch, resolveGuideTokens, variantIndex } from "@/features/guide/guide-themes";
import { scaled } from "@/features/guide/layout";
import { marksOptions } from "@/features/guide/marks-options";
import { GUIDE_ROWS_SETTING, useGuideRenderer } from "@/features/guide/use-guide-renderer";
import { PageHeader, Pill, SectionLabel, SettingNote, SettingRow, useSettingsPage } from "@/features/settings/settings-ui";
import { useGuide } from "@/hooks/queries";
import { type GuideArt, type GuideRows, setGuidePrefs, useGuidePrefs } from "@/lib/guide-prefs";

/**
 * /settings/guide: how the channel guide looks and draws on this device. A per-device setting (see `lib/guide-prefs.ts`).
 *
 *  - Theme and Color restyle the guide screen at once, in two steps: pick a theme, then (for a theme that comes in more than one)
 *    one of its colors, which are listed right under the themes. Choosing a theme moves the D-pad to its colors, and Back from
 *    there returns to the theme list. The settings screens themselves keep the standard look.
 *  - Channel marks picks the icon or the channel's logo for the rail. Both are always listed, so the list never changes under the
 *    D-pad as the guide loads; Logos can be chosen once a channel has a logo (they are set in the admin).
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
const FOOTER =
  "These settings only change this device. Your channels and schedule aren't affected. A theme restyles the guide screen; Settings and the player keep the standard look.";

/** One selectable row on this page. Rows with the same `group` sit under one small heading, and with the same `section` under one big one. */
type Option = { section: string; group: string; label: string; sublabel: string; selected: boolean; apply: () => void; extra?: ReactNode; disabled?: boolean };

/** A band of small squares: what a theme or color looks like. */
function Swatch({ colors }: { colors: readonly string[] }) {
  return (
    <View style={scaled({ flexDirection: "row", borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: "rgba(148,163,184,0.4)" })}>
      {colors.map((c, i) => (
        <View key={`${i}:${c}`} style={scaled({ width: 22, height: 22, backgroundColor: c })} />
      ))}
    </View>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function GuideSettings() {
  const prefs = useGuidePrefs();
  const decision = useGuideRenderer();
  // The theme in use and its color (a stale or foreign id has already become the theme's default; see guide-prefs.ts).
  const theme = findGuideTheme(prefs.theme);
  const variant = findGuideVariant(theme, prefs.variant);
  // Logos can be chosen once the server sends a channel with one. Both rows are listed either way (see `marksOptions`): adding them once the
  // guide loads would push every option below them down a position under the D-pad.
  const { data: guide } = useGuide(180);

  const options: Option[] = [
    ...GUIDE_THEMES.map((t): Option => {
      const [ground, , accent, ink] = guideSwatch(resolveGuideTokens(t.id, t.defaultVariant));
      return {
        section: "Look",
        group: "Theme",
        label: t.name,
        sublabel: t.description,
        selected: theme.id === t.id,
        extra: (
          <>
            <Swatch colors={[ground, accent, ink]} />
            <Pill tone="muted">{t.variants.length > 1 ? plural(t.variants.length, "color") : "Default"}</Pill>
          </>
        ),
        apply: () => {
          setGuidePrefs({ theme: t.id });
          // The second step: a theme that comes in colors sends the D-pad to the one in use. Choosing the theme already in use keeps its color;
          // choosing another starts it on its default (see `setGuidePrefs`).
          if (t.variants.length > 1) setSel(GUIDE_THEMES.length + variantIndex(t, theme.id === t.id ? variant.id : t.defaultVariant));
        },
      };
    }),
    ...(theme.variants.length > 1
      ? theme.variants.map((v): Option => ({
          section: "Look",
          group: `Color: ${theme.name}`,
          label: v.name,
          sublabel: v.description,
          selected: variant.id === v.id,
          extra: <Swatch colors={guideSwatch(resolveGuideTokens(theme.id, v.id))} />,
          apply: () => setGuidePrefs({ variant: v.id }),
        }))
      : []),
    ...marksOptions(prefs.marks, !!guide?.channels.some((c) => !!c.logo)).map((o): Option => ({
      section: "Look",
      group: "Channel marks",
      label: o.label,
      sublabel: o.sublabel,
      selected: o.selected,
      disabled: o.disabled,
      apply: () => {
        if (!o.disabled) setGuidePrefs({ marks: o.value });
      },
    })),
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
  const { sel, setSel } = useSettingsPage(options.length + notes.length, (i) => options[i]?.apply(), {
    // Back from a color returns to the theme in use rather than leaving the page.
    onBack: (i) => {
      if (options[i]?.group !== `Color: ${theme.name}`) return false;
      setSel(GUIDE_THEMES.findIndex((t) => t.id === theme.id));
      return true;
    },
  });

  return (
    <View>
      <PageHeader title="Guide" subtitle="How the channel guide looks on this device." />

      {options.map((o, i) => {
        const prev = options[i - 1];
        return (
          <Fragment key={`${o.group}:${o.label}`}>
            {prev?.section !== o.section && <SectionLabel>{o.section}</SectionLabel>}
            {prev?.group !== o.group && <SectionLabel small>{o.group}</SectionLabel>}
            <SettingRow
              label={o.label}
              sublabel={o.sublabel}
              focused={sel === i}
              onPress={o.apply}
              right={
                o.extra || o.selected || o.disabled ? (
                  <View style={scaled({ flexDirection: "row", alignItems: "center", gap: 12 })}>
                    {o.extra}
                    {o.selected ? <Pill tone="accent">Selected</Pill> : o.disabled ? <Pill tone="muted">No logos set</Pill> : null}
                  </View>
                ) : undefined
              }
            />
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
