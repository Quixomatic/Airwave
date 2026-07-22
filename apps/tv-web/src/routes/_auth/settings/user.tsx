import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PageHeader, Pill, SectionLabel, SettingRow, useSettingsPage } from "../../../features/settings/settings-ui";
import { setToken, useSession } from "../../../lib/auth-client";

/** /settings/user — who's signed in on this TV, and signing out. */
export const Route = createFileRoute("/_auth/settings/user")({
  component: UserSettings,
});

/** Initials for the fallback avatar: "James Freund" → "JF", else the email's first letter. */
function initialsOf(name?: string | null, email?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (email ?? "?").slice(0, 1).toUpperCase();
}

function UserSettings() {
  const navigate = useNavigate();
  // better-auth session over bearer — the same client the rest of the app authenticates with.
  const { data: session, isPending } = useSession();
  const user = session?.user as { name?: string | null; email?: string; image?: string | null; role?: string | null } | undefined;

  const [armOut, setArmOut] = useState(false);
  const signOut = () => {
    setToken(null);
    void navigate({ to: "/login" });
  };

  const { sel } = useSettingsPage(1, () => {
    if (armOut) signOut();
    else setArmOut(true);
  });

  // Disarm the confirm if focus leaves the row (matches the Server page's change-server confirm).
  useEffect(() => {
    if (sel !== 0) setArmOut(false);
  }, [sel]);

  return (
    <div>
      <PageHeader title="User" subtitle="Your account on this TV." />

      <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "26px 28px", borderRadius: 18, background: "rgba(148,163,184,0.06)", maxWidth: 640, marginBottom: 8 }}>
        <Avatar image={user?.image} initials={initialsOf(user?.name, user?.email)} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px", color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
        sublabel={armOut ? "Press OK again to sign out of this TV" : "Sign this TV out of your account"}
        focused={sel === 0}
        right={armOut ? <Pill tone="warn">Confirm</Pill> : undefined}
        onClick={() => {
          if (armOut) signOut();
          else setArmOut(true);
        }}
      />
    </div>
  );
}

/** The user's picture when better-auth has one, else an initials circle in the settings accent. */
function Avatar({ image, initials }: { image?: string | null; initials: string }) {
  const [failed, setFailed] = useState(false);
  const size = 96;
  if (image && !failed) {
    return (
      <img
        src={image}
        alt=""
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: "rgba(148,163,184,0.16)" }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 34,
        fontWeight: 800,
        letterSpacing: 1,
        color: "#4a9fe0",
        background: "rgba(74,159,224,0.16)",
      }}
    >
      {initials}
    </div>
  );
}
