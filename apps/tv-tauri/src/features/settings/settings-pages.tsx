import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@airwave/ui/components/frame";
import { Switch } from "@airwave/ui/components/switch";
import { arch, platform, version } from "@tauri-apps/plugin-os";
import { FaApple, FaLinux, FaWindows } from "react-icons/fa";
import { useState } from "react";

import { api, type CapKind, type CapTokenState, type DeviceCapView } from "../../lib/api";
import { APP_NAME, APP_VERSION } from "../../lib/app-info";
import { authClient, setToken } from "../../lib/auth-client";
import { deviceId } from "../../lib/device";
import { Logo } from "../../lib/logo";
import {
  getNetwork,
  getNetworkOverride,
  probeConnection,
  setNetworkOverride,
  type Network,
} from "../../lib/plex-connection";
import { clearStoredServerUrl, getStoredServerUrl, hasBakedServer } from "../../lib/server-url";
import { checkForUpdates, type UpdateStatus } from "../../lib/updater";
import {
  InfoStat,
  PageHeader,
  Pill,
  SectionLabel,
  SETTINGS_ACCENT,
  SettingRow,
  useArmedAction,
  useSettingsPage,
} from "./settings-ui";

/**
 * The settings section bodies — faithful ports of tv-web `routes/_auth/settings/*`. tv-tauri seams:
 * `SERVER_URL` → `getStoredServerUrl()`, `useSession` → `authClient().useSession()`, the two-tap
 * confirms use `useArmedAction` (mouse + D-pad), and the desktop app has no "/remote" key-probe tool.
 */

// ── General ──────────────────────────────────────────────────────────────────
function updateSublabel(s: UpdateStatus): string {
  switch (s.state) {
    case "checking":
      return "Checking for updates…";
    case "downloading":
      return `Downloading ${s.version}… the app will restart to finish.`;
    case "uptodate":
      return `You're on the latest version (${APP_VERSION}).`;
    case "error":
      return "Couldn't check for updates right now — try again later.";
    default:
      return `Currently on ${APP_VERSION} — click to check for a newer build.`;
  }
}

export function GeneralPage() {
  const navigate = useNavigate();
  const [upd, setUpd] = useState<UpdateStatus>({ state: "idle" });
  const busy = upd.state === "checking" || upd.state === "downloading";

  const rows = [
    {
      label: "Check for updates",
      sublabel: updateSublabel(upd),
      onClick: () => {
        if (!busy) void checkForUpdates(setUpd);
      },
    },
    { label: "Back to guide", sublabel: "Return to live TV", onClick: () => void navigate({ to: "/" }) },
  ];
  const { sel } = useSettingsPage(rows.length, (i) => rows[i]!.onClick());

  return (
    <>
      <PageHeader title="General" subtitle="App-wide preferences." />
      <Body>
        {rows.map((r, i) => (
          <SettingRow key={r.label} label={r.label} sublabel={r.sublabel} focused={sel === i} onClick={r.onClick} />
        ))}
        <p style={{ marginTop: 20, fontSize: 15, color: "#64748b", maxWidth: 620 }}>
          Airwave — your media server as live TV channels. More general preferences will live here.
        </p>
      </Body>
    </>
  );
}

// ── User ─────────────────────────────────────────────────────────────────────
function initialsOf(name?: string | null, email?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (email ?? "?").slice(0, 1).toUpperCase();
}

export function UserPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient().useSession();
  const user = session?.user as { name?: string | null; email?: string; image?: string | null; role?: string | null } | undefined;

  const { armed, trigger } = useArmedAction(() => {
    setToken(null);
    void navigate({ to: "/login" });
  });
  const { sel } = useSettingsPage(1, () => trigger());

  return (
    <>
      <PageHeader title="User" subtitle="Your account on this device." />
      <Body>
        <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "26px 28px", borderRadius: 18, background: "rgba(148,163,184,0.06)", maxWidth: 640, marginBottom: 8 }}>
          <Avatar image={user?.image} initials={initialsOf(user?.name, user?.email)} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.name || (isPending ? "…" : "Signed in")}
            </div>
            <div style={{ fontSize: 17, color: "#94a3b8", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.email ?? (isPending ? "" : "—")}
            </div>
            {user?.role && (
              <div style={{ marginTop: 10 }}>
                <Pill tone="muted">{user.role}</Pill>
              </div>
            )}
          </div>
        </div>

        <SectionLabel>Account</SectionLabel>
        <SettingRow
          label="Sign out"
          sublabel={armed ? "Click again to sign out of this device" : "Sign this device out of your account"}
          focused={sel === 0}
          right={armed ? <Pill tone="warn">Confirm</Pill> : undefined}
          onClick={trigger}
        />
      </Body>
    </>
  );
}

