import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useContext, useEffect, useRef } from "react";
import { Platform, Text, View } from "react-native";

import { TvPressable as Pressable } from "@/components/tv-pressable";
import { scaled } from "@/features/guide/layout";
import { PageHeader, Pill, SectionLabel, SettingRow, SettingsCtx, Toggle, useSettingsPage } from "@/features/settings/settings-ui";
import { api, type CapKind, type CapTokenState, type DeviceCapView } from "@/lib/api";
import { deviceId } from "@/lib/device";

/**
 * /settings/device — device info, tools, and per-codec capability overrides. A faithful port of
 * tv-web's Device page: the diagnostic MEASURES what plays natively, quirks turn known-bad codecs off
 * by default (e.g. AV1 on the Apple mpv clients), and these toggles force a codec on/off per device
 * (the override wins). Effective = override ?? (measured && !quirk); playback uses it via the server's
 * getDeviceNativeCaps. Touch taps a row to toggle; D-pad runs the same via useSettingsPage.
 */
const GROUP_LABEL: Record<CapKind, string> = { video: "Video codecs", audio: "Audio codecs", container: "Containers" };

/** Optimistically apply an override to the cached view so a toggle flips instantly. */
function withOverride(view: DeviceCapView | undefined, kind: CapKind, token: string, value: boolean | null): DeviceCapView | undefined {
  if (!view) return view;
  const groups = view.groups.map((g) =>
    g.kind !== kind
      ? g
      : {
          ...g,
          tokens: g.tokens.map((t) =>
            t.token !== token ? t : { ...t, override: value, effective: value !== null ? value : t.measured && !t.quirk },
          ),
        },
  );
  const hasOverrides = groups.some((g) => g.tokens.some((t) => t.override !== null));
  return { ...view, groups, hasOverrides };
}

