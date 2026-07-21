import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@ChannelGuide/ui/components/frame";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/settings/main")({
  staticData: { breadcrumb: "General" },
  component: SettingsGeneral,
});

function SettingsGeneral() {
  return (
    <div className="space-y-4">
      <Frame>
        <FrameHeader>
          <FrameTitle>General</FrameTitle>
          <FrameDescription>Server-wide preferences.</FrameDescription>
        </FrameHeader>
        <FramePanel>
          <p className="text-muted-foreground text-sm">
            General server settings will live here — playback defaults, IPTV output, and appearance.
          </p>
        </FramePanel>
      </Frame>
    </div>
  );
}
