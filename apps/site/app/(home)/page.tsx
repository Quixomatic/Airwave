import type { ComponentType } from "react";
import Link from "next/link";
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tv, Rewind, Clapperboard, MonitorPlay, ShieldCheck, Sparkles, TerminalIcon, Globe } from "lucide-react";
import { SiApple, SiAndroid, SiLg, SiGooglechrome, SiRoku, SiSamsung } from "react-icons/si";
import { FaAmazon, FaWindows, FaLinux, FaGithub } from "react-icons/fa";
import { cn } from "@/lib/cn";
import { button, card, heading, Wide } from "@/components/landing";
import { ClipCarousel } from "@/components/clip-carousel";
import { HeroDownloadButtons } from "@/components/hero-downloads";
import { getHeroDownloads } from "@/lib/releases";
import { AgnosticBackground, HeroShaders, ShaderCta } from "@/components/shaders";
import { COMPOSE } from "./compose";
import { PreviewImages } from "./page.client";

export const metadata = {
  title: "Airwave — your Plex library, as custom live TV",
};

// Landing variant helpers (heading/button/card/Wide) now live in `@/components/landing` (shared across
// marketing pages — the fumadocs.dev-style design system).

const FEATURES = [
  { icon: Tv, title: "A real channel guide", body: "A grid guide you surf like cable — always-on channels on one continuous, deterministic timeline everyone sees in sync." },
  { icon: Rewind, title: "Live offset + DVR", body: "Tune in mid-program at the right moment, then scrub back within the live buffer. You join what's on now — you just can't skip ahead." },
  { icon: Clapperboard, title: "Bumpers & ambient music", body: "Between-program “Up Next” cards with cover art, plus an optional ambient-music bed — the touches that make it feel like a channel." },
  { icon: MonitorPlay, title: "Direct-play everywhere", body: "Each device measures what it can decode and direct-plays your files natively — 4K HDR, multichannel audio — transcoding only when it must." },
  { icon: ShieldCheck, title: "Self-hosted & private", body: "You run the server. Your library, viewers, and history stay on your hardware. No telemetry, no accounts on our end, nothing phoning home." },
  { icon: Sparkles, title: "Build channels fast", body: "Author channels from metadata filters, auto-generate a whole lineup, or let a bring-your-own-key AI assistant draft one for you." },
];

// Fully-supported first (green "Ready"), then partial (amber "WIP"); COMING_SOON renders after (muted "Soon").
const PLATFORMS: { name: string; Icon: ComponentType<{ className?: string }>; badge: "Ready" | "WIP" }[] = [
  { name: "Apple TV", Icon: SiApple, badge: "Ready" },
  { name: "iPad", Icon: SiApple, badge: "Ready" },
  { name: "macOS", Icon: SiApple, badge: "Ready" },
  { name: "Windows", Icon: FaWindows, badge: "Ready" },
  { name: "LG webOS", Icon: SiLg, badge: "Ready" },
  { name: "Roku", Icon: SiRoku, badge: "Ready" },
  { name: "Any browser", Icon: Globe, badge: "Ready" },
  { name: "Android TV", Icon: SiAndroid, badge: "WIP" },
  { name: "Fire TV", Icon: FaAmazon, badge: "WIP" },
];

const COMING_SOON: { name: string; Icon: ComponentType<{ className?: string }> }[] = [
  { name: "Linux", Icon: FaLinux },
  { name: "Samsung (Tizen)", Icon: SiSamsung },
];

// The hero shot quietly cycles these once ready (bare carousel — no controls); the guide screenshot is the poster.
const HERO_REEL = [
  { src: "/demos/guide-surf.mp4" },
  { src: "/demos/mini-player.mp4" },
  { src: "/demos/lenses.mp4" },
];

