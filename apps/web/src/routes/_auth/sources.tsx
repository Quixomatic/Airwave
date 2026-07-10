import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ChannelGuide/ui/components/card";
import { Button } from "@ChannelGuide/ui/components/button";
import { Input } from "@ChannelGuide/ui/components/input";
import { Label } from "@ChannelGuide/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Tv } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/sources")({
  component: SourcesPage,
});

type PlexServer = Awaited<ReturnType<typeof trpcClient.plex.listServers.query>>[number];
type PlexAuth = { clientId: string; token: string; email: string };

function SourcesPage() {
  const currentSource = useQuery(trpc.plex.currentSource.queryOptions());

  const [connecting, setConnecting] = useState(false);
  const [auth, setAuth] = useState<PlexAuth | null>(null);
  const [servers, setServers] = useState<PlexServer[]>([]);
  const [machineId, setMachineId] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("32400");
  const [ssl, setSsl] = useState(false);
  const [webAppUrl, setWebAppUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const selectServer = (server: PlexServer) => {
    setMachineId(server.clientIdentifier);
    const conn =
      server.connections.find((c) => c.local && !c.relay) ??
      server.connections.find((c) => !c.relay) ??
      server.connections[0];
    if (conn) {
      setHost(conn.address);
      setPort(String(conn.port));
      // Default SSL OFF (Overseerr behavior). Plex reports local connections as
      // https via *.plex.direct certs, but a raw-IP LAN connection is plain http.
      setSsl(false);
    }
  };

  const loadServers = async (clientId: string, token: string) => {
    const list = await trpcClient.plex.listServers.query({ clientId, token });
    setServers(list);
    if (list[0]) selectServer(list[0]);
  };

  const signInWithPlex = async () => {
    setConnecting(true);
    try {
      const pin = await trpcClient.plex.createAuthPin.mutate();
      const popup = window.open(pin.authUrl, "plex-auth", "width=600,height=720");
      const deadline = Date.now() + 2 * 60 * 1000;

      const poll = async () => {
        if (Date.now() > deadline) {
          popup?.close();
          setConnecting(false);
          toast.error("Plex sign-in timed out. Try again.");
          return;
        }
        try {
          const res = await trpcClient.plex.checkAuthPin.query({
            pinId: pin.pinId,
            clientId: pin.clientId,
          });
          if (res.authorized) {
            popup?.close();
            setAuth({ clientId: pin.clientId, token: res.token, email: res.user.email });
            await loadServers(pin.clientId, res.token);
            setConnecting(false);
            return;
          }
        } catch {
          // transient poll error — keep trying until the deadline
        }
        window.setTimeout(poll, 2000);
      };
      window.setTimeout(poll, 2000);
    } catch (err) {
      setConnecting(false);
      toast.error(err instanceof Error ? err.message : "Plex sign-in failed");
    }
  };

  const save = async () => {
    if (!auth) return;
    const server = servers.find((s) => s.clientIdentifier === machineId);
    if (!server) {
      toast.error("Choose a server first.");
      return;
    }
    setSaving(true);
    try {
      await trpcClient.plex.saveConnection.mutate({
        clientId: auth.clientId,
        token: auth.token,
        name: server.name,
        machineIdentifier: server.clientIdentifier,
        baseUrl: `${ssl ? "https" : "http"}://${host}:${port}`,
        webAppUrl: webAppUrl.trim() || undefined,
      });
      toast.success("Plex server connected.");
      setAuth(null);
      setServers([]);
      await currentSource.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save connection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Connect the Plex Media Server that ChannelGuide builds channels from and serves content to.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tv className="text-primary h-5 w-5" /> Plex
          </CardTitle>
          <CardDescription>
            Sign in with Plex, pick your server, and confirm the connection details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {currentSource.data && !auth && (
            <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>
                Connected to <strong>{currentSource.data.name}</strong> ({currentSource.data.baseUrl})
              </span>
            </div>
          )}

          {!auth ? (
            <Button size="lg" onClick={signInWithPlex} disabled={connecting}>
              {connecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Tv className="mr-2 h-4 w-4" />
              )}
              {currentSource.data ? "Reconnect / change server" : "Sign in with Plex"}
            </Button>
          ) : (
            <div className="space-y-5">
              <p className="text-muted-foreground text-sm">
                Signed in as <strong>{auth.email}</strong>
              </p>

              <div className="space-y-2">
                <Label htmlFor="server">Server</Label>
                <select
                  id="server"
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                  value={machineId}
                  onChange={(e) => {
                    const s = servers.find((x) => x.clientIdentifier === e.target.value);
                    if (s) selectServer(s);
                  }}
                >
                  {servers.length === 0 && <option value="">No servers found</option>}
                  {servers.map((s) => (
                    <option key={s.clientIdentifier} value={s.clientIdentifier}>
                      {s.name}
                      {s.owned ? "" : " (shared)"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div className="space-y-2">
                  <Label htmlFor="host">Hostname or IP address</Label>
                  <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    className="w-24"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={ssl} onChange={(e) => setSsl(e.target.checked)} />
                Use SSL
              </label>

              <div className="space-y-2">
                <Label htmlFor="webapp">Web App URL (optional)</Label>
                <Input
                  id="webapp"
                  placeholder="https://…"
                  value={webAppUrl}
                  onChange={(e) => setWebAppUrl(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={save} disabled={saving || !host}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save connection
                </Button>
                <Button variant="ghost" onClick={() => setAuth(null)} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
