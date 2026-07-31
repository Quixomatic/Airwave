import { Badge } from "@ChannelGuide/ui/components/badge";
import { Button } from "@ChannelGuide/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@ChannelGuide/ui/components/frame";
import { Input } from "@ChannelGuide/ui/components/input";
import { Switch } from "@ChannelGuide/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Clapperboard,
  FolderSearch,
  Loader2,
  Music,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { HeaderRight } from "@/context/header-provider";
import { serverBase } from "@/lib/img";
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
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicVolume, setMusicVolume] = useState("30");
  const [musicFadeIn, setMusicFadeIn] = useState("1000");
  const [musicFadeOut, setMusicFadeOut] = useState("1500");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config.data) {
      setEnabled(config.data.enabled);
      setAfterMovie(String(config.data.afterMovieSeconds));
      setAfterEpisode(String(config.data.afterEpisodeSeconds));
      setQuick(String(config.data.quickSeconds));
      setShortEp(String(config.data.shortEpisodeMinutes));
      setFallback(String(config.data.interstitialSeconds));
      setMusicEnabled(config.data.musicEnabled);
      setMusicVolume(String(config.data.musicVolume));
      setMusicFadeIn(String(config.data.musicFadeInMs));
      setMusicFadeOut(String(config.data.musicFadeOutMs));
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
    if (afterMovieSeconds == null || afterEpisodeSeconds == null || quickSeconds == null || interstitialSeconds == null) {
      toast.error("Break lengths must be between 1 and 600 seconds.");
      return;
    }
    if (shortEpisodeMinutes == null) {
      toast.error("Short-episode threshold must be between 1 and 240 minutes.");
      return;
    }
    const musicVol = inRange(musicVolume, 0, 100);
    const fadeIn = inRange(musicFadeIn, 0, 10_000);
    const fadeOut = inRange(musicFadeOut, 0, 10_000);
    if (musicVol == null) {
      toast.error("Music volume must be between 0 and 100.");
      return;
    }
    if (fadeIn == null || fadeOut == null) {
      toast.error("Fade times must be between 0 and 10000 ms.");
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
        musicEnabled,
        musicVolume: musicVol,
        musicFadeInMs: fadeIn,
        musicFadeOutMs: fadeOut,
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
    <div className="space-y-6">
      <HeaderRight>
        <Button type="submit" form={FORM_ID} size="sm" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </HeaderRight>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bumpers</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Between programs, Airwave shows a short interstitial break — a <em>“We'll be right back”</em> →{" "}
          <em>“Up Next”</em> card with the upcoming title, its cover art, and a countdown. A built-in breather
          instead of a nonstop binge. Each channel chooses whether to show them (on its edit page); the timing
          and ambient music are configured here.
        </p>
      </div>

      <form id={FORM_ID} onSubmit={save} className="space-y-6">
        <Frame>
          <FrameHeader>
            <FrameTitle>Enable</FrameTitle>
          </FrameHeader>
          <FramePanel>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
              Enable bumpers
              <span className="text-muted-foreground text-xs">
                — master switch; channels can still opt out individually
              </span>
            </label>
          </FramePanel>
        </Frame>

        <Frame className={enabled ? "" : "opacity-60"}>
          <FrameHeader>
            <FrameTitle>Break lengths</FrameTitle>
            <FrameDescription>
              The break length adapts to the moment — long after a feature, barely there between episodes of the
              same show. First matching rule wins.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="space-y-4">
            <NumberField label="After a movie" hint="A real intermission — you just watched a feature." value={afterMovie} onChange={setAfterMovie} unit="seconds" disabled={!enabled} />
            <NumberField label="After an episode" hint="A normal between-shows breather." value={afterEpisode} onChange={setAfterEpisode} unit="seconds" disabled={!enabled} />
            <NumberField label="Quick break" hint="Same show continues, or a short episode is up next — barely interrupt." value={quick} onChange={setQuick} unit="seconds" disabled={!enabled} />
            <NumberField label="Short-episode threshold" hint="An episode at or under this length counts as “short” (→ quick break)." value={shortEp} onChange={setShortEp} unit="minutes" disabled={!enabled} />
            <NumberField label="Default (anything else)" hint="Fallback when no tier above applies." value={fallback} onChange={setFallback} unit="seconds" disabled={!enabled} />
          </FramePanel>
        </Frame>

        <Frame className={enabled ? "" : "opacity-60"}>
          <FrameHeader>
            <FrameTitle>Ambient music</FrameTitle>
            <FrameDescription>
              A soft random track fades in under the break and fades out just before the next program — a quiet
              bed, like Pluto TV. Manage the track library below. Nothing to configure if you don't add any music.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={musicEnabled} onCheckedChange={(v) => setMusicEnabled(v === true)} disabled={!enabled} />
              Play ambient music under bumpers
            </label>
            <NumberField label="Volume" hint="Keep it low — it's a bed, not the foreground." value={musicVolume} onChange={setMusicVolume} unit="%" disabled={!enabled || !musicEnabled} />
            <NumberField label="Fade in" hint="Ramp up as the bumper starts." value={musicFadeIn} onChange={setMusicFadeIn} unit="ms" disabled={!enabled || !musicEnabled} />
            <NumberField label="Fade out" hint="Ramp down before the next program begins." value={musicFadeOut} onChange={setMusicFadeOut} unit="ms" disabled={!enabled || !musicEnabled} />
          </FramePanel>
        </Frame>

      </form>

      {/* The music library — its own actions (upload/toggle/delete/scan), so it lives OUTSIDE the config form. */}
      <MusicLibrary />

      <Frame>
        <FrameHeader>
          <FrameTitle>Coming later</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <div className="border-border/60 text-muted-foreground rounded-md border border-dashed p-3 text-xs">
            Commercial clips (from a Plex playlist/collection or a local folder) that play <em>inside</em> the
            up-next frame, and a mid-program break cadence. The schema is already in place for both.
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

function MusicLibrary() {
  const tracks = useQuery(trpc.bumperMusic.list.queryOptions());
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (id: string, title: string) => {
    setEditingId(id);
    setDraft(title);
  };
  const saveEdit = async () => {
    const id = editingId;
    const title = draft.trim();
    setEditingId(null);
    if (!id || !title) return;
    try {
      await trpcClient.bumperMusic.rename.mutate({ id, title });
      await tracks.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${serverBase()}/api/admin/bumper-music`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; track?: { title?: string } };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      toast.success(`Added “${json.track?.title ?? file.name}”.`);
      await tracks.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const scan = async () => {
    setScanning(true);
    try {
      const r = await trpcClient.bumperMusic.scan.mutate();
      toast.success(`Scan complete — ${r.added} added, ${r.missing} missing, ${r.total} total.`);
      await tracks.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const toggle = async (id: string, enabled: boolean) => {
    try {
      await trpcClient.bumperMusic.setEnabled.mutate({ id, enabled });
      await tracks.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete “${title}”? This removes the file too.`)) return;
    try {
      await trpcClient.bumperMusic.remove.mutate({ id });
      toast.success(`Deleted “${title}”.`);
      await tracks.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const list = tracks.data ?? [];

  return (
    <Frame>
      <FrameHeader className="flex-row items-start justify-between gap-3">
        <div>
          <FrameTitle>Music library</FrameTitle>
          <FrameDescription>
            Upload mp3 / m4a / aac tracks (or drop them into your bumper-music volume and scan). Enabled tracks
            play at random under bumpers.
          </FrameDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={scan} disabled={scanning}>
            {scanning ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FolderSearch className="mr-2 size-4" />}
            Scan folder
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/mpeg,audio/mp4,audio/aac,.mp3,.m4a,.aac"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
            Upload
          </Button>
        </div>
      </FrameHeader>
      <FramePanel className="p-0">
        {list.length === 0 ? (
          <EmptyState
            icon={Music}
            title="No bumper music yet"
            description="Upload a track, or drop files into your bumper-music volume and hit Scan folder."
          />
        ) : (
          <ul className="divide-border divide-y">
            {list.map((t) => (
              <li key={t.id} className={`flex items-center gap-3 p-3 ${t.missing ? "opacity-60" : ""}`}>
                <Switch checked={t.enabled} onCheckedChange={(v) => toggle(t.id, v === true)} aria-label={`Enable ${t.title}`} disabled={t.missing} />
                <div className="min-w-0 flex-1">
                  {editingId === t.id ? (
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => void saveEdit()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveEdit();
                        } else if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      className="h-7 text-sm"
                      aria-label="Track name"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <button
                        type="button"
                        onClick={() => startEdit(t.id, t.title)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        aria-label={`Rename ${t.title}`}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                  )}
                  <p className="text-muted-foreground truncate text-xs">
                    {t.source === "scan" ? "found in folder" : "uploaded"}
                    {t.sizeBytes ? ` · ${(t.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}
                  </p>
                </div>
                {t.missing ? (
                  <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-600">
                    <AlertTriangle className="size-3" /> Missing
                  </Badge>
                ) : (
                  <audio
                    controls
                    preload="none"
                    className="h-8 max-w-[220px]"
                    src={`${serverBase()}/bumper-music/${encodeURIComponent(t.filename)}`}
                  />
                )}
                <Button type="button" size="icon" variant="ghost" onClick={() => remove(t.id, t.title)} aria-label={`Delete ${t.title}`}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </FramePanel>
    </Frame>
  );
}

function NumberField({
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
        <Input className="w-20 text-right" value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" disabled={disabled} />
        <span className="text-muted-foreground w-14 text-xs">{unit}</span>
      </div>
    </div>
  );
}
