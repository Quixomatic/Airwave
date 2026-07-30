import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@ChannelGuide/ui/components/frame";
import { createFileRoute } from "@tanstack/react-router";

import { Logo } from "@/components/logo";
import { APP_NAME, APP_VERSION } from "@/lib/app-info";

export const Route = createFileRoute("/_auth/settings/about")({
  staticData: { breadcrumb: "About" },
  component: SettingsAbout,
});

function SettingsAbout() {
  return (
    <div className="space-y-4">
      <Frame>
        <FrameHeader>
          <div className="text-foreground mb-3">
            <Logo markWidth={64} wordmark />
          </div>
          <FrameTitle>About {APP_NAME}</FrameTitle>
          <FrameDescription>
            A self-hostable service that turns your own media-server library into curated live TV
            channels.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="tabular-nums">{APP_VERSION}</dd>
            <dt className="text-muted-foreground">Source</dt>
            <dd>
              <a
                href="https://github.com/Quixomatic/ChannelGuide"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground underline"
              >
                github.com/Quixomatic/ChannelGuide
              </a>
            </dd>
          </dl>
        </FramePanel>
      </Frame>
    </div>
  );
}
