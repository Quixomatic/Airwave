import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { api, type CapKind, type CapTokenState, type DeviceCapView } from "../../../lib/api";
import { deviceId } from "../../../lib/device";
import { PageHeader, Pill, SectionLabel, SettingRow, Toggle, useSettingsPage } from "../../../features/settings/settings-ui";

/** /settings/device — device info, the tools, and per-codec capability overrides. */
export const Route = createFileRoute("/_auth/settings/device")({
  component: DeviceSettings,
});

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

function DeviceSettings() {
  const navigate = useNavigate();
  const dev = deviceId();
  const qc = useQueryClient();
  const key = ["deviceCaps", dev];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.deviceCaps(dev) });

  const tools = [
    { label: "Run capability diagnostic", sublabel: "Re-measure what this TV plays natively", onClick: () => void navigate({ to: "/diagnostic" }) },
    { label: "Remote key probe", sublabel: "Show the keycode for each remote button", onClick: () => void navigate({ to: "/remote" }) },
  ];
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

  const count = tools.length + flatTokens.length + (hasOverrides ? 1 : 0);
  const { sel } = useSettingsPage(count, (i) => {
    if (i < tools.length) return tools[i]!.onClick();
    const ti = i - tools.length;
    if (ti < flatTokens.length) return void toggle(flatTokens[ti]!.kind, flatTokens[ti]!.t);
    void reset();
  });

  const tokBase = tools.length;
  const resetIndex = tools.length + flatTokens.length;
  let tokIdx = tokBase;

  return (
    <div>
      <PageHeader title="Device" subtitle="This TV's playback capabilities and tools." />

      {data?.device && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, padding: "16px 22px", borderRadius: 14, background: "rgba(148,163,184,0.06)", marginBottom: 8 }}>
          <Info label="Model" value={data.device.model ?? "—"} />
          <Info label="webOS" value={data.device.osVersion ?? "—"} />
          <Info label="Resolution" value={data.device.screenWidth ? `${data.device.screenWidth}×${data.device.screenHeight}` : "—"} />
          <Info label="HDR" value={data.device.hdr ? "Yes" : "No"} />
        </div>
      )}

      <SectionLabel small>Tools</SectionLabel>
      {tools.map((r, i) => (
        <SettingRow key={r.label} label={r.label} sublabel={r.sublabel} focused={sel === i} onClick={r.onClick} />
      ))}

      <SectionLabel>Playback capabilities</SectionLabel>
      <p style={{ fontSize: 14, color: "#64748b", marginTop: -6, marginBottom: 18, maxWidth: 640 }}>
        Force a codec on or off for this TV. Overrides win over what the diagnostic measured — forcing on something your TV can't
        actually decode may break playback.
      </p>
      {groups.map((g) => {
        // Two columns, filled COLUMN-major so the flat ▲/▼ focus still runs straight down one column
        // then the next (grid-auto-flow: column over N rows).
        const rowsCount = Math.ceil(g.tokens.length / 2);
        return (
          <div key={g.kind}>
            <SectionLabel small>{GROUP_LABEL[g.kind]}</SectionLabel>
            <div style={{ display: "grid", gridTemplateRows: `repeat(${rowsCount}, auto)`, gridAutoFlow: "column", columnGap: 20 }}>
              {g.tokens.map((t) => {
                const idx = tokIdx++;
                return <TokenRow key={t.token} t={t} focused={sel === idx} onClick={() => void toggle(g.kind, t)} />;
              })}
            </div>
          </div>
        );
      })}

      {hasOverrides && (
        <div style={{ marginTop: 20 }}>
          <SettingRow label="Reset to diagnostic" sublabel="Clear all overrides — revert to what the diagnostic found" focused={sel === resetIndex} onClick={() => void reset()} />
        </div>
      )}

      {data?.recentErrors?.length ? (
        <>
          <SectionLabel>Recent playback issues</SectionLabel>
          <div style={{ borderRadius: 14, background: "rgba(148,163,184,0.06)", padding: "6px 22px" }}>
            {data.recentErrors.map((e, i) => (
              <div key={i} style={{ padding: "12px 0", borderTop: i ? "1px solid rgba(148,163,184,0.1)" : "none" }}>
                <div style={{ fontSize: 15, color: "#e6eaf1" }}>
                  {e.channelName ?? e.title ?? "—"}
                  <span style={{ color: "#64748b" }}>
                    {" · "}
                    {[e.sourceContainer, e.sourceVideoCodec, e.sourceAudioCodec].filter(Boolean).join("/") || "—"}
                    {e.mode ? ` · ${e.mode}` : ""}
                  </span>
                </div>
                {e.error && <div style={{ fontSize: 13, color: "#f87171", marginTop: 2 }}>{e.error}</div>}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function TokenRow({ t, focused, onClick }: { t: CapTokenState; focused: boolean; onClick: () => void }) {
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
      onClick={onClick}
      right={
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {forcedRisky && <Pill tone="warn">Forced</Pill>}
          {t.override !== null && !forcedRisky && <Pill tone="accent">Override</Pill>}
          <Toggle on={t.effective} warn={forcedRisky} />
        </div>
      }
    />
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 600, color: "#f1f5f9" }}>{value}</div>
    </div>
  );
}
