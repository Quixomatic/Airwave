import type { GuideMarks } from "@/lib/guide-prefs";

/**
 * The rows of Settings > Guide > Channel marks. The same two rows, in the same order, whatever the guide has loaded: Logos is
 * only DISABLED until some channel has a logo, never left out, because a row that turns up once the guide data arrives pushes every
 * option below it down a place under the D-pad (the focus stays on its position, so it lands on a different option).
 *
 * No react-native imports, so `bun test` can load it.
 */
export type MarksOption = { value: GuideMarks; label: string; sublabel: string; selected: boolean; disabled: boolean };

/** Logos can be chosen once a channel has one, and stay choosable while chosen (so they can be turned off again). */
export function marksOptions(marks: GuideMarks, anyChannelHasLogo: boolean): MarksOption[] {
  const logosAvailable = marks === "logos" || anyChannelHasLogo;
  return [
    { value: "icons", label: "Icons", sublabel: "Each channel's icon in a colored circle.", selected: marks === "icons", disabled: false },
    {
      value: "logos",
      label: "Logos",
      sublabel: logosAvailable
        ? "Show a channel's logo where one is set; other channels keep their icon."
        : "No channel has a logo yet. A channel's logo is set in the admin.",
      selected: marks === "logos",
      disabled: !logosAvailable,
    },
  ];
}
