import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, Moon, SquareDashed, Sun, Tv2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { HeaderLeft } from "@/context/header-provider";
import { useTheme } from "@/components/theme-provider";
import { AuroraGuide, type GuideData } from "@/features/guide/aurora-guide";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/guide")({
  // Full-bleed so the Aurora guide fills the content area (matching the TV's proportions);
  // the featured panel + grid are cinematic and cramp inside the standard max-w column.
  staticData: { breadcrumb: "Guide", breadcrumbIcon: Tv2, breadcrumbTint: "cyan", fullBleed: true },
  component: Guide,
});

function Guide() {
  const navigate = useNavigate();
  const guide = useQuery({
    ...trpc.channels.guide.queryOptions({ forwardMinutes: 150 }),
    refetchInterval: 60_000,
  });
  const sessions = useQuery({
    ...trpc.playback.sessions.queryOptions(),
    refetchInterval: 5_000,
  });

  const tune = (channelId: string) =>
    navigate({ to: "/watch/$channelId", params: { channelId } });

  const recentSession = (sessions.data ?? [])[0];

  return (
    <>
      {recentSession && (
        <HeaderLeft>
          <RecentSessionChip session={recentSession} />
        </HeaderLeft>
      )}
      <TvMockup>
        {({ empty }) =>
          guide.isLoading ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              Loading guide…
            </div>
          ) : !guide.data ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              No guide data.
            </div>
          ) : (
            <AuroraGuide data={guide.data as unknown as GuideData} onTune={tune} forceEmpty={empty} />
          )
        }
      </TvMockup>
    </>
  );
}

/**
 * A flat-panel TV device mockup — a dark plastic bezel (with a thin "chin" + power LED) around the
 * guide "screen", on a center-pedestal stand. The Aurora guide is a 10-foot design, so presenting it
 * as what's on a TV reads far more naturally than a flat admin card. The bezel/stand are always dark
 * (TVs are black). A "Guide preview" badge above the TV toggles the SCREEN between light/dark
 * independently of the admin theme (forced via a `.light`/`.dark` class on the screen wrapper, which
 * re-declares the theme tokens for that subtree); it defaults to the admin's current theme.
 */