export default async function HomePage() {
  const dl = await getHeroDownloads();
  return (
    <main className="pt-4 pb-6 text-landing-foreground md:pb-12">
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      {/* Force the dark palette here regardless of the site theme: the hero sits on a dark shader
          background, so its text/badge/border tokens must stay dark-mode values even in light mode.
          `.dark` re-scopes --color-fd-*, --brand*, and --landing-foreground for this subtree. */}
      <Wide>
      <div className="dark relative isolate flex h-[76vh] max-h-[900px] min-h-[620px] w-full overflow-hidden rounded-2xl border bg-fd-background text-landing-foreground">
        <HeroShaders />
        {/* Hero shot anchored lower-right, bleeding off the panel. Starts as the guide screenshot (poster),
            then quietly cycles the demo clips (bare carousel, no controls). z-1 keeps it above the shaders
            (-z-1) but below the text content (z-2), so text stays on top. */}
        <ClipCarousel
          variant="bare"
          poster="/screenshots/appletv-guide.webp"
          clips={HERO_REEL}
          className="pointer-events-none absolute top-[74%] left-1/2 z-1 w-[560px] max-w-none -translate-x-1/2 rounded-xl border-2 border-fd-border shadow-2xl shadow-black/40 md:top-[66%] md:left-[38%] md:w-[760px] md:translate-x-0 lg:top-[56%] lg:left-[42%] lg:w-[900px] xl:left-[46%] xl:w-[980px]"
        />
        <div className="z-2 flex size-full flex-col px-4 max-md:items-center max-md:text-center md:p-12">
          <p className="mt-12 w-fit rounded-full border border-brand/50 bg-fd-background/50 px-3 py-1.5 text-xs font-medium text-brand backdrop-blur-md">
            The live-TV layer for your Plex library.
          </p>
          <h1 className="my-8 text-4xl leading-tight font-medium text-fd-foreground [text-shadow:0_2px_18px_rgb(3_7_18_/_0.6)] xl:mb-10 xl:text-6xl">
            Your library,
            <br className="md:hidden" /> always on.
            <br />
            Surf it like <span className="text-brand-200">live TV</span>.
          </h1>
          <p className="mb-10 max-w-xl text-base text-fd-foreground/85 [text-shadow:0_1px_14px_rgb(3_7_18_/_0.55)] md:text-lg">
            Airwave turns your own media into always-on, channel-surfable live TV — a real guide, DVR, and
            bumpers — streamed straight from your Plex to native apps on every big screen you own.
          </p>
          <HeroDownloadButtons dl={dl} />
          <div className="mt-5 flex flex-row flex-wrap items-center gap-2.5">
            <Link href="/docs/getting-started" className={cn(button("secondary"), "max-sm:text-sm")}>
              Get started
            </Link>
            <a
              href="https://github.com/Quixomatic/Airwave"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="GitHub"
              title="GitHub"
              className="inline-flex size-[46px] items-center justify-center rounded-full border bg-fd-secondary text-fd-secondary-foreground transition-colors hover:bg-fd-accent"
            >
              <FaGithub className="size-5" />
            </a>
          </div>
        </div>
      </div>
      </Wide>

      {/* ── Intro statement ──────────────────────────────────────────────────── */}
      <Wide className="mt-16 lg:mt-28">
        <p className="text-2xl leading-snug font-light tracking-tight md:text-3xl xl:text-4xl">
          Airwave is a <span className="font-medium text-brand">self-hostable</span> service that turns your
          own <span className="font-medium text-brand">Plex</span> library into curated, always-on{" "}
          <span className="font-medium text-brand">live TV channels</span> — the broadcast-style guide you
          leave on, not another grid of posters to scroll. You own the server, the content, and the data.
        </p>
      </Wide>

      {/* ── Get running ──────────────────────────────────────────────────────── */}
      <Wide className="mt-16 grid grid-cols-1 items-start gap-10 lg:mt-28 lg:grid-cols-2">
        <div className="flex flex-col rounded-2xl p-6 md:p-8">
          <h2 className={heading("h2", "mb-4")}>Self-host it in minutes.</h2>
          <p className="mb-6 text-fd-muted-foreground">
            One image, two roles, a Postgres. Drop this <code className="text-brand">compose.yaml</code>, point
            it at your database, and pull updates by re-pulling the tag. No transcoder to babysit — Airwave is
            the channel brain, your Plex does the streaming.
          </p>
          <div className="flex flex-row flex-wrap gap-3">
            <Link href="/docs/self-hosting" className={button("primary", "text-sm")}>
              Self-hosting guide
            </Link>
            <Link href="/docs/self-hosting/docker" className={button("secondary", "text-sm")}>
              Docker reference
            </Link>
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-3 flex flex-row items-center gap-2 text-fd-muted-foreground">
            <TerminalIcon className="size-4" />
            <span className="font-mono text-xs">docker-compose.yml</span>
          </div>
          <ServerCodeBlock
            code={COMPOSE}
            lang="yaml"
            codeblock={{ className: "bg-fd-secondary [&_pre]:max-h-[360px]" }}
          />
        </div>
      </Wide>

      {/* ── A real 10-foot experience ────────────────────────────────────────── */}
      <Wide className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="flex items-center justify-center">
          <PreviewImages />
        </div>
        <div className={cn(card(), "flex flex-col")}>
          <h3 className={heading("h3", "mb-6")}>A real 10-foot experience.</h3>
          <p className="mb-4 text-fd-muted-foreground">
            The viewer app is a proper couch-and-remote TV app — an Aurora channel-guide grid, a glass player
            with a DVR scrubber, channel up/down, and the “Up Next” bumper card. The same app across
            platforms, delivered as a native binary or a browser player.
          </p>
          <p className="mb-6 text-fd-muted-foreground">
            Built for a big screen and a remote — deliberately not a phone UI.
          </p>
          <div className="mt-auto flex flex-row flex-wrap gap-3">
            <Link href="/channel-guide" className={button("primary", "text-sm")}>
              The channel guide
            </Link>
            <Link href="/docs/platforms" className={button("secondary", "text-sm")}>
              Platforms
            </Link>
          </div>
        </div>
      </Wide>

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <Wide className="mt-16 lg:mt-28">
        <h2 className={heading("h2", "text-center text-brand")}>Everything a channel needs.</h2>
        <p className="mx-auto mt-4 mb-12 max-w-2xl text-center text-fd-muted-foreground">
          Not a media browser — a channel you leave on. All of it runs from your own Plex, on your own
          hardware.
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className={cn(card(), "flex flex-col")}>
              <f.icon className="mb-4 size-6 text-brand" />
              <h3 className={heading("h3", "mb-2 text-base lg:text-lg")}>{f.title}</h3>
              <p className="text-fd-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </Wide>

      {/* ── Living-room grid (fumadocs "For Engineers"-style grid) ───────────── */}
      <Wide className="mt-16 lg:mt-28">
        <h2 className={heading("h2", "mb-3 text-center text-brand")}>Built for the living room.</h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-fd-muted-foreground">
          One app on every big screen, and a three-step path from your library to a channel you leave on.
        </p>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Works on most platforms — dithered-warp background, like fumadocs' "Framework Agnostic" card */}
          <div className={cn(card(), "relative z-2 flex flex-col overflow-hidden")}>
            <h3 className={heading("h3", "mb-3")}>Works on most platforms.</h3>
            <p className="mb-8 max-w-md text-fd-muted-foreground">
              10-foot native apps for the living room, plus a browser player you serve from the same stack —
              the same app everywhere.
            </p>
            {/* Square tiles — icon stacked over the platform name, like an app grid. */}
            <div className="mb-8 grid grid-cols-4 gap-2.5">
              {PLATFORMS.map((p) => (
                <div
                  key={p.name}
                  className="relative flex aspect-square flex-col items-center justify-center gap-3 rounded-xl border bg-fd-secondary p-3 text-center transition-colors hover:bg-fd-accent"
                >
                  <span
                    className={cn(
                      "absolute top-2 right-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase",
                      p.badge === "Ready"
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-amber-500/15 text-amber-500",
                    )}
                  >
                    {p.badge}
                  </span>
                  <p.Icon className="size-9 shrink-0 text-landing-foreground" />
                  <span className="text-xs font-medium text-landing-foreground sm:text-sm">{p.name}</span>
                </div>
              ))}

              {COMING_SOON.map((p) => (
                <div
                  key={p.name}
                  className="relative flex aspect-square flex-col items-center justify-center gap-3 rounded-xl border bg-fd-secondary p-3 text-center opacity-55"
                >
                  <span className="absolute top-2 right-2 rounded-full bg-fd-muted-foreground/20 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-fd-muted-foreground uppercase">
                    Soon
                  </span>
                  <p.Icon className="size-9 shrink-0 text-fd-muted-foreground" />
                  <span className="text-xs font-medium text-fd-muted-foreground sm:text-sm">{p.name}</span>
                </div>
              ))}
            </div>
            {/* Card footer — flush to the card edges, a muted bar over the shader. */}
            <div className="relative z-2 -mx-6 -mb-6 mt-auto border-t border-fd-border/60 bg-fd-muted px-6 py-4">
              <Link
                href="/docs/platforms"
                className="text-sm font-medium text-brand hover:underline"
              >
                See the full platform matrix →
              </Link>
            </div>
            <AgnosticBackground />
          </div>

          {/* Three steps — the fumadocs Steps component, in one card */}
          <div className={cn(card(), "flex flex-col")}>
            <h3 className={heading("h3", "mb-6")}>Three steps to live TV.</h3>
            <Steps>
              <Step>
                <h4 className="mb-1 font-medium text-landing-foreground">Connect Plex</h4>
                <p className="text-sm text-fd-muted-foreground">
                  Sign in with Plex once, enable your libraries, and sync metadata into Airwave&apos;s cache.
                </p>
              </Step>
              <Step>
                <h4 className="mb-1 font-medium text-landing-foreground">Build channels</h4>
                <p className="text-sm text-fd-muted-foreground">
                  Filter your library into channels — “90s comedies”, “all Studio Ghibli” — laid onto a
                  continuous timeline.
                </p>
              </Step>
              <Step>
                <h4 className="mb-1 font-medium text-landing-foreground">Tune in</h4>
                <p className="text-sm text-fd-muted-foreground">
                  Open a TV app, sign in, and channel-surf your library like it&apos;s live cable — at home or
                  on the road.
                </p>
              </Step>
            </Steps>
          </div>
        </div>
      </Wide>

      {/* ── Admin showcase ───────────────────────────────────────────────────── */}
      <Wide className="mt-16 lg:mt-28">
        <div className={cn(card(), "grid grid-cols-1 items-center gap-8 p-8 lg:grid-cols-2 lg:p-10")}>
          <div>
            <h2 className={heading("h2", "mb-4")}>Design your lineup, then forget about it.</h2>
            <p className="mb-6 text-fd-muted-foreground">
              Build channels from filters, group them into packages, share them per-viewer, and let the
              scheduler keep every channel running deterministically — no babysitting.
            </p>
            <div className="flex flex-row flex-wrap gap-3">
              <Link href="/docs/channels" className={button("primary", "text-sm")}>
                How channels work
              </Link>
              <Link href="/docs/packages" className={button("secondary", "text-sm")}>
                Packages
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/screenshots/admin-channels.webp"
              alt="The Airwave admin — channels"
              className="w-full"
            />
          </div>
        </div>
      </Wide>

      {/* ── Final CTA ────────────────────────────────────────────────────────── */}
      {/* ShaderCta pins itself dark (dark shader panel), so no wrapper needed here. */}
      <Wide className="mt-16 lg:mt-28">
        <ShaderCta
          title="Turn your library into a channel you leave on."
          subtitle="Free, self-hosted, and yours. Deploy the server, connect Plex, and start surfing."
        >
          <Link href="/docs/getting-started" className={button()}>
            Read the docs
          </Link>
          <a
            href="https://github.com/Quixomatic/Airwave"
            target="_blank"
            rel="noreferrer noopener"
            className={button("secondary")}
          >
            GitHub
          </a>
        </ShaderCta>
      </Wide>
    </main>
  );
}
