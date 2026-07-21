import { Button } from "@ChannelGuide/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@ChannelGuide/ui/components/frame";
import { Input } from "@ChannelGuide/ui/components/input";
import { Label } from "@ChannelGuide/ui/components/label";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { authClient, useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth/settings/main")({
  staticData: { breadcrumb: "General" },
  component: SettingsGeneral,
});

function SettingsGeneral() {
  const { data: session, refetch } = useSession();
  const currentName = session?.user.name ?? "";
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session?.user) setName(session.user.name ?? "");
  }, [session?.user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    try {
      // Profile updates go through better-auth (it owns the user record + session).
      const { error } = await authClient.updateUser({ name: name.trim() });
      if (error) throw new Error(error.message ?? "Update failed");
      toast.success("Name updated.");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Frame>
        <FrameHeader>
          <FrameTitle>Profile</FrameTitle>
          <FrameDescription>Your account details.</FrameDescription>
        </FrameHeader>
        <FramePanel>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <div className="flex gap-2">
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="max-w-sm"
                />
                <Button type="submit" disabled={saving || !name.trim() || name.trim() === currentName}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
            {session?.user.email && (
              <div className="space-y-2">
                <Label>Email</Label>
                <p className="text-muted-foreground text-sm">{session.user.email}</p>
              </div>
            )}
          </form>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>General</FrameTitle>
          <FrameDescription>Server-wide preferences.</FrameDescription>
        </FrameHeader>
        <FramePanel>
          <p className="text-muted-foreground text-sm">
            General server settings will live here — playback defaults, IPTV output, and appearance.
          </p>
        </FramePanel>
      </Frame>
    </div>
  );
}
