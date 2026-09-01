import { Button } from "@airwave/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { Input } from "@airwave/ui/components/input";
import { Label } from "@airwave/ui/components/label";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@airwave/ui/components/number-field";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { authClient, useSession } from "@/lib/auth-client";
import { trpc, trpcClient } from "@/utils/trpc";

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

  // Server-wide app settings (parallelism knobs for the AI lineup builder + importer). The NumberField
  // component enforces the 1–16 bounds itself; `null` = the field was cleared.
  const settingsQ = useQuery(trpc.settings.get.queryOptions());
  const [buildConc, setBuildConc] = useState<number | null>(null);
  const [importConc, setImportConc] = useState<number | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  useEffect(() => {
    if (settingsQ.data) {
      setBuildConc(settingsQ.data.channelBuildConcurrency);
      setImportConc(settingsQ.data.importConcurrency);
    }
  }, [settingsQ.data]);
  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await trpcClient.settings.update.mutate({
        channelBuildConcurrency: buildConc ?? 6,
        importConcurrency: importConc ?? 4,
      });
      await settingsQ.refetch();
      toast.success("Settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingSettings(false);
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
        <FrameHeader className="flex-row items-center justify-between gap-4">
          <div>
            <FrameTitle>General</FrameTitle>
            <FrameDescription>Server-wide preferences.</FrameDescription>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => void saveSettings()}
            disabled={savingSettings || !settingsQ.data}
          >
            {savingSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </FrameHeader>
        <FramePanel className="space-y-4">
          <div className="grid grid-cols-[1fr_auto] items-center gap-4">
            <div className="min-w-0">
              <Label>Max parallel AI channel builds</Label>
              <p className="text-muted-foreground text-xs">
                How many channels the AI lineup builder works on at once. Lower it (1–2) for slow local models
                that can&apos;t keep up with parallel runs. Default 6.
              </p>
            </div>
            <NumberField value={buildConc} onValueChange={setBuildConc} min={1} max={16} className="w-32 shrink-0">
              <NumberFieldGroup>
                <NumberFieldDecrement />
                <NumberFieldInput />
                <NumberFieldIncrement />
              </NumberFieldGroup>
            </NumberField>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-4">
            <div className="min-w-0">
              <Label>Max parallel channel imports</Label>
              <p className="text-muted-foreground text-xs">
                How many channels the lineup importer resolves at once. Less demanding than AI builds. Default 4.
              </p>
            </div>
            <NumberField value={importConc} onValueChange={setImportConc} min={1} max={16} className="w-32 shrink-0">
              <NumberFieldGroup>
                <NumberFieldDecrement />
                <NumberFieldInput />
                <NumberFieldIncrement />
              </NumberFieldGroup>
            </NumberField>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}
