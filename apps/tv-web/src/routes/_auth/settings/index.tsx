import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { PageHeader, SettingRow, useSettingsPage } from "../../../features/settings/settings-ui";

/** /settings — General (the landing subpage). */
export const Route = createFileRoute("/_auth/settings/")({
  component: General,
});

function General() {
  const navigate = useNavigate();
  const rows = [{ label: "Back to guide", sublabel: "Return to live TV", onClick: () => void navigate({ to: "/" }) }];
  const { sel } = useSettingsPage(rows.length, (i) => rows[i]!.onClick());

  return (
    <div>
      <PageHeader title="General" subtitle="App-wide preferences." />
      {rows.map((r, i) => (
        <SettingRow key={r.label} label={r.label} sublabel={r.sublabel} focused={sel === i} onClick={r.onClick} />
      ))}
      <p style={{ marginTop: 20, fontSize: 15, color: "#64748b", maxWidth: 620 }}>
        ChannelGuide — your media server as live TV channels. More general preferences will live here.
      </p>
    </div>
  );
}