export default function DeviceSettings() {
  const router = useRouter();
  const dev = deviceId();
  const qc = useQueryClient();
  const key = ["deviceCaps", dev];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.deviceCaps(dev) });

  const tools = [{ label: "Run capability diagnostic", sublabel: "Re-measure what this device plays natively", onPress: () => router.push("/diagnostic") }];
  const groups = data?.groups ?? [];
  const flatTokens = groups.flatMap((g) => g.tokens.map((t) => ({ kind: g.kind, t })));
  const hasOverrides = data?.hasOverrides ?? false;

  const toggle = async (kind: CapKind, t: CapTokenState) => {
    const next = !t.effective;
    const naturalDefault = t.measured && !t.quirk;
    const value = next === naturalDefault ? null : next; // matches the diagnostic default ⇒ clear the override
    qc.setQueryData(key, (old: DeviceCapView | undefined) => withOverride(old, kind, t.token, value));
    try {
      await api.setDeviceCap(dev, kind, t.token, value);
    } finally {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
  const reset = async () => {
    qc.setQueryData(key, (old: DeviceCapView | undefined) =>
      old ? { ...old, hasOverrides: false, groups: old.groups.map((g) => ({ ...g, tokens: g.tokens.map((t) => ({ ...t, override: null, effective: t.measured && !t.quirk })) })) } : old,
    );
    try {
      await api.resetDeviceCaps(dev);
    } finally {
      void qc.invalidateQueries({ queryKey: key });
    }
  };

  const errors = data?.recentErrors ?? [];
  const resetIndex = tools.length + flatTokens.length; // the "Reset to diagnostic" row (only when hasOverrides)
  const errorsBase = resetIndex + (hasOverrides ? 1 : 0); // recent-issue focus stops follow it
  const count = errorsBase + errors.length;
  const { sel } = useSettingsPage(count, (i) => {
    if (i < tools.length) return tools[i]!.onPress();
    const ti = i - tools.length;
    if (ti < flatTokens.length) return void toggle(flatTokens[ti]!.kind, flatTokens[ti]!.t);
    if (hasOverrides && i === resetIndex) return void reset();
    // recent-issue focus stops (errorsBase..) are informational → OK does nothing.
  });

  // Flat D-pad index of each group's first token (tokens are contiguous after the tools).
  const groupBases: number[] = [];
  {
    let r = tools.length;
    for (const g of groups) {
      groupBases.push(r);
      r += g.tokens.length;
    }
  }

  return (
    <View>
      <PageHeader title="Device" subtitle="This device's playback capabilities and tools." />

      {data?.device && (
        <View style={scaled({ flexDirection: "row", flexWrap: "wrap", gap: 28, paddingVertical: 16, paddingHorizontal: 22, borderRadius: 14, backgroundColor: "rgba(148,163,184,0.06)", marginBottom: 8 })}>
          <Info label="Model" value={data.device.model ?? "—"} />
          <Info label="Platform" value={data.device.platform ?? "—"} />
          <Info label="Resolution" value={data.device.screenWidth ? `${data.device.screenWidth}×${data.device.screenHeight}` : "—"} />
          <Info label="HDR" value={data.device.hdr ? "Yes" : "No"} />
          {/* isTV drives UI_SCALE + the focusable/native-focus gating — the first thing to check on a TV
              build (esp. Android, where it depends on the build IS_TV / device uiMode, not just EXPO_TV). */}
          <Info label="Is TV?" value={Platform.isTV ? "Yes" : "No"} />
        </View>
      )}

      <SectionLabel small>Tools</SectionLabel>
      {tools.map((r, i) => (
        <SettingRow key={r.label} label={r.label} sublabel={r.sublabel} focused={sel === i} onPress={r.onPress} />
      ))}

      <SectionLabel>Playback capabilities</SectionLabel>
      <Text style={scaled({ fontSize: 14, color: "#64748b", marginTop: -6, marginBottom: 18, maxWidth: 640, lineHeight: 20 })}>
        Force a codec on or off for this device. Overrides win over what the diagnostic measured — forcing on something this device can't
        actually decode may break playback.
      </Text>

      {groups.map((g, gi) => {
        // Two columns, filled COLUMN-major so the flat ▲/▼ focus runs straight down one column then the next.
        const base = groupBases[gi]!;
        const rowsCount = Math.ceil(g.tokens.length / 2);
        const colA = g.tokens.slice(0, rowsCount);
        const colB = g.tokens.slice(rowsCount);
        return (
          <View key={g.kind}>
            <SectionLabel small>{GROUP_LABEL[g.kind]}</SectionLabel>
            <View style={scaled({ flexDirection: "row", gap: 20 })}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {colA.map((t, i) => (
                  <TokenRow key={t.token} t={t} focused={sel === base + i} onPress={() => void toggle(g.kind, t)} />
                ))}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {colB.map((t, i) => (
                  <TokenRow key={t.token} t={t} focused={sel === base + rowsCount + i} onPress={() => void toggle(g.kind, t)} />
                ))}
              </View>
            </View>
          </View>
        );
      })}

      {hasOverrides && (
        <View style={{ marginTop: 20 }}>
          <SettingRow label="Reset to diagnostic" sublabel="Clear all overrides — revert to what the diagnostic found" focused={sel === resetIndex} onPress={() => void reset()} />
        </View>
      )}

      {errors.length ? (
        <>
          <SectionLabel>Recent playback issues</SectionLabel>
          {/* Informational, but each is a D-pad focus stop so the list is reachable + scrolls into view on
              a TV (there's nothing interactive here otherwise, so it was previously unreachable by remote). */}
          <View style={scaled({ borderRadius: 14, backgroundColor: "rgba(148,163,184,0.06)", paddingHorizontal: 12, paddingVertical: 6 })}>
            {errors.map((e, i) => (
              <ErrorRow key={i} e={e} first={i === 0} focused={sel === errorsBase + i} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function TokenRow({ t, focused, onPress }: { t: CapTokenState; focused: boolean; onPress: () => void }) {
  const forcedRisky = t.effective && !t.measured; // forced on something the diagnostic says doesn't play
  const status =
    t.override !== null
      ? `Overriding — diagnostic measured ${t.measured ? "plays" : "doesn't play"}`
      : t.quirk
        ? "Known issue — off by default"
        : `Measured: ${t.measured ? "plays natively" : "doesn't play"}`;
  return (
    <SettingRow
      label={t.label}
      sublabel={status}
      focused={focused}
      onPress={onPress}
      right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {forcedRisky && <Pill tone="warn">Forced</Pill>}
          {t.override !== null && !forcedRisky && <Pill tone="accent">Override</Pill>}
          <Toggle on={t.effective} warn={forcedRisky} />
        </View>
      }
    />
  );
}

type RecentError = NonNullable<DeviceCapView["recentErrors"]>[number];

/** A recent-playback-issue row — informational, but a D-pad focus stop so the list is reachable and
 *  snap-scrolls into view on a TV (mirrors the SettingRow ensureVisible-on-focus). OK does nothing. */
function ErrorRow({ e, first, focused }: { e: RecentError; first: boolean; focused: boolean }) {
  const ref = useRef<View>(null);
  const { ensureVisible } = useContext(SettingsCtx);
  useEffect(() => {
    if (focused) ensureVisible(ref.current);
  }, [focused, ensureVisible]);
  return (
    <Pressable
      ref={ref}
      style={scaled({
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderTopWidth: first || focused ? 0 : 1,
        borderTopColor: "rgba(148,163,184,0.1)",
        backgroundColor: focused ? "rgba(74,159,224,0.12)" : "transparent",
      })}
    >
      <Text style={scaled({ fontSize: 15, color: "#e6eaf1" })}>
        {e.channelName ?? e.title ?? "—"}
        <Text style={{ color: "#64748b" }}>
          {" · "}
          {[e.sourceContainer, e.sourceVideoCodec, e.sourceAudioCodec].filter(Boolean).join("/") || "—"}
          {e.mode ? ` · ${e.mode}` : ""}
        </Text>
      </Text>
      {e.error ? <Text style={scaled({ fontSize: 13, color: "#f87171", marginTop: 2 })}>{e.error}</Text> : null}
    </Pressable>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={scaled({ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", marginBottom: 3 })}>{label}</Text>
      <Text style={scaled({ fontSize: 17, fontWeight: "600", color: "#f1f5f9" })}>{value}</Text>
    </View>
  );
}
