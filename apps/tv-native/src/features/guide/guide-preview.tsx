import { ListFilter, Menu, Settings as SettingsIcon, User } from "lucide-react-native";
import { useMemo } from "react";
import { useWindowDimensions, View } from "react-native";

import { accentOf } from "./accents";
import { FeaturedBody, NowMarker, Row, TimeHeader } from "./aurora-grid";
import type { Lane } from "./geometry";
import { GlassCircleButton } from "./glass-button";
import { GrainFill, PatternFill } from "./guide-parts";
import { plainInk } from "./guide-style";
import { type GuideTokens, rowAccent } from "./guide-tokens";
import { cs, FEATURE_SCALE, guideMetrics, MIN, SIDEBAR_SLIVER_W, vwOf } from "./layout";
import { SAMPLE_CELL_ROW, SAMPLE_NOW_MIN, SAMPLE_RAIL_ROW, sampleLineup, sampleNow, sampleOrigin } from "./preview-data";
import { GuideTokensOverride } from "./use-guide-tokens";

const noop = () => {};

/**
 * A theme drawn on a sample guide, for the settings picker: the real guide's own pieces (featured panel, time header, rows with a
 * selected cell, a focused rail, a live cell and one with art, the sidebar's circles) painted with `tokens` instead of the chosen
 * theme. They are laid out at the window's full size, as the guide is, and the whole is scaled down to `width`, so the preview is
 * exactly what the guide looks like rather than a second drawing of it. It takes no input.
 */
export function GuidePreview({ tokens: chosen, width }: { tokens: GuideTokens; width: number }) {
  // A thumbnail: the inks of a two-ink theme are not blended (see `plainInk`).
  const tk = useMemo(() => plainInk(chosen), [chosen]);
  const { width: win } = useWindowDimensions();
  const stageH = (win * 9) / 16;
  const scale = width / win;
  const vw = useMemo(() => (px: number) => vwOf(win, px), [win]);
  const m = guideMetrics(win);
  const now = useMemo(() => sampleNow(), []);
  const channels = useMemo(() => sampleLineup(now.getTime()), [now]);
  const T0 = useMemo(() => new Date(sampleOrigin(now.getTime())), [now]);
  const lane = useMemo<Lane>(() => ({ T0, ppm: m.ppm, laneW: m.laneW, gap: cs(6) }), [T0, m.ppm, m.laneW]);
  const laneX = (d: Date | string) => ((new Date(d).getTime() - T0.getTime()) / MIN) * m.ppm;
  const nowX = SAMPLE_NOW_MIN * m.ppm;
  const fv = (px: number) => vw(px * FEATURE_SCALE);
  const accentFor = (i: number) => rowAccent(tk, accentOf(i), i);
  const cellRow = channels[SAMPLE_CELL_ROW]!;

  return (
    <GuideTokensOverride value={tk}>
      <View pointerEvents="none" style={{ width, height: stageH * scale, overflow: "hidden" }}>
        <View style={{ width: win, height: stageH, flexDirection: "row", backgroundColor: tk.bg, overflow: "hidden", transform: [{ scale }], transformOrigin: "left top" }}>
          {tk.patterns.bg && (
            <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
              <PatternFill pattern={tk.patterns.bg} u={vw(1)} />
            </View>
          )}
          <View style={{ width: cs(SIDEBAR_SLIVER_W), flexShrink: 0 }} />
          <View style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", paddingTop: fv(40), paddingHorizontal: fv(64) }}>
              <FeaturedBody channel={cellRow} program={cellRow.programs[0]!} now={now} accent={accentFor(SAMPLE_CELL_ROW)} vw={vw} />
            </View>
            <TimeHeader T0={T0} railPx={m.railPx} ppm={m.ppm} laneX={laneX} vw={vw} />
            <View style={{ position: "relative", flex: 1 }}>
              {channels.map((c, i) => (
                <Row
                  key={c.id}
                  channel={c}
                  accent={accentFor(i)}
                  focused={i === SAMPLE_CELL_ROW || i === SAMPLE_RAIL_ROW}
                  railFocused={i === SAMPLE_RAIL_ROW}
                  focusedProgramId={i === SAMPLE_CELL_ROW ? c.programs[0]!.id : undefined}
                  favorited={i === 0 || i === 4}
                  index={i}
                  onRailTap={noop}
                  onProgramTap={noop}
                  now={now}
                  rowPx={m.rowPx}
                  railPx={m.railPx}
                  lane={lane}
                  nowX={nowX}
                  vw={vw}
                  sample
                />
              ))}
              <NowMarker tk={tk} vw={vw} left={m.railPx + laneX(now)} />
            </View>
          </View>
          {/* The collapsed sidebar: its circles, as the guide draws them. */}
          <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: cs(SIDEBAR_SLIVER_W), backgroundColor: tk.sidebar.bg, borderRightWidth: 1, borderRightColor: tk.sidebar.border, paddingVertical: cs(24), paddingHorizontal: cs(18), gap: cs(14) }}>
            <GlassCircleButton tokens={tk} icon={<Menu size={cs(24)} color={tk.sidebar.icon} />} active accent={accentFor(SAMPLE_CELL_ROW)} />
            <GlassCircleButton tokens={tk} icon={<SettingsIcon size={cs(24)} color={tk.sidebar.icon} />} />
            <GlassCircleButton tokens={tk} icon={<User size={cs(24)} color={tk.sidebar.icon} />} />
            <View style={{ height: 1, backgroundColor: tk.sidebar.rule, marginVertical: cs(4) }} />
            <GlassCircleButton tokens={tk} icon={<ListFilter size={cs(24)} color={tk.sidebar.icon} />} />
          </View>
          {tk.patterns.overlay && (
            <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
              <GrainFill grain={tk.patterns.overlay} u={vw(1)} />
            </View>
          )}
        </View>
      </View>
    </GuideTokensOverride>
  );
}
