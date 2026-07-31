import { Button } from "@ChannelGuide/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@ChannelGuide/ui/components/frame";
import { Switch } from "@ChannelGuide/ui/components/switch";
import type { AppRouter } from "@ChannelGuide/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { trpc, trpcClient } from "@/utils/trpc";

type AccessData = inferRouterOutputs<AppRouter>["users"]["getAccess"];

export const Route = createFileRoute("/_auth/users/$id/access")({
  component: UserAccessPage,
});

type Channel = { id: string; number: number; name: string; callsign: string | null };
type Group = { key: string; name: string; channels: Channel[]; ungrouped?: boolean };

function UserAccessPage() {
  const { id } = Route.useParams();
  const access = useQuery(trpc.users.getAccess.queryOptions({ id }));
  const data = access.data;

  if (access.isLoading || !data) {
    return (
      <Frame>
        <FramePanel className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading access…
        </FramePanel>
      </Frame>
    );
  }
  if (data.role === "admin") {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Access</FrameTitle>
          <FrameDescription>Admins always have full access to everything — nothing to configure.</FrameDescription>
        </FrameHeader>
      </Frame>
    );
  }
  return <Editor id={id} data={data} onSaved={() => void access.refetch()} />;
}

function Editor({ id, data, onSaved }: { id: string; data: AccessData; onSaved: () => void }) {
  const groups: Group[] = useMemo(() => {
    const g: Group[] = data.catalog.packages.map((p) => ({ key: p.id, name: p.name, channels: p.channels }));
    if (data.catalog.ungrouped.length)
      g.push({ key: "__ungrouped__", name: "Ungrouped", channels: data.catalog.ungrouped, ungrouped: true });
    return g;
  }, [data]);

  const allChannelIds = useMemo(() => {
    const s = new Set<string>();
    for (const grp of groups) for (const c of grp.channels) s.add(c.id);
    return s;
  }, [groups]);

  // Build the initial selected set from the stored grants: FULL packages → all their channels,
  // PARTIAL packages + ungrouped → the explicit channelIds. allAccess → everything (so toggling off
  // reveals an all-selected grid).
  const initial = useMemo(() => {
    if (data.allAccess) return new Set(allChannelIds);
    const s = new Set<string>(data.channelIds);
    const fullPkgIds = new Set(data.packages.filter((p) => p.mode === "FULL").map((p) => p.packageId));
    for (const p of data.catalog.packages) if (fullPkgIds.has(p.id)) for (const c of p.channels) s.add(c.id);
    return s;
  }, [data, allChannelIds]);

  const [allAccess, setAllAccess] = useState<boolean>(data.allAccess);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const [saving, setSaving] = useState(false);

  const dirty =
    allAccess !== data.allAccess ||
    (!allAccess && (selected.size !== initial.size || [...selected].some((x) => !initial.has(x))));

  const toggle = (cid: string) =>
    setSelected((prev) => {
      const x = new Set(prev);
      if (x.has(cid)) x.delete(cid);
      else x.add(cid);
      return x;
    });
  const allSel = (chs: Channel[]) => chs.length > 0 && chs.every((c) => selected.has(c.id));
  const someSel = (chs: Channel[]) => chs.some((c) => selected.has(c.id));
  const togglePkg = (chs: Channel[]) =>
    setSelected((prev) => {
      const x = new Set(prev);
      if (allSel(chs)) for (const c of chs) x.delete(c.id);
      else for (const c of chs) x.add(c.id);
      return x;
    });

  const resetToAll = () => {
    setAllAccess(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Derive the grant payload from the selected set: a package with ALL its channels selected → FULL
      // (includes future channels); some → PARTIAL + explicit channels; ungrouped → channel grants.
      const packages: { packageId: string; mode: "FULL" | "PARTIAL" }[] = [];
      const channelIds: string[] = [];
      if (!allAccess) {
        for (const p of data.catalog.packages) {
          const chIds = p.channels.map((c) => c.id);
          const sel = chIds.filter((cid) => selected.has(cid));
          if (sel.length === 0) continue;
          if (sel.length === chIds.length) packages.push({ packageId: p.id, mode: "FULL" });
          else {
            packages.push({ packageId: p.id, mode: "PARTIAL" });
            channelIds.push(...sel);
          }
        }
        for (const c of data.catalog.ungrouped) if (selected.has(c.id)) channelIds.push(c.id);
      }
      await trpcClient.users.setAccess.mutate({ id, allAccess, packages, channelIds });
      toast.success("Access saved.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save access.");
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = selected.size;

  return (
    <Frame>
      {/* Sticky action header. */}
      <FrameHeader className="bg-muted border-border sticky top-0 z-20 -mx-2 -mt-2 rounded-t-2xl border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <FrameTitle>Access</FrameTitle>
            <FrameDescription>
              {allAccess
                ? "This user can see every package and channel, including ones added later."
                : `Restricted — ${selectedCount} of ${allChannelIds.size} channels selected.`}
            </FrameDescription>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {!allAccess && (
              <Button variant="ghost" size="sm" onClick={resetToAll}>
                <RotateCcw className="mr-2 size-4" /> Reset to all access
              </Button>
            )}
            <Button size="sm" onClick={save} disabled={saving || !dirty}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              Save
            </Button>
          </div>
        </div>
      </FrameHeader>

      {/* Master switch. */}
      <FramePanel className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">All packages &amp; channels</p>
          <p className="text-muted-foreground text-sm">
            On, this user sees everything (including future content). Turn off to choose specific packages and
            channels.
          </p>
        </div>
        <Switch checked={allAccess} onCheckedChange={setAllAccess} aria-label="All access" />
      </FramePanel>

      {/* The grid — only when restricted. */}
      {!allAccess && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const full = allSel(g.channels) && !g.ungrouped;
            return (
              <FramePanel key={g.key} className="divide-border divide-y p-0">
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{g.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {g.channels.length} {g.channels.length === 1 ? "channel" : "channels"}
                      {someSel(g.channels)
                        ? g.ungrouped
                          ? ""
                          : full
                            ? " · full (incl. new)"
                            : " · limited"
                        : " · none"}
                    </p>
                  </div>
                  <Switch
                    checked={allSel(g.channels)}
                    onCheckedChange={() => togglePkg(g.channels)}
                    disabled={g.channels.length === 0}
                    aria-label={`Select all in ${g.name}`}
                  />
                </div>
                {g.channels.length === 0 ? (
                  <p className="text-muted-foreground p-4 text-sm">No channels.</p>
                ) : (
                  g.channels.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 p-3">
                      <Switch checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} aria-label={`Grant ${c.name}`} />
                      <p className="min-w-0 flex-1 truncate text-sm">
                        <span className="text-muted-foreground tabular-nums">{c.number}</span> {c.name}
                        {c.callsign ? <span className="text-muted-foreground"> · {c.callsign}</span> : null}
                      </p>
                    </div>
                  ))
                )}
              </FramePanel>
            );
          })}
        </div>
      )}
    </Frame>
  );
}
