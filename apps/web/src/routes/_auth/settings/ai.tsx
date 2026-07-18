import { Badge } from "@ChannelGuide/ui/components/badge";
import { Button } from "@ChannelGuide/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ChannelGuide/ui/components/card";
import { Input } from "@ChannelGuide/ui/components/input";
import { Label } from "@ChannelGuide/ui/components/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@ChannelGuide/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Pencil, Plug, Trash2, XCircle } from "lucide-react";
import { useState } from "react";

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

type Conn = { id: string; name: string; provider: string; model: string; baseUrl: string | null; hasKey: boolean; isActive: boolean };

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
  };

  const startEdit = (c: Conn) => {
    setEditingId(c.id);
    setName(c.name);
    setProvider(c.provider as Provider);
    setModel(c.model);
    setCustomModel(c.provider !== "compatible" && !MODELS[c.provider as Provider]?.includes(c.model));
    setBaseUrl(c.baseUrl ?? "");
    setApiKey("");
  };

  const onProviderChange = (p: Provider) => {
    setProvider(p);
    setCustomModel(false);
    setModel(MODELS[p]?.[0] ?? "");
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        name: name.trim() || `${PROVIDER_LABEL[provider]} · ${model}`,
        provider,
        model: model.trim(),
        baseUrl: provider === "compatible" ? baseUrl.trim() || null : null,
        apiKey: apiKey ? apiKey : undefined,
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
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Saved connections */}
      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {connections.length === 0 && <p className="text-muted-foreground text-sm">No connections yet — add one below.</p>}
          {connections.map((c) => {
            const t = test[c.id];
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-md border p-3">
                <Plug className="text-muted-foreground h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    {c.isActive && <Badge>Active</Badge>}
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
                  {!c.isActive && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => trpcClient.ai.setActive.mutate({ id: c.id }))}>
                      Set active
                    </Button>
                  )}
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
        </CardContent>
      </Card>

      {/* Add / edit form */}
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit connection" : "Add connection"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
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
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" />
            </div>
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
        </CardContent>
      </Card>
    </div>
  );
}
