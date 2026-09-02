import { Badge } from "@airwave/ui/components/badge";
import { Button } from "@airwave/ui/components/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@airwave/ui/components/frame";
import { Input } from "@airwave/ui/components/input";
import { Label } from "@airwave/ui/components/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@airwave/ui/components/select";
import { Switch } from "@airwave/ui/components/switch";
import { Textarea } from "@airwave/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Pencil, Plug, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/ai")({
  staticData: { breadcrumb: "AI Assistant" },
  component: SettingsAi,
});

type Provider = "anthropic" | "openai" | "google" | "compatible";

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google (Gemini)" },
  { value: "compatible", label: "OpenAI-compatible / Local" },
];
const PROVIDER_LABEL = Object.fromEntries(PROVIDERS.map((p) => [p.value, p.label]));

const MODELS: Record<Provider, string[]> = {
  anthropic: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5-20251001"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3-mini"],
  google: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro"],
  compatible: [],
};
const CUSTOM = "__custom__";

type Conn = {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string | null;
  hasKey: boolean;
  isActive: boolean;
  isPlanner: boolean;
  isWorker: boolean;
  disableThinking: boolean;
  extraBody: unknown;
};

/**
 * What each connection can be used for. Roles are independent, so one connection can hold all
 * three — which is what happens automatically when only one is configured. The split only
 * matters once there's a second: pointing the high-volume `worker` at a cheap model is the
 * biggest cost lever in an AI lineup build (~50 loops vs the planner's single call).
 */
type RoleKey = "active" | "planner" | "worker";

/** The compact badge labels shown on each connection card. */
const ROLES = [
  { key: "active" as const, label: "Chat", hint: "The admin assistant" },
  { key: "planner" as const, label: "Planner", hint: "Heavy reasoning — designs the lineup" },
  { key: "worker" as const, label: "Worker", hint: "High volume — builds each channel" },
];

/**
 * The three role dropdowns. Roles are EXPLICIT: `active` (chat) is a connection or None; planner/
 * worker are a connection, "Same as chat" (copies chat's current connection onto the flag), or None
 * (off). A cleared planner/worker genuinely disables the AI lineup.
 */
const ROLE_SELECTS: { key: RoleKey; label: string; hint: string }[] = [
  { key: "active", label: "Chat connection", hint: "The admin assistant. Set to None to turn it off." },
  { key: "planner", label: "AI lineup — planner", hint: "One heavy call that designs the whole lineup. Quality matters most." },
  { key: "worker", label: "AI lineup — worker", hint: "Builds every channel (dozens of loops) — the single biggest cost lever, so point it at a cheaper model." },
];

/** Select sentinels: NONE = the role is off; SAME (planner/worker) = copy the chat connection onto the flag. */
const NONE = "__none__";
const SAME = "__same__";

const holdsRole = (c: Conn, role: RoleKey) =>
  role === "active" ? c.isActive : role === "planner" ? c.isPlanner : c.isWorker;

