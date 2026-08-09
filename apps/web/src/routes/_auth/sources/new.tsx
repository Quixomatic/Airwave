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
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@airwave/ui/components/select";
import { Switch } from "@airwave/ui/components/switch";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Tv } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/sources/new")({
  staticData: { breadcrumb: "New source" },
  component: NewSource,
});

type PlexServer = Awaited<ReturnType<typeof trpcClient.plex.listServers.query>>[number];
type PlexAuth = { clientId: string; token: string; email: string };

function NewSource() {
  const navigate = useNavigate();
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
      const result = await trpcClient.plex.saveConnection.mutate({
        clientId: auth.clientId,
        token: auth.token,
        name: server.name,
        machineIdentifier: server.clientIdentifier,
        baseUrl: `${ssl ? "https" : "http"}://${host}:${port}`,
        webAppUrl: webAppUrl.trim() || undefined,
      });
      toast.success("Plex server connected.");
      navigate({ to: "/sources/$sourceId", params: { sourceId: result.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save connection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Frame>
        <FrameHeader>
          <FrameTitle className="flex items-center gap-2">
            <Tv className="text-primary h-5 w-5" /> Add a Plex server
          </FrameTitle>
          <FrameDescription>
            Sign in with Plex, pick your server, and confirm the connection details.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="space-y-6">
          {!auth ? (
            <Button size="lg" onClick={signInWithPlex} disabled={connecting}>
              {connecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Tv className="mr-2 h-4 w-4" />
              )}
              Sign in with Plex
            </Button>
          ) : (
            <div className="space-y-5">
              <p className="text-muted-foreground text-sm">
                Signed in as <strong>{auth.email}</strong>
              </p>

              <div className="space-y-2">
                <Label htmlFor="server">Server</Label>
                <Select
                  value={machineId}
                  onValueChange={(v) => {
                    const s = servers.find((x) => x.clientIdentifier === v);
                    if (s) selectServer(s);
                  }}
                >
                  <SelectTrigger id="server" className="w-full">
                    <SelectValue>
                      {(v) =>
                        servers.find((x) => x.clientIdentifier === v)?.name ?? "No servers found"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {servers.map((s) => (
                      <SelectItem key={s.clientIdentifier} value={s.clientIdentifier}>
                        {s.name}
                        {s.owned ? "" : " (shared)"}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
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
                <Switch checked={ssl} onCheckedChange={(v) => setSsl(v === true)} />
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
                <Button
                  variant="ghost"
                  render={<Link to="/sources" />}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </FramePanel>
      </Frame>
    </div>
  );
}
