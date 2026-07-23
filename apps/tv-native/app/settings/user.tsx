import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";

import { PageHeader, Pill, SectionLabel, SettingRow, useSettingsPage } from "@/features/settings/settings-ui";
import { setToken } from "@/lib/auth";
import { authClient } from "@/lib/auth-client";

/** /settings/user — who's signed in on this TV + sign out. Ported from tv-web's user page. */
function initialsOf(name?: string | null, email?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (email ?? "?").slice(0, 1).toUpperCase();
}

export default function UserSettings() {
  const router = useRouter();
  const { data: session, isPending } = authClient().useSession();
  const user = session?.user as { name?: string | null; email?: string; image?: string | null; role?: string | null } | undefined;

  const [armOut, setArmOut] = useState(false);
  const signOut = () => {
    void setToken(null).then(() => router.replace("/login"));
  };
  const { sel } = useSettingsPage(1, () => {
    if (armOut) signOut();
    else setArmOut(true);
  });
  useEffect(() => {
    if (sel !== 0) setArmOut(false);
  }, [sel]);

  return (
    <View>
      <PageHeader title="User" subtitle="Your account on this TV." />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 24, padding: 26, borderRadius: 18, backgroundColor: "rgba(148,163,184,0.06)", marginBottom: 8 }}>
        <Avatar image={user?.image} initials={initialsOf(user?.name, user?.email)} />
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 30, fontWeight: "800", letterSpacing: -0.5, color: "#f1f5f9" }}>
            {user?.name || (isPending ? "…" : "Signed in")}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 17, color: "#94a3b8", marginTop: 4 }}>
            {user?.email ?? (isPending ? "" : "—")}
          </Text>
          {user?.role && (
            <View style={{ marginTop: 10 }}>
              <Pill tone="muted">{user.role}</Pill>
            </View>
          )}
        </View>
      </View>

      <SectionLabel>Account</SectionLabel>
      <SettingRow
        label="Sign out"
        sublabel={armOut ? "Press OK again to sign out of this TV" : "Sign this TV out of your account"}
        focused={sel === 0}
        right={armOut ? <Pill tone="warn">Confirm</Pill> : undefined}
        onPress={() => {
          if (armOut) signOut();
          else setArmOut(true);
        }}
      />
    </View>
  );
}

function Avatar({ image, initials }: { image?: string | null; initials: string }) {
  const [failed, setFailed] = useState(false);
  const size = 96;
  if (image && !failed) {
    return <Image source={{ uri: image }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "rgba(148,163,184,0.16)" }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(74,159,224,0.16)" }}>
      <Text style={{ fontSize: 34, fontWeight: "800", letterSpacing: 1, color: "#4a9fe0" }}>{initials}</Text>
    </View>
  );
}
