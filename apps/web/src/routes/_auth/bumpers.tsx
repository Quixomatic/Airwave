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
  const [afterMovie, setAfterMovie] = useState("120");
  const [afterEpisode, setAfterEpisode] = useState("30");
  const [quick, setQuick] = useState("10");
  const [shortEp, setShortEp] = useState("20");
  const [fallback, setFallback] = useState("8");
  const [musicKey, setMusicKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config.data) {
      setEnabled(config.data.enabled);
      setAfterMovie(String(config.data.afterMovieSeconds));
      setAfterEpisode(String(config.data.afterEpisodeSeconds));
      setQuick(String(config.data.quickSeconds));
      setShortEp(String(config.data.shortEpisodeMinutes));
      setFallback(String(config.data.interstitialSeconds));
      setMusicKey(config.data.interstitialMusicKey ?? "");
    }
  }, [config.data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const inRange = (v: string, lo: number, hi: number) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
    };
    const afterMovieSeconds = inRange(afterMovie, 1, 600);
    const afterEpisodeSeconds = inRange(afterEpisode, 1, 600);
    const quickSeconds = inRange(quick, 1, 600);
    const shortEpisodeMinutes = inRange(shortEp, 1, 240);
    const interstitialSeconds = inRange(fallback, 1, 600);
    if (
      afterMovieSeconds == null ||
      afterEpisodeSeconds == null ||
      quickSeconds == null ||
      interstitialSeconds == null
    ) {
      toast.error("Break lengths must be between 1 and 600 seconds.");
      return;
    }
    if (shortEpisodeMinutes == null) {
      toast.error("Short-episode threshold must be between 1 and 240 minutes.");
      return;
    }
    setSaving(true);
    try {
      await trpcClient.bumpers.update.mutate({
        enabled,
        afterMovieSeconds,
        afterEpisodeSeconds,
        quickSeconds,
        shortEpisodeMinutes,
        interstitialSeconds,
        interstitialMusicKey: musicKey.trim() || null,
      });
      toast.success("Bumper settings saved — repairing affected schedules now.");
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
          whether to show them (on its edit page); the timing is configured here.
        </p>
      </div>

      <form id={FORM_ID} onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Enable</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card className={enabled ? "" : "opacity-60"}>
          <CardHeader>
            <CardTitle>Break lengths</CardTitle>
            <p className="text-muted-foreground text-xs">
              The break length adapts to the moment — long after a feature, barely there between
              episodes of the same show. First matching rule wins.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <SecondsField
              label="After a movie"
              hint="A real intermission — you just watched a feature."
              value={afterMovie}
              onChange={setAfterMovie}
              unit="seconds"
              disabled={!enabled}
            />
            <SecondsField
              label="After an episode"
              hint="A normal between-shows breather."
              value={afterEpisode}
              onChange={setAfterEpisode}
              unit="seconds"
              disabled={!enabled}
            />
            <SecondsField
              label="Quick break"
              hint="Same show continues, or a short episode is up next — barely interrupt."
              value={quick}
              onChange={setQuick}
              unit="seconds"
              disabled={!enabled}
            />
            <SecondsField
              label="Short-episode threshold"
              hint="An episode at or under this length counts as “short” (→ quick break)."
              value={shortEp}
              onChange={setShortEp}
              unit="minutes"
              disabled={!enabled}
            />
            <SecondsField
              label="Default (anything else)"
              hint="Fallback when no tier above applies."
              value={fallback}
              onChange={setFallback}
              unit="seconds"
              disabled={!enabled}
            />
          </CardContent>
        </Card>

        <Card className={enabled ? "" : "opacity-60"}>
          <CardHeader>
            <CardTitle>Interstitial extras</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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

function SecondsField({
  label,
  hint,
  value,
  onChange,
  unit,
  disabled,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          className="w-20 text-right"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="numeric"
          disabled={disabled}
        />
        <span className="text-muted-foreground w-14 text-xs">{unit}</span>
      </div>
    </div>
  );
}
