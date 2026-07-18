import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { setToken } from "../../../lib/auth-client";
import { PageHeader, SettingRow, useSettingsPage } from "../../../features/settings/settings-ui";

/** /settings/user — account actions for this TV. */
export const Route = createFileRoute("/_auth/settings/user")({
  component: UserSettings,
});

function UserSettings() {
  const navigate = useNavigate();
  const rows = [
    {
      label: "Sign out",
      sublabel: "Sign this TV out of your account",
      onClick: () => {
        setToken(null);
        void navigate({ to: "/login" });
      },
    },
  ];
  const { sel } = useSettingsPage(rows.length, (i) => rows[i]!.onClick());

  return (
    <div>
      <PageHeader title="User" subtitle="Your account on this TV." />
      {rows.map((r, i) => (
        <SettingRow key={r.label} label={r.label} sublabel={r.sublabel} focused={sel === i} onClick={r.onClick} />
      ))}
    </div>
  );
}