function TvMockup({ children }: { children: (state: { empty: boolean }) => React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [override, setOverride] = useState<"light" | "dark" | null>(null);
  const [empty, setEmpty] = useState(false);
  const screen: "light" | "dark" = override ?? (resolvedTheme === "light" ? "light" : "dark");
  // If the whole app's theme flips, drop any manual preview override so the screen (and its
  // `.light`/`.dark` class) follows the app theme again.
  useEffect(() => setOverride(null), [resolvedTheme]);

  // Bezel/stand are always dark plastic, but on the dark app background a near-black bezel vanishes —
  // so lighten the device in dark mode (keyed off the APP theme, not the screen override) to keep the
  // TV shape legible. In light mode the dark bezel contrasts fine.
  const appDark = resolvedTheme === "dark";
  const bezel = appDark
    ? "linear-gradient(160deg,#42424b,#2a2a31 45%,#1f1f25)"
    : "linear-gradient(160deg,#26262b,#101013 42%,#0a0a0c)";
  const standNeck = appDark ? "linear-gradient(#3a3a42,#222228)" : "linear-gradient(#1c1c21,#0e0e11)";
  const standBase = appDark ? "linear-gradient(#42424b,#222228)" : "linear-gradient(#26262b,#0e0e11)";

  // Fit a fixed 16:9 TV into the available area (minus the badge + stand), so it always keeps a
  // TV-shaped ratio and scales down cleanly when the content narrows (e.g. the AI side panel opens).
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setArea({ w: r.width, h: r.height });
    });
    ro.observe(el);
    setArea({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const CHROME_RESERVE = 72; // badge (+ margin) + stand heights, kept off the 16:9 box
  const availH = Math.max(0, area.h - CHROME_RESERVE);
  const tvW = area.w && availH ? Math.min(area.w, availH * (16 / 9)) : 0;
  const tvH = tvW * (9 / 16);

  return (
    <div ref={areaRef} className="flex h-full flex-col items-center justify-center p-24">
      {/* Preview badge — label + a light/dark toggle + an empty-state toggle. */}
      <div className="text-muted-foreground bg-muted/60 mb-3 flex shrink-0 items-center gap-0.5 rounded-full border p-0.5 pl-2.5 text-xs">
        <Tv2 className="h-3.5 w-3.5" />
        <span className="font-medium">Guide preview</span>
        <span className="bg-border mx-1 h-3.5 w-px" />
        <button
          type="button"
          onClick={() => setOverride(screen === "dark" ? "light" : "dark")}
          className="hover:bg-muted hover:text-foreground flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors"
          title="Toggle the preview screen light / dark"
        >
          {screen === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          <span className="capitalize">{screen}</span>
        </button>
        <button
          type="button"
          onClick={() => setEmpty((v) => !v)}
          aria-pressed={empty}
          className={
            "flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors " +
            (empty ? "bg-muted text-foreground" : "hover:bg-muted hover:text-foreground")
          }
          title="Preview the empty (no channels) state"
        >
          {empty ? <SquareDashed className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
          <span>Empty</span>
        </button>
      </div>

      {/* TV body / bezel — fixed 16:9, sized to fit */}
      <div
        className="relative shrink-0 rounded-[1.4rem] p-3 pb-5"
        style={{
          width: tvW,
          height: tvH,
          background: bezel,
          boxShadow:
            "0 30px 70px -25px rgba(0,0,0,0.7), 0 8px 20px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {/* Screen — forced to the chosen theme (`.light`/`.dark` re-declares the tokens); the guide
            fills it; a faint diagonal glare sells the glass. */}
        <div className={`${screen} bg-background relative h-full w-full overflow-hidden rounded-lg ring-1 ring-black/40`}>
          {children({ empty })}
          <div
            className="pointer-events-none absolute inset-0 z-10"
            style={{ background: "linear-gradient(118deg, rgba(255,255,255,0.06) 0%, transparent 26%)" }}
          />
        </div>
        {/* Chin power LED */}
        <span
          className="pointer-events-none absolute bottom-2 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
          style={{ background: "#5eead4", boxShadow: "0 0 6px #5eead4" }}
        />
      </div>
      {/* Stand — center pedestal + base, scaled to the TV width */}
      <div className="flex shrink-0 flex-col items-center">
        <div className="h-4" style={{ width: Math.max(60, tvW * 0.16), background: standNeck }} />
        <div className="h-1.5 rounded-b-md rounded-t-sm" style={{ width: Math.max(140, tvW * 0.4), background: standBase }} />
      </div>
    </div>
  );
}

type Session = {
  id: string;
  user: string;
  channel: { number: number; name: string; callsign: string | null } | null;
  state: string;
  title: string | null;
  delaySeconds: number;
};

/** The most-recent viewing session, as a compact chip for the SubHeader top-left portal. */
function RecentSessionChip({ session: s }: { session: Session }) {
  const what =
    s.state === "bumper" ? "On a break" : s.title ? s.title : s.state;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
      </span>
      <span className="font-medium">{s.user}</span>
      {s.channel && (
        <span className="text-muted-foreground hidden sm:inline">
          Ch {s.channel.number} · {s.channel.name}
        </span>
      )}
      <span className="text-muted-foreground hidden max-w-[16rem] truncate md:inline">· {what}</span>
      <span className="text-muted-foreground shrink-0">
        {s.delaySeconds < 5 ? (
          <span className="font-semibold uppercase text-red-500">Live</span>
        ) : (
          `${formatBehind(s.delaySeconds)} behind`
        )}
      </span>
    </div>
  );
}

function formatBehind(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m`;
}
