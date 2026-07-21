import { Card, CardContent, CardHeader, CardTitle } from "@ChannelGuide/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/settings/about")({
  staticData: { breadcrumb: "About" },
  component: SettingsAbout,
});

function SettingsAbout() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>About ChannelGuide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            A self-hostable service that turns your own media-server library into curated live TV
            channels.
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="tabular-nums">0.1.13</dd>
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
        </CardContent>
      </Card>
    </div>
  );
}