function SettingsAi() {
  const list = useQuery(trpc.ai.list.queryOptions());
  const connections = (list.data ?? []) as Conn[];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [model, setModel] = useState("claude-sonnet-5");
  const [customModel, setCustomModel] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  // LOCAL (`compatible`) only — disable the model's thinking + an advanced extra-body JSON escape hatch.
  const [disableThinking, setDisableThinking] = useState(false);
  const [extraBodyText, setExtraBodyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<Record<string, { ok: boolean; sample?: string; error?: string } | "loading">>({});

  const curated = MODELS[provider] ?? [];
  const usesCustom = provider === "compatible" || customModel;

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setProvider("anthropic");
    setModel("claude-sonnet-5");
    setCustomModel(false);
    setBaseUrl("");
    setApiKey("");
    setDisableThinking(false);
    setExtraBodyText("");
  };

  const startEdit = (c: Conn) => {
    setEditingId(c.id);
    setName(c.name);
    setProvider(c.provider as Provider);
    setModel(c.model);
    setCustomModel(c.provider !== "compatible" && !MODELS[c.provider as Provider]?.includes(c.model));
    setBaseUrl(c.baseUrl ?? "");
    setApiKey("");
    setDisableThinking(c.disableThinking);
    setExtraBodyText(c.extraBody ? JSON.stringify(c.extraBody, null, 2) : "");
  };

  const onProviderChange = (p: Provider) => {
    setProvider(p);
    setCustomModel(false);
    setModel(MODELS[p]?.[0] ?? "");
  };

  const save = async () => {
    const isCompat = provider === "compatible";
    // Parse the advanced extra-body JSON (compatible only). Empty → clear (null); invalid → stop.
    let extraBody: Record<string, unknown> | null | undefined;
    if (isCompat) {
      const raw = extraBodyText.trim();
      if (!raw) extraBody = null;
      else {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
          extraBody = parsed as Record<string, unknown>;
        } catch {
          toast.error("Extra request body must be a valid JSON object.");
          return;
        }
      }
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim() || `${PROVIDER_LABEL[provider]} · ${model}`,
        provider,
        model: model.trim(),
        baseUrl: isCompat ? baseUrl.trim() || null : null,
        apiKey: apiKey ? apiKey : undefined,
        disableThinking: isCompat ? disableThinking : false,
        ...(isCompat ? { extraBody } : {}),
      };
      if (editingId) await trpcClient.ai.update.mutate({ id: editingId, ...payload });
      else await trpcClient.ai.create.mutate(payload);
      resetForm();
      await list.refetch();
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await list.refetch();
    } finally {
      setBusy(false);
    }
  };

  /** The connection id holding a role, or undefined. */
  const roleHolderId = (role: RoleKey) => connections.find((c) => holdsRole(c, role))?.id;
  const activeId = connections.find((c) => c.isActive)?.id;

  const applyRole = (id: string, role: RoleKey, enabled: boolean) =>
    void act(() => trpcClient.ai.setRole.mutate({ id, role, enabled }));

  /** Apply a role dropdown choice: NONE clears the flag; SAME copies the chat connection onto the
   *  planner/worker flag; an id assigns that specific connection. */
  const onRoleChange = (role: RoleKey, value: string) => {
    if (value === NONE) {
      const holder = roleHolderId(role);
      if (holder) applyRole(holder, role, false);
      return;
    }
    if (value === SAME) {
      if (activeId) applyRole(activeId, role, true);
      else {
        const holder = roleHolderId(role);
        if (holder) applyRole(holder, role, false);
      }
      return;
    }
    applyRole(value, role, true);
  };

  const runTest = async (id: string) => {
    setTest((t) => ({ ...t, [id]: "loading" }));
    try {
      const result = await trpcClient.ai.test.mutate({ id });
      setTest((t) => ({ ...t, [id]: result }));
    } catch (e) {
      setTest((t) => ({ ...t, [id]: { ok: false, error: e instanceof Error ? e.message : "Test failed" } }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Saved connections */}
      <Frame>
        <FrameHeader>
          <FrameTitle>Connections</FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-2">
          {list.data && connections.length === 0 && (
            <EmptyState
              icon={Plug}
              title="No connections yet"
              description="Add a provider connection below to power the AI assistant and the AI lineup builder."
            />
          )}
          {connections.map((c) => {
            const t = test[c.id];
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-md border p-3">
                <Plug className="text-muted-foreground h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    {ROLES.filter((r) => holdsRole(c, r.key)).map((r) => (
                      <Badge key={r.key} title={r.hint}>
                        {r.label}
                      </Badge>
                    ))}
                    {!c.hasKey && c.provider !== "compatible" && <Badge variant="outline">No key</Badge>}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {PROVIDER_LABEL[c.provider] ?? c.provider} · {c.model}
                    {c.baseUrl ? ` · ${c.baseUrl}` : ""}
                  </div>
                  {t && t !== "loading" && (
                    <div className={`mt-1 flex items-center gap-1 text-xs ${t.ok ? "text-emerald-600" : "text-red-600"}`}>
                      {t.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {t.ok ? `Replied "${t.sample}"` : t.error}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {/* Role assignment moved to its own section below — the per-card buttons were
                      confusing (three of them, each toggling a role, on every card). The badges
                      above still show what each connection is used for. */}
                  <Button size="icon" variant="ghost" aria-label="Test" disabled={t === "loading"} onClick={() => void runTest(c.id)}>
                    {t === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => startEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Delete" disabled={busy} onClick={() => void act(() => trpcClient.ai.delete.mutate({ id: c.id }))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </FramePanel>
      </Frame>

      {/* Role assignments — a dropdown per use, instead of toggle buttons on every card. */}
      {connections.length > 0 && (
        <Frame>
          <FrameHeader>
            <FrameTitle>How connections are used</FrameTitle>
          </FrameHeader>
          <FramePanel className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Point each job at a connection. A single connection covers all three automatically; the
              split only matters once you add a second (e.g. a cheap model for the high-volume worker).
            </p>
            {ROLE_SELECTS.map((r) => {
              const value = roleHolderId(r.key) ?? NONE;
              return (
                <div key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-4">
                  <div className="min-w-0">
                    <Label>{r.label}</Label>
                    <p className="text-muted-foreground text-xs">{r.hint}</p>
                  </div>
                  <Select value={value} onValueChange={(v) => onRoleChange(r.key, v as string)}>
                    <SelectTrigger className="w-64" disabled={busy}>
                      <SelectValue>
                        {(v) =>
                          v === NONE || !v
                            ? "None"
                            : (connections.find((c) => c.id === v)?.name ?? "Select…")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                      {r.key !== "active" && <SelectItem value={SAME}>Same as chat</SelectItem>}
                      {connections.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={NONE}>None</SelectItem>
                    </SelectPopup>
                  </Select>
                </div>
              );
            })}
          </FramePanel>
        </Frame>
      )}

      {/* Add / edit form */}
      <Frame>
        <FrameHeader>
          <FrameTitle>{editingId ? "Edit connection" : "Add connection"}</FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-5">
          <p className="text-muted-foreground text-sm">
            Your API key is encrypted at rest. Local models work via any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM) — only
            models trained for tool-calling will drive the agent well.
          </p>

          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Claude Sonnet" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => onProviderChange(v as Provider)}>
                <SelectTrigger>
                  <SelectValue>{(v) => PROVIDER_LABEL[v as string] ?? "Select…"}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              {usesCustom ? (
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={provider === "compatible" ? "llama3.1" : "model id"} />
              ) : (
                <Select
                  value={curated.includes(model) ? model : CUSTOM}
                  onValueChange={(v) => {
                    if (v === CUSTOM) {
                      setCustomModel(true);
                      setModel("");
                    } else setModel(v as string);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue>{(v) => (v === CUSTOM ? "Custom…" : (v as string)) || "Select…"}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {curated.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM}>Custom…</SelectItem>
                  </SelectPopup>
                </Select>
              )}
            </div>
          </div>

          {provider === "compatible" && (
            <>
              <div className="space-y-2">
                <Label>Base URL</Label>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label>Disable thinking</Label>
                  <p className="text-muted-foreground text-xs">
                    Turn off the model's reasoning/thinking mode. Reasoning models otherwise time out the lineup
                    planner. Sends the no-think flag for Ollama, vLLM/SGLang, and OpenRouter.
                  </p>
                </div>
                <Switch checked={disableThinking} onCheckedChange={(v) => setDisableThinking(v === true)} />
              </div>

              <div className="space-y-2">
                <Label>Extra request body (JSON) — advanced</Label>
                <Textarea
                  value={extraBodyText}
                  onChange={(e) => setExtraBodyText(e.target.value)}
                  rows={3}
                  className="font-mono text-xs"
                  placeholder={'{ "chat_template_kwargs": { "do_reasoning": false } }'}
                />
                <p className="text-muted-foreground text-xs">
                  Optional. Merged into every request body — an escape hatch for engine-specific params the
                  toggle above doesn't cover. Leave blank unless you know you need it.
                </p>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>API key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={editingId ? "•••••••• (leave blank to keep current)" : provider === "compatible" ? "(optional for local)" : "sk-…"}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={busy || !model.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "Save changes" : "Add connection"}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}
