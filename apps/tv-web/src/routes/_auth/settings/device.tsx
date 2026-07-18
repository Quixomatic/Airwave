import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { PageHeader, SettingRow, useSettingsPage } from "../../../features/settings/settings-ui";

/** /settings/device — this TV's playback capabilities + device tools. (Capability toggles land in 0.5.2.) */
export const Route = createFileRoute("/_auth/settings/device")({
  component: DeviceSettings,
});

function DeviceSettings() {
  const navigate = useNavigate();
  const rows = [
    {
      label: "Run capability diagnostic",
      sublabel: "Re-measure what this TV plays natively",
      onClick: () => void navigate({ to: "/diagnostic" }),
    },
    {
      label: "Remote key probe",
      sublabel: "Show the keycode for each remote button",
      onClick: () => void navigate({ to: "/remote" }),
    },
  ];
  const { sel } = useSettingsPage(rows.length, (i) => rows[i]!.onClick());

  return (
    <div>
      <PageHeader title="Device" subtitle="This TV's playback capabilities and tools." />
      {rows.map((r, i) => (
        <SettingRow key={r.label} label={r.label} sublabel={r.sublabel} focused={sel === i} onClick={r.onClick} />
      ))}
    </div>
  );
}
