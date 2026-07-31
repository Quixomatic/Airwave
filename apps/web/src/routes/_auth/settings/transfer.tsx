import { Button } from "@ChannelGuide/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@ChannelGuide/ui/components/frame";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/transfer")({
  staticData: { breadcrumb: "Import / Export" },
  component: SettingsTransfer,
});

function SettingsTransfer() {
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
            which packages and channels to import before anything runs — then it builds them here, channel by
            channel, against this instance's media source. Requires a connected + synced source.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="text-muted-foreground flex items-center gap-2 text-sm">
          <Upload className="size-4" />
          Upload + staging coming in the next step.
        </FramePanel>
      </Frame>
    </div>
  );
}
