import { Card, CardContent, CardHeader, CardTitle } from "@ChannelGuide/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/settings/main")({
  staticData: { breadcrumb: "General" },
  component: SettingsGeneral,
});

function SettingsGeneral() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            General server settings will live here — playback defaults, IPTV output, and appearance.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
