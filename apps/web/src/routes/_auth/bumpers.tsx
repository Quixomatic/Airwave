import { Button } from "@ChannelGuide/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ChannelGuide/ui/components/card";
import { Input } from "@ChannelGuide/ui/components/input";
import { Label } from "@ChannelGuide/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Clapperboard, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { HeaderRight } from "@/context/header-provider";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/bumpers")({
  staticData: { breadcrumb: "Bumpers", breadcrumbIcon: Clapperboard, breadcrumbTint: "amber" },
  component: BumpersPage,
});

const FORM_ID = "bumpers-form";

function BumpersPage() {
  const config = useQuery(trpc.bumpers.get.queryOptions());
  const [enabled, setEnabled] = useState(false);
  const [seconds, setSeconds] = useState("8");
  const [musicKey, setMusicKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config.data) {
      setEnabled(config.data.enabled);
      setSeconds(String(config.data.interstitialSeconds));
      setMusicKey(config.data.interstitialMusicKey ?? "");
    }
  }, [config.data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const secs = Math.round(Number(seconds));
    if (!Number.isFinite(secs) || secs < 1 || secs > 120) {
      toast.error("Interstitial length must be between 1 and 120 seconds.");
      return;
    }
    setSaving(true);
    try {
      await trpcClient.bumpers.update.mutate({
        enabled,
        interstitialSeconds: secs,
        interstitialMusicKey: musicKey.trim() || null,
      });
      toast.success("Bumper settings saved. Existing schedules reconcile on the next Bumper Sync.");
      await config.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!config.data) {
    return <div className="text-muted-foreground mx-auto max-w-2xl text-sm">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <HeaderRight>
        <Button type="submit" form={FORM_ID} size="sm" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </HeaderRight>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bumpers</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Between programs, ChannelGuide shows a short interstitial break — a{" "}
          <em>“We'll be right back”</em> → <em>“Up Next”</em> card with the upcoming title, its cover
          art, and a countdown. A built-in breather instead of a nonstop binge. Each channel chooses
          whether to show them (on its edit page); the content is configured here.
        </p>
      </div>

      <form id={FORM_ID} onSubmit={save}>
        <Card>
          <CardHeader>
            <CardTitle>Interstitial breaks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enable bumpers
              <span className="text-muted-foreground text-xs">
                — master switch; channels can still opt out individually
              </span>
            </label>

            <div className="space-y-2">
              <Label htmlFor="bsecs">Break length (seconds)</Label>
              <Input
                id="bsecs"
                className="w-32"
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
                inputMode="numeric"
                disabled={!enabled}
              />
              <p className="text-muted-foreground text-xs">
                How long the “up next” card holds before the next program — long enough to stand up
                and stretch. 8–10s feels like a real station break.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bmusic">Interstitial music (optional)</Label>
              <Input
                id="bmusic"
                value={musicKey}
                onChange={(e) => setMusicKey(e.target.value)}
                placeholder="A media key for a soft music/chime bed"
                disabled={!enabled}
              />
              <p className="text-muted-foreground text-xs">
                A gentle bed played under the break. Wired for later — the card itself renders with
                the TV client.
              </p>
            </div>

            <div className="border-border/60 text-muted-foreground rounded-md border border-dashed p-3 text-xs">
              <p className="font-medium">Coming later</p>
              <p className="mt-1">
                Commercial clips (from a Plex playlist/collection or a local folder) that play{" "}
                <em>inside</em> the up-next frame, and a mid-program break cadence. The schema is
                already in place for both.
              </p>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
