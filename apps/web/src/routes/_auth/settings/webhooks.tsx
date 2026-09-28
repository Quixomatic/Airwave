import { Badge } from "@airwave/ui/components/badge";
import { Button } from "@airwave/ui/components/button";
import { Card } from "@airwave/ui/components/card";
import { Checkbox } from "@airwave/ui/components/checkbox";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { Input } from "@airwave/ui/components/input";
import { Label } from "@airwave/ui/components/label";
import { Switch } from "@airwave/ui/components/switch";
import { Textarea } from "@airwave/ui/components/textarea";
import type { WebhookEventType } from "@airwave/api/services/webhooks";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Loader2, Pencil, Plus, RefreshCw, Send, Trash2, Webhook, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/webhooks")({
  staticData: { breadcrumb: "Webhooks" },
  component: WebhooksPage,
});

type WebhookRow = {
  id: string;
  url: string;
  eventTypes: string[];
  description: string | null;
  enabled: boolean;
  disabledAt: string | Date | null;
  disabledReason: string | null;
  createdAt: string | Date;
};

type FormState = { id: string | null; url: string; description: string; eventTypes: string[] };
const EMPTY_FORM: FormState = { id: null, url: "", description: "", eventTypes: [] };

function WebhooksPage() {
  const list = useQuery(trpc.webhooks.list.queryOptions());
  const catalog = useQuery(trpc.webhooks.eventTypes.queryOptions());
  const { confirm, dialog } = useConfirm();

  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [freshSecret, setFreshSecret] = useState<string | null>(null);

  const refresh = () => list.refetch();

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Couldn't copy — select and copy manually.");
    }
  };

  const save = async () => {
    if (!form) return;
    if (!form.url.trim()) return toast.error("Enter a delivery URL.");
    setBusy(true);
    try {
      if (form.id) {
        await trpcClient.webhooks.update.mutate({
          id: form.id,
          url: form.url.trim(),
          description: form.description.trim() || null,
          eventTypes: form.eventTypes as WebhookEventType[],
        });
        toast.success("Webhook updated.");
      } else {
        const res = await trpcClient.webhooks.create.mutate({
          url: form.url.trim(),
          description: form.description.trim() || undefined,
          eventTypes: form.eventTypes as WebhookEventType[],
        });
        setFreshSecret(res.secret);
        toast.success("Webhook created.");
      }
      setForm(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the webhook.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (w: WebhookRow) => {
    try {
      await trpcClient.webhooks.update.mutate({ id: w.id, enabled: !w.enabled });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the webhook.");
    }
  };

  const remove = async (w: WebhookRow) => {
    const ok = await confirm({
      title: "Delete this webhook?",
      description: `Airwave will stop delivering events to ${w.url}. This can't be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await trpcClient.webhooks.delete.mutate({ id: w.id });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the webhook.");
    }
  };

  const rotate = async (w: WebhookRow) => {
    const ok = await confirm({
      title: "Rotate the signing secret?",
      description: "The current secret stops signing immediately. Update the receiver with the new secret.",
      confirmLabel: "Rotate",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await trpcClient.webhooks.rotateSecret.mutate({ id: w.id });
      setFreshSecret(res.secret);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't rotate the secret.");
    }
  };

  const sendTest = async (w: WebhookRow) => {
    try {
      await trpcClient.webhooks.sendTest.mutate({ id: w.id });
      toast.success("Test event queued — check your endpoint (and the delivery log).");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send a test event.");
    }
  };

  const toggleEvent = (type: string) =>
    setForm((f) =>
      f ? { ...f, eventTypes: f.eventTypes.includes(type) ? f.eventTypes.filter((t) => t !== type) : [...f.eventTypes, type] } : f,
    );

  const rows = (list.data ?? []) as WebhookRow[];

  return (
    <Frame>
      {dialog}
      <FrameHeader className="flex-row items-center justify-between gap-4">
        <div>
          <FrameTitle>Webhooks</FrameTitle>
          <FrameDescription>
            Push Airwave events (someone started watching, tuned a channel, paused) to any HTTPS endpoint — Home
            Assistant, n8n, a script. Signed with the{" "}
            <a href="https://www.standardwebhooks.com/" target="_blank" rel="noreferrer" className="underline">
              Standard Webhooks
            </a>{" "}
            scheme so you can verify each delivery. Admin only.
          </FrameDescription>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setForm({ ...EMPTY_FORM })}>
          <Plus className="mr-2 h-4 w-4" /> New webhook
        </Button>
      </FrameHeader>

      <FramePanel className="space-y-4">
        {/* One-time secret reveal (create / rotate). */}
        {freshSecret && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Copy this signing secret now — it won't be shown again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="bg-background min-w-0 flex-1 truncate rounded border px-2 py-1.5 font-mono text-xs">
                {freshSecret}
              </code>
              <Button size="sm" variant="outline" onClick={() => void copy(freshSecret)}>
                <Copy className="mr-2 h-4 w-4" /> Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFreshSecret(null)}>
                <Check className="mr-2 h-4 w-4" /> Done
              </Button>
            </div>
          </div>
        )}

        {/* Create / edit form. */}
        {form && (
          <Card className="space-y-4 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{form.id ? "Edit webhook" : "New webhook"}</h3>
              <Button size="sm" variant="ghost" onClick={() => setForm(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-url">Delivery URL</Label>
              <Input
                id="wh-url"
                placeholder="https://example.com/airwave-hook"
                value={form.url}
                onChange={(e) => setForm((f) => (f ? { ...f, url: e.target.value } : f))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-desc">Description (optional)</Label>
              <Input
                id="wh-desc"
                placeholder="Living-room automation"
                value={form.description}
                onChange={(e) => setForm((f) => (f ? { ...f, description: e.target.value } : f))}
              />
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              <p className="text-muted-foreground text-xs">Leave all unchecked to receive every event.</p>
              <div className="space-y-3">
                {(catalog.data?.groups ?? []).map((g) => (
                  <div key={g.group}>
                    <p className="text-muted-foreground mb-1 text-xs font-medium">
                      {g.group}
                      {g.reserved ? <span className="text-amber-600 dark:text-amber-500"> · coming soon</span> : null}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {g.types.map((t) => (
                        <label
                          key={t}
                          className={`flex items-center gap-2 text-sm ${g.reserved ? "cursor-default opacity-50" : "cursor-pointer"}`}
                          title={g.reserved ? "Not emitted yet — coming when the player reports playback state." : undefined}
                        >
                          <Checkbox
                            checked={form.eventTypes.includes(t)}
                            onCheckedChange={() => toggleEvent(t)}
                            disabled={g.reserved}
                          />
                          <code className="text-xs">{t}</code>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setForm(null)} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {form.id ? "Save changes" : "Create webhook"}
              </Button>
            </div>
          </Card>
        )}

        {/* List. */}
        {list.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        ) : rows.length === 0 && !form ? (
          <EmptyState
            icon={Webhook}
            title="No webhooks yet"
            description="Add an endpoint to get pushed a signed event when someone watches, tunes, pauses, or stops."
            action={
              <Button size="sm" onClick={() => setForm({ ...EMPTY_FORM })}>
                <Plus className="mr-2 h-4 w-4" /> New webhook
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {rows.map((w) => (
              <Card key={w.id} className="p-4">
                <div className="flex items-start gap-3">
                  <Webhook className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm">{w.url}</p>
                    {w.description ? <p className="text-muted-foreground text-xs">{w.description}</p> : null}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {w.eventTypes.length === 0 ? (
                        <Badge variant="secondary" className="text-xs">all events</Badge>
                      ) : (
                        w.eventTypes.map((t) => (
                          <Badge key={t} variant="secondary" className="font-mono text-[10px]">
                            {t}
                          </Badge>
                        ))
                      )}
                    </div>
                    {!w.enabled && w.disabledReason ? (
                      <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">{w.disabledReason}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Switch checked={w.enabled} onCheckedChange={() => void toggle(w)} aria-label="Enabled" />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void sendTest(w)}>
                    <Send className="mr-2 h-4 w-4" /> Send test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm({ id: w.id, url: w.url, description: w.description ?? "", eventTypes: w.eventTypes })
                    }
                  >
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void rotate(w)}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Rotate secret
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void remove(w)}
                    className="text-red-600 hover:text-red-600 dark:text-red-500"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                </div>
                <DeliveryLog webhookId={w.id} />
              </Card>
            ))}
          </div>
        )}
      </FramePanel>
    </Frame>
  );
}

type DeliveryRow = {
  id: string;
  eventType: string;
  status: string;
  attempt: number;
  responseCode: number | null;
  error: string | null;
  createdAt: string | Date;
};

/** Expandable per-webhook delivery log (queried on demand). */
function DeliveryLog({ webhookId }: { webhookId: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({ ...trpc.webhooks.deliveries.queryOptions({ id: webhookId, limit: 10 }), enabled: open });
  const deliveries = (q.data?.deliveries ?? []) as DeliveryRow[];

  const dot = (s: string) =>
    s === "delivered" ? "bg-emerald-500" : s === "failed" ? "bg-red-500" : "bg-amber-500";

  return (
    <details className="mt-3 text-sm" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="text-muted-foreground cursor-pointer select-none text-xs">Recent deliveries</summary>
      {q.isLoading ? (
        <div className="py-3">
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        </div>
      ) : deliveries.length === 0 ? (
        <p className="text-muted-foreground py-3 text-xs">No deliveries yet.</p>
      ) : (
        <div className="mt-2 space-y-1">
          {deliveries.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-xs">
              <span className={`size-2 shrink-0 rounded-full ${dot(d.status)}`} />
              <code className="font-mono">{d.eventType}</code>
              <span className="text-muted-foreground">
                {d.status}
                {d.responseCode ? ` · ${d.responseCode}` : ""}
                {d.attempt > 1 ? ` · attempt ${d.attempt}` : ""}
                {d.error ? ` · ${d.error}` : ""}
              </span>
              <span className="text-muted-foreground ml-auto">{new Date(d.createdAt).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
