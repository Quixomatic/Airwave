import { Button } from "@airwave/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth/settings/api-keys")({
  staticData: { breadcrumb: "API Keys" },
  component: ApiKeysPage,
});

const KEY_NAME = "Airwave API key";

type ApiKeyRow = {
  id: string;
  name?: string | null;
  start?: string | null;
  prefix?: string | null;
  createdAt: string | Date;
  lastRequest?: string | Date | null;
};

function ApiKeysPage() {
  const keys = useQuery({
    queryKey: ["apiKeys"],
    queryFn: async (): Promise<ApiKeyRow[]> => {
      const res = await authClient.apiKey.list();
      if (res.error) throw new Error(res.error.message ?? "Failed to load API keys.");
      const data = res.data as unknown;
      return (Array.isArray(data) ? data : ((data as { apiKeys?: ApiKeyRow[] })?.apiKeys ?? [])) as ApiKeyRow[];
    },
  });
  const key = keys.data?.[0] ?? null;
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  // The raw key, shown ONCE right after (re)generation. Cleared on dismiss.
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const generate = async (regenerate: boolean) => {
    if (regenerate) {
      const ok = await confirm({
        title: "Regenerate the API key?",
        description: "The current key stops working immediately. Anything using it (like an MCP client) must be updated with the new key.",
        confirmLabel: "Regenerate",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (key) await authClient.apiKey.delete({ keyId: key.id });
      const res = await authClient.apiKey.create({ name: KEY_NAME, prefix: "airwave_" });
      if (res.error || !res.data?.key) throw new Error(res.error?.message ?? "Failed to create the key.");
      setFreshKey(res.data.key);
      await keys.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the API key.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!key) return;
    const ok = await confirm({
      title: "Revoke the API key?",
      description: "Anything using it will immediately lose access.",
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await authClient.apiKey.delete({ keyId: key.id });
      setFreshKey(null);
      await keys.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't revoke the API key.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Couldn't copy — select and copy manually.");
    }
  };

  return (
    <Frame>
      {dialog}
      <FrameHeader>
        <FrameTitle>API Keys</FrameTitle>
        <FrameDescription>
          A single admin API key for machine access — used by the Airwave MCP server (and other integrations
          later). Sent as an <code className="text-xs">x-api-key</code> header. Admin only.
        </FrameDescription>
      </FrameHeader>

      <FramePanel className="space-y-4">
        {/* The one-time reveal after (re)generation. */}
        {freshKey && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Copy your key now — it won't be shown again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="bg-background min-w-0 flex-1 truncate rounded border px-2 py-1.5 font-mono text-xs">
                {freshKey}
              </code>
              <Button size="sm" variant="outline" onClick={() => void copy(freshKey)}>
                <Copy className="mr-2 h-4 w-4" /> Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFreshKey(null)}>
                <Check className="mr-2 h-4 w-4" /> Done
              </Button>
            </div>
          </div>
        )}

        {keys.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        ) : key ? (
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <KeyRound className="text-muted-foreground size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm">
                {(key.prefix ?? "") + (key.start ?? "")}
                <span className="text-muted-foreground">••••••••</span>
              </p>
              <p className="text-muted-foreground text-xs">
                Created {new Date(key.createdAt).toLocaleDateString()}
                {key.lastRequest ? ` · last used ${new Date(key.lastRequest).toLocaleDateString()}` : " · never used"}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void generate(true)} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Regenerate
            </Button>
            <Button size="sm" variant="outline" onClick={() => void revoke()} disabled={busy} className="text-red-600 hover:text-red-600 dark:text-red-500">
              <Trash2 className="mr-2 h-4 w-4" /> Revoke
            </Button>
          </div>
        ) : (
          <EmptyState
            icon={KeyRound}
            title="No API key yet"
            description="Generate a key to connect the Airwave MCP server or other machine clients."
            action={
              <Button size="sm" onClick={() => void generate(false)} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Generate API key
              </Button>
            }
          />
        )}

        {/* MCP client config helper. */}
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer select-none">Using it with the MCP server</summary>
          <p className="text-muted-foreground mt-2 text-xs">
            Point any MCP client at the <code>apps/mcp</code> server with these env vars:
          </p>
          <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-3 text-xs">
{`{
  "mcpServers": {
    "airwave": {
      "command": "bun",
      "args": ["run", "/path/to/airwave/apps/mcp/dist/index.js"],
      "env": {
        "AIRWAVE_URL": "${typeof window !== "undefined" ? window.location.origin : "https://your-airwave"}",
        "AIRWAVE_API_KEY": "airwave_…"
      }
    }
  }
}`}
          </pre>
        </details>
      </FramePanel>
    </Frame>
  );
}
