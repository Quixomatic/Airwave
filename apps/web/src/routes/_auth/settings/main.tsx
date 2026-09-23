import { Badge } from "@airwave/ui/components/badge";
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
import { Switch } from "@airwave/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
import { useConfirm } from "@/components/confirm-dialog";
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
  const [plannerTokens, setPlannerTokens] = useState<number | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  useEffect(() => {
    if (settingsQ.data) {
      setBuildConc(settingsQ.data.channelBuildConcurrency);
      setImportConc(settingsQ.data.importConcurrency);
      setPlannerTokens(settingsQ.data.plannerMaxOutputTokens);
    }
  }, [settingsQ.data]);
  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await trpcClient.settings.update.mutate({
        channelBuildConcurrency: buildConc ?? 6,
        importConcurrency: importConc ?? 4,
        plannerMaxOutputTokens: plannerTokens ?? 32000,
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
            <NumberField value={buildConc} onValueChange={setBuildConc} min={1} max={16} className="w-44 shrink-0">
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
            <NumberField value={importConc} onValueChange={setImportConc} min={1} max={16} className="w-44 shrink-0">
              <NumberFieldGroup>
                <NumberFieldDecrement />
                <NumberFieldInput />
                <NumberFieldIncrement />
              </NumberFieldGroup>
            </NumberField>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-4">
            <div className="min-w-0">
              <Label>Planner max output tokens</Label>
              <p className="text-muted-foreground text-xs">
                Token budget for the AI lineup planner&apos;s single design call. Raise it for very large
                libraries or verbose models if plans come back truncated; too high risks the planner timeout.
                Default 32000.
              </p>
            </div>
            <NumberField
              value={plannerTokens}
              onValueChange={setPlannerTokens}
              min={4000}
              max={128000}
              step={1000}
              className="w-44 shrink-0"
            >
              <NumberFieldGroup>
                <NumberFieldDecrement />
                <NumberFieldInput />
                <NumberFieldIncrement />
              </NumberFieldGroup>
            </NumberField>
          </div>
        </FramePanel>
      </Frame>

      <RemoteAccessFrame />
    </div>
  );
}

/**
 * Cloud Service (Remote Access to Airwave Cloud). A toggle connects this server to the user's Airwave Cloud
 * account; a "Generate binding code" button opens a dialog with the rotating 6-digit code to enter in the
 * cloud portal. The code is computed + rotated server-side; the UI only displays it and polls for the bind.
 */
function RemoteAccessFrame() {
  const ra = useQuery({
    ...trpc.remoteAccess.get.queryOptions(),
    // Poll fast while pending (catch the bind + keep the code fresh); slow while bound (pick up a subdomain
    // changed in the portal); not at all when off.
    refetchInterval: (q) => {
      const s = q.state.data;
      if (!s?.enabled) return false;
      return s.status === "pending" ? 1000 : s.status === "bound" ? 30_000 : false;
    },
  });
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const d = ra.data;
  const on = !!d?.enabled;
  const paired = !!d && d.status !== "disconnected";

  const forget = async () => {
    const ok = await confirm({
      title: "Forget this server?",
      description:
        "Unpairs this server from Airwave Cloud and removes it from your account. You'll need to pair again to use remote access.",
      confirmLabel: "Forget",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await trpcClient.remoteAccess.unpair.mutate();
      await ra.refetch();
      setCodeOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unpair failed.");
    } finally {
      setBusy(false);
    }
  };

  const setEnabled = async (enable: boolean) => {
    setBusy(true);
    try {
      if (enable) await trpcClient.remoteAccess.enable.mutate();
      else await trpcClient.remoteAccess.disable.mutate();
      await ra.refetch();
      if (!enable) setCodeOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cloud Service change failed.");
    } finally {
      setBusy(false);
    }
  };

  // Close the code dialog automatically once the server is bound.
  useEffect(() => {
    if (d?.status === "bound") setCodeOpen(false);
  }, [d?.status]);

  return (
    <Frame>
      <FrameHeader>
        <FrameTitle>Cloud Service</FrameTitle>
        <FrameDescription>
          Reach this server from anywhere through Airwave Cloud — no port-forwarding or reverse proxy.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label>Enable Cloud Service</Label>
            <p className="text-muted-foreground text-xs">
              Connects this server to your Airwave Cloud account at airwave.software.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {busy && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
            <Switch checked={on} onCheckedChange={(v) => void setEnabled(v)} disabled={busy || ra.isLoading} />
          </div>
        </div>

        {on && d?.status === "pending" && (
          <div className="flex items-center justify-between gap-4 border-t pt-4">
            <div className="min-w-0">
              <Label>Binding code</Label>
              <p className="text-muted-foreground text-xs">
                Generate a rotating code to enter in the Airwave Cloud portal to connect this server.
              </p>
            </div>
            <Button size="sm" className="shrink-0" onClick={() => setCodeOpen(true)}>
              Generate binding code
            </Button>
          </div>
        )}

        {on && d?.status === "bound" && (
          <div className="flex items-center gap-3 border-t pt-4">
            <Badge>Connected</Badge>
            {d.address && (
              <a href={`https://${d.address}`} target="_blank" rel="noreferrer" className="font-mono text-sm underline">
                {d.address}
              </a>
            )}
          </div>
        )}

        {!on && paired && (
          <p className="text-muted-foreground border-t pt-4 text-sm">
            Off — pairing kept{d?.address ? ` (${d.address})` : ""}. Turn on to reconnect.
          </p>
        )}

        {paired && (
          <div className="flex items-center justify-between gap-4 border-t pt-4">
            <div className="min-w-0">
              <Label>Forget this server</Label>
              <p className="text-muted-foreground text-xs">
                Unpair from Airwave Cloud and remove it from your account. Pair again to reconnect.
              </p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => void forget()} disabled={busy}>
              Forget this server
            </Button>
          </div>
        )}
      </FramePanel>

      <Modal open={codeOpen} onClose={() => setCodeOpen(false)}>
        <h2 className="text-lg font-semibold">Binding code</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          In Airwave Cloud → <span className="font-medium">Add instance</span>, enter this code. It rotates
          every 30 seconds.
        </p>
        <div className="my-6 flex flex-col items-center gap-2">
          <span className="font-mono text-4xl font-semibold tracking-[0.3em] tabular-nums">
            {d?.code ? `${d.code.slice(0, 3)} ${d.code.slice(3)}` : "— — —"}
          </span>
          {d?.secondsRemaining != null && (
            <span className="text-muted-foreground text-xs">changes in {d.secondsRemaining}s</span>
          )}
        </div>
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <Loader2 className="size-3.5 animate-spin" /> Waiting for you to connect it in Airwave Cloud…
        </p>
        <div className="mt-6 flex justify-end">
          <Button variant="ghost" onClick={() => setCodeOpen(false)}>
            Close
          </Button>
        </div>
      </Modal>
      {dialog}
    </Frame>
  );
}