function Avatar({ image, initials }: { image?: string | null; initials: string }) {
  const [failed, setFailed] = useState(false);
  const size = 92;
  if (image && !failed) {
    return <img src={image} alt="" onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: "rgba(148,163,184,0.16)" }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 800, letterSpacing: 1, color: SETTINGS_ACCENT, background: "rgba(74,159,224,0.16)" }}>
      {initials}
    </div>
  );
}

// ── Server ───────────────────────────────────────────────────────────────────
const NETWORK_LABEL: Record<Network, string> = { local: "Local network", remote: "Remote (WAN)", relay: "Relay" };

export function ServerPage() {
  const baked = hasBakedServer();
  const changeServer = () => {
    setToken(null);
    if (!baked) clearStoredServerUrl();
    window.location.reload();
  };
  const { armed, trigger: triggerChange } = useArmedAction(changeServer);

  const [network, setNetwork] = useState<Network | null>(getNetwork());
  const [override, setOverride] = useState<Network | null>(getNetworkOverride());
  const [checking, setChecking] = useState(false);

  const recheck = () => {
    if (checking) return;
    setChecking(true);
    probeConnection()
      .then(() => setNetwork(getNetwork()))
      .finally(() => setChecking(false));
  };

  // Force a connection for testing (cycle Auto → Remote → Relay) — exercise the remote/relay path
  // from the home LAN.
  const cycleOverride = () => {
    const next: Network | null = override === null ? "remote" : override === "remote" ? "relay" : null;
    setNetworkOverride(next);
    setOverride(next);
    setNetwork(getNetwork());
  };

  const { sel } = useSettingsPage(3, (i) => {
    if (i === 0) recheck();
    else if (i === 1) cycleOverride();
    else triggerChange();
  });

  return (
    <>
      <PageHeader title="Server" subtitle="The Airwave server this device is signed in to." />
      <Body>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, padding: "16px 22px", borderRadius: 14, background: "rgba(148,163,184,0.06)", marginBottom: 8 }}>
          <InfoStat label="Address" value={getStoredServerUrl() || "Not connected"} />
          <InfoStat label="Media connection" value={network ? NETWORK_LABEL[network] : "Not determined"} />
          <InfoStat label="Connection mode" value={override ? "Forced" : "Auto"} />
        </div>

        <SectionLabel>Plex connection</SectionLabel>
        <p style={{ fontSize: 14, color: "#64748b", marginTop: -6, marginBottom: 18, maxWidth: 640 }}>
          Video streams straight from your media server, so this app picks the address it can actually reach — the local network
          at home, or the remote/relay address when it's away.
        </p>
        <SettingRow
          label="Media connection"
          sublabel={checking ? "Checking…" : network ? `${NETWORK_LABEL[network]} — click to recheck` : "Not determined — click to check"}
          focused={sel === 0}
          onClick={recheck}
        />
        <SettingRow
          label="Force connection (testing)"
          sublabel={override ? `Forced: ${NETWORK_LABEL[override]} — click to change` : "Off — following auto probe"}
          focused={sel === 1}
          onClick={cycleOverride}
        />

        <SectionLabel>{baked ? "Session" : "Change server"}</SectionLabel>
        <SettingRow
          label={baked ? "Sign out" : "Change server"}
          sublabel={
            armed
              ? baked
                ? "Click again to sign out of this server"
                : "Click again to sign out and return to server setup"
              : baked
                ? "Sign out — the server address is fixed by this deployment"
                : "Sign out and pick a different Airwave server"
          }
          focused={sel === 2}
          right={armed ? <Pill tone="warn">Confirm</Pill> : undefined}
          onClick={triggerChange}
        />
      </Body>
    </>
  );
}

// ── Device (capability grid) ───────────────────────────────────────────────────
const GROUP_LABEL: Record<CapKind, string> = { video: "Video codecs", audio: "Audio codecs", container: "Containers" };

function withOverride(view: DeviceCapView | undefined, kind: CapKind, token: string, value: boolean | null): DeviceCapView | undefined {
  if (!view) return view;
  const groups = view.groups.map((g) =>
    g.kind !== kind
      ? g
      : { ...g, tokens: g.tokens.map((t) => (t.token !== token ? t : { ...t, override: value, effective: value !== null ? value : t.measured && !t.quirk })) },
  );
  const hasOverrides = groups.some((g) => g.tokens.some((t) => t.override !== null));
  return { ...view, groups, hasOverrides };
}

const OS_LABEL: Record<string, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };
const OS_ICON: Record<string, React.ReactNode> = {
  windows: <FaWindows size={16} />,
  macos: <FaApple size={17} />,
  linux: <FaLinux size={17} />,
};

