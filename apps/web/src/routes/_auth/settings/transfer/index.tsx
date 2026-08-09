import { Button } from "@airwave/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { setStagedImport } from "@/features/transfer/staging";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/transfer/")({
  staticData: { breadcrumb: "Import / Export" },
  component: SettingsTransfer,
});

const SELECT = "border-input bg-background h-9 rounded-md border px-2 text-sm";

function SettingsTransfer() {
  const navigate = useNavigate();

  // ── Export ────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await trpcClient.transfer.export.query();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `airwave-lineup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.packages.length} packages · ${data.channels.length} channels.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // ── Import (upload → preview → staging page) ───────────────
  const sources = useQuery(trpc.sources.list.queryOptions());
  const ready = (sources.data ?? []).filter((s) => s.ready);
  const [targetId, setTargetId] = useState<string | null>(null);
  useEffect(() => {
    if (!targetId && ready[0]) setTargetId(ready[0].id);
  }, [ready, targetId]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [previewing, setPreviewing] = useState(false);

  const onFile = async (file: File) => {
    const tsid = targetId ?? ready[0]?.id;
    const tname = ready.find((s) => s.id === tsid)?.name ?? "";
    if (!tsid) {
      toast.error("Connect and sync a media source before importing.");
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast.error("That file isn't valid JSON.");
      return;
    }
    setPreviewing(true);
    try {
      const preview = await trpcClient.transfer.importPreview.mutate({ data: data as never, targetSourceId: tsid });
      setStagedImport({ data, targetSourceId: tsid, targetName: tname, fileName: file.name, preview });
      void navigate({ to: "/settings/transfer/import-preview" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that lineup file.");
    } finally {
      setPreviewing(false);
      if (fileRef.current) fileRef.current.value = ""; // let the same file be re-picked
    }
  };

  return (
    <div className="space-y-4">
      <Frame>
        <FrameHeader>
          <FrameTitle>Export lineup</FrameTitle>
          <FrameDescription>
            Download every package and channel — with their filters — as a single portable JSON file. Drop it
            into another Airwave instance to recreate the same lineup. The export excludes anything
            instance-specific (the media-server connection, schedules, and cached metadata are rebuilt on
            import).
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <Button onClick={handleExport} disabled={exporting}>
            <Download className="mr-2 size-4" />
            {exporting ? "Preparing…" : "Download lineup (.json)"}
          </Button>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Import lineup</FrameTitle>
          <FrameDescription>
            Upload a lineup file exported from another Airwave instance. You'll get a staging screen to pick
            which packages and channels to import before anything runs. Requires a connected + synced source.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-wrap items-center gap-3">
          {ready.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Connect and run a metadata sync on a media source first — imports build against it.
            </p>
          ) : (
            <>
              {ready.length > 1 && (
                <label className="text-muted-foreground flex items-center gap-2 text-sm">
                  Into
                  <select className={SELECT} value={targetId ?? ""} onChange={(e) => setTargetId(e.target.value)}>
                    {ready.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={previewing}>
                <Upload className="mr-2 size-4" />
                {previewing ? "Reading…" : "Choose lineup file…"}
              </Button>
              {ready.length === 1 && <span className="text-muted-foreground text-sm">into {ready[0]!.name}</span>}
            </>
          )}
        </FramePanel>
      </Frame>
    </div>
  );
}