export function DevicePage() {
  const navigate = useNavigate();
  const dev = deviceId();
  const qc = useQueryClient();
  const key = ["deviceCaps", dev];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.deviceCaps(dev) });

  const tools = [{ label: "Run capability diagnostic", sublabel: "Re-measure what this device plays natively", onClick: () => void navigate({ to: "/diagnostic" }) }];
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

  const resetIndex = tools.length + flatTokens.length;
  let tokIdx = tools.length;

  return (
    <>
      <PageHeader title="Device" subtitle="This device's playback capabilities and tools." />
      <Body>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, padding: "16px 22px", borderRadius: 14, background: "rgba(148,163,184,0.06)", marginBottom: 8 }}>
          <InfoStat label="OS" value={OS_LABEL[platform()] ?? platform()} icon={OS_ICON[platform()]} />
          <InfoStat label="System" value={`${version()} · ${arch()}`} />
          <InfoStat label="Resolution" value={data?.device?.screenWidth ? `${data.device.screenWidth}×${data.device.screenHeight}` : "—"} />
          <InfoStat label="HDR" value={data?.device?.hdr ? "Yes" : "No"} />
        </div>

        <SectionLabel small>Tools</SectionLabel>
        {tools.map((r, i) => (
          <SettingRow key={r.label} label={r.label} sublabel={r.sublabel} focused={sel === i} onClick={r.onClick} />
        ))}

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
          <Frame>
            <FrameHeader>
              <FrameTitle>Playback capabilities</FrameTitle>
              <FrameDescription>
                Force a codec on or off for this device. Overrides win over what the diagnostic measured — forcing
                on something it can't actually decode may break playback.
              </FrameDescription>
            </FrameHeader>
            <FramePanel>
              {groups.map((g) => {
                const rowsCount = Math.ceil(g.tokens.length / 2);
                return (
                  <div key={g.kind}>
                    <SectionLabel small>{GROUP_LABEL[g.kind]}</SectionLabel>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: `repeat(${rowsCount}, auto)`, gridAutoFlow: "column", columnGap: 20 }}>
                      {g.tokens.map((t) => {
                        const idx = tokIdx++;
                        return <TokenRow key={t.token} t={t} focused={sel === idx} onClick={() => void toggle(g.kind, t)} />;
                      })}
                    </div>
                  </div>
                );
              })}
              {hasOverrides && (
                <div style={{ marginTop: 8 }}>
                  <SettingRow label="Reset to diagnostic" sublabel="Clear all overrides — revert to what the diagnostic found" focused={sel === resetIndex} onClick={() => void reset()} />
                </div>
              )}
            </FramePanel>
          </Frame>

          {data?.recentErrors?.length ? (
            <Frame>
              <FrameHeader>
                <FrameTitle>Recent playback issues</FrameTitle>
              </FrameHeader>
              <FramePanel>
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
              </FramePanel>
            </Frame>
          ) : null}
        </div>
      </Body>
    </>
  );
}

function TokenRow({ t, focused, onClick }: { t: CapTokenState; focused: boolean; onClick: () => void }) {
  const forcedRisky = t.effective && !t.measured;
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
          {/* Real @airwave/ui Switch, read-only + pointer-events-off: the SettingRow's OK/click is the
              single toggle path (D-pad model). `forcedRisky` tints it amber to match the "Forced" pill. */}
          <Switch
            checked={t.effective}
            readOnly
            tabIndex={-1}
            className={forcedRisky ? "pointer-events-none data-checked:bg-[#f0a92a]" : "pointer-events-none"}
          />
        </div>
      }
    />
  );
}

// ── About ────────────────────────────────────────────────────────────────────
export function AboutPage() {
  useSettingsPage(0, () => {});

  return (
    <>
      <PageHeader title="About" />
      <Body>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "36px 34px", borderRadius: 18, background: "rgba(148,163,184,0.06)", maxWidth: 640 }}>
          <Logo markWidth={72} wordmark />
          <div style={{ fontSize: 18, color: "#94a3b8" }}>Your media server, as live TV.</div>
          <div style={{ marginTop: 12, alignSelf: "flex-start", fontSize: 14, fontWeight: 700, letterSpacing: 0.5, padding: "6px 14px", borderRadius: 999, background: "rgba(74,159,224,0.16)", color: SETTINGS_ACCENT }}>
            Version {APP_VERSION}
          </div>
        </div>

        <p style={{ marginTop: 24, fontSize: 16, lineHeight: 1.6, color: "#94a3b8", maxWidth: 640 }}>
          {APP_NAME} turns your own media-server library into curated, always-on TV channels — a broadcast-style guide with live
          tune-in, DVR, and deterministic scheduling, playing straight from your server.
        </p>

        <p style={{ marginTop: 20, fontSize: 15, color: "#64748b", maxWidth: 640 }}>
          Looking for the connected server, the Plex connection, or how to sign out? Those live under{" "}
          <strong style={{ color: "#94a3b8" }}>Server</strong> and <strong style={{ color: "#94a3b8" }}>User</strong>.
        </p>
      </Body>
    </>
  );
}

/** The scrolling body under the sticky header — supplies the horizontal + bottom padding the header
 *  spans over (the header has its own padding; the column itself has none). */
function Body({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "24px 64px 64px" }}>{children}</div>;
}
