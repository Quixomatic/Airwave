import type { ComponentType } from "react";
import Link from "next/link";
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { LiveTvStepper } from "@/components/live-tv-stepper";
import { Globe, Terminal, SlidersHorizontal } from "lucide-react";
import { SiApple, SiAndroid, SiLg, SiGooglechrome, SiRoku, SiSamsung } from "react-icons/si";
import { FaAmazon, FaWindows, FaLinux } from "react-icons/fa";
import { cn } from "@/lib/cn";
import { button, card, heading, SectionHeader, Wide } from "@/components/landing";
import { ScrollReveal } from "@/components/scroll-reveal";
import { getHeroDownloads } from "@/lib/releases";
import { AgnosticBackground, ShaderCta } from "@/components/shaders";
import { HeroV1, HeroV2, HeroV3 } from "@/components/hero";
import { HeroToggle } from "@/components/hero-toggle";
import { COMPOSE } from "./compose";
import { ENV_EXAMPLE } from "./env-example";
import { SelfHostConfig } from "@/components/self-host-config";
import { SelfHostConfigV2, SourceScope, SourceActions } from "@/components/self-host-config-v2";
import { Bento, type BentoItem } from "@/components/bento";
import { GuideMock, FormatScatter, DvrScrubber, BumperMock, PerUserMock, FilterMock, SelfHostMock } from "@/components/bento-mockups";

// Flatten the ServerCodeBlock's own chrome so it sits flush inside SelfHostConfig's (v1) bordered container.
const FLAT_CODEBLOCK = "!my-0 !rounded-none !border-0 !shadow-none !bg-transparent [&_pre]:max-h-[360px]";
const CODE_MAXH = "[&_pre]:max-h-[360px]";
const REPO = "https://github.com/Quixomatic/Airwave/blob/main";
const COMPOSE_URL = `${REPO}/docker-compose.yml`;
const ENV_URL = `${REPO}/.env.example`;
// Which self-host config style the home page renders. Defaults to v1 (the bordered-header card); set
// SELFHOST_CONFIG_VARIANT=v2 in the environment to switch to the tabs-over-card version. Read server-side at
// build time, so a change takes effect on the next deploy.
const SELFHOST_VARIANT = process.env.SELFHOST_CONFIG_VARIANT === "v2" ? "v2" : "v1";
import { PreviewImages } from "./page.client";

export const metadata = {
  title: "Airwave · your Plex library, as custom live TV",
};

// Landing variant helpers (heading/button/card/Wide) now live in `@/components/landing` (shared across
// marketing pages — the fumadocs.dev-style design system).

// Bento layout mirrors plezy's exact 8-cell grid (4 cols x 4 rows): a 2x2 hero, a 1x2 tall tile, four 1x1
// smalls, a 2-wide tile, and a full-width banner. Explicit lg placement so it matches cell-for-cell; below lg
// the `span` classes don't apply and the tiles flow in this array order (stacked / 2-up).
const FEATURES: BentoItem[] = [
  {
    title: "A real channel guide",
    body: "A grid guide you surf like cable, always-on channels on one continuous, deterministic timeline everyone sees in sync.",
    titleSize: "lg",
    content: <GuideMock />,
    span: "lg:col-start-1 lg:col-span-2 lg:row-start-1 lg:row-span-2",
    radius: "lg:rounded-tl-3xl lg:rounded-tr-md lg:rounded-br-md lg:rounded-bl-md",
  },
  {
    title: "Bumpers & music",
    body: "“Up Next” cards and an optional ambient bed between programs.",
    content: <BumperMock />,
    span: "lg:col-start-3 lg:row-start-1",
    radius: "lg:rounded-md",
    bg: "bg-fd-secondary",
  },
  {
    title: "Direct-play first",
    body: "Plays your files natively; transcodes only when a device needs it.",
    content: <FormatScatter />,
    span: "lg:col-start-3 lg:row-start-2",
    radius: "lg:rounded-md",
  },
  {
    title: "Live offset + DVR",
    body: "Join what's on now, scrub back through the buffer, restart, or roll into an earlier program. You just can't skip ahead of live.",
    content: <DvrScrubber />,
    span: "lg:col-start-4 lg:row-start-1 lg:row-span-2",
    radius: "lg:rounded-tr-3xl lg:rounded-tl-md lg:rounded-br-md lg:rounded-bl-md",
  },
  {
    title: "Self-hosted & private",
    body: "Runs on your hardware. No telemetry, nothing phones home.",
    content: <SelfHostMock />,
    span: "lg:col-start-1 lg:row-start-3",
    radius: "lg:rounded-md",
    bg: "bg-fd-secondary",
  },
  {
    title: "Per-user access",
    body: "Share whole packages or specific channels, enforced per viewer.",
    content: <PerUserMock />,
    span: "lg:col-start-2 lg:row-start-3",
    radius: "lg:rounded-md",
  },
  {
    title: "Build channels fast",
    body: "Author from metadata filters, auto-generate a whole lineup, or let a bring-your-own-key AI assistant draft one.",
    content: <FilterMock />,
    span: "lg:col-start-3 lg:col-span-2 lg:row-start-3",
    radius: "lg:rounded-md",
    bg: "bg-fd-secondary",
  },
  {
    title: "& much more",
    body: "Build entire lineups with AI, a built-in AI assistant, AI run observability, live session tracking, one synced guide every viewer shares, remote and relay playback, and more shipping regularly.",
    span: "lg:col-start-1 lg:col-span-4 lg:row-start-4",
    radius: "lg:rounded-t-md lg:rounded-b-3xl",
    href: "/features",
    cta: "See all features",
  },
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
  { name: "Fire TV", Icon: FaAmazon, badge: "Ready" },
  { name: "Samsung (Tizen)", Icon: SiSamsung, badge: "Ready" },
  { name: "Android TV", Icon: SiAndroid, badge: "WIP" },
];

const COMING_SOON: { name: string; Icon: ComponentType<{ className?: string }> }[] = [
  { name: "Linux", Icon: FaLinux },
];

export default async function HomePage() {
  const dl = await getHeroDownloads();
  const dev = process.env.NODE_ENV === "development";
  return (
    <main className="pt-4 pb-6 text-landing-foreground md:pb-12">
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      {/* Two variants, toggled on the dev run only (HeroToggle): v1 is the current shipped hero; v2 is the
          GuideEngine-style inset-panel hero with a glass frame straddling the bottom edge. Prod always renders
          v1. Both force the dark palette internally (they sit on a dark shader wash). */}
      <HeroToggle dev={dev} v1={<HeroV1 dl={dl} />} v2={<HeroV2 dl={dl} />} v3={<HeroV3 dl={dl} />} />

      {/* ── Intro statement ──────────────────────────────────────────────────── */}
      <Wide className="mt-16 lg:mt-28">
        <p className="text-2xl leading-snug font-light tracking-tight md:text-3xl xl:text-4xl">
          Airwave is a <span className="font-medium text-brand">self-hostable</span> service that turns your
          own <span className="font-medium text-brand">Plex</span> library into curated, always-on{" "}
          <span className="font-medium text-brand">live TV channels</span>, the broadcast-style guide you
          leave on, not another grid of posters to scroll. You own the server, the content, and the data.
        </p>
      </Wide>

      {/* ── Get running ──────────────────────────────────────────────────────── */}
      <Wide className="mt-16 grid grid-cols-1 items-start gap-10 lg:mt-28 lg:grid-cols-2">
        <div className="flex flex-col rounded-2xl p-6 md:p-8">
          <ScrollReveal>
            <SectionHeader
              label="Self-host"
              title="Self-host it in minutes."
              titleCh={12}
              description={
                <>
                  One image, two roles, a Postgres. Drop this{" "}
                  <code className="text-brand">compose.yaml</code>, point it at your database, and pull
                  updates by re-pulling the tag. No transcoder to babysit. Airwave is the channel brain,
                  your Plex does the streaming.
                </>
              }
              className="mb-6"
            />
          </ScrollReveal>
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
          {SELFHOST_VARIANT === "v2" ? (
            <SelfHostConfigV2
              files={[
                {
                  id: "compose",
                  label: "docker-compose.yml",
                  icon: <Terminal />,
                  block: (
                    <SourceScope url={COMPOSE_URL}>
                      <ServerCodeBlock code={COMPOSE} lang="yaml" codeblock={{ Actions: SourceActions, className: CODE_MAXH }} />
                    </SourceScope>
                  ),
                },
                {
                  id: "env",
                  label: ".env.example",
                  icon: <SlidersHorizontal />,
                  block: (
                    <SourceScope url={ENV_URL}>
                      <ServerCodeBlock code={ENV_EXAMPLE} lang="bash" codeblock={{ Actions: SourceActions, className: CODE_MAXH }} />
                    </SourceScope>
                  ),
                },
              ]}
            />
          ) : (
            <SelfHostConfig
              files={[
                {
                  id: "compose",
                  label: "docker-compose.yml",
                  url: COMPOSE_URL,
                  code: COMPOSE,
                  block: <ServerCodeBlock code={COMPOSE} lang="yaml" codeblock={{ allowCopy: false, className: FLAT_CODEBLOCK }} />,
                },
                {
                  id: "env",
                  label: ".env.example",
                  url: ENV_URL,
                  code: ENV_EXAMPLE,
                  block: <ServerCodeBlock code={ENV_EXAMPLE} lang="bash" codeblock={{ allowCopy: false, className: FLAT_CODEBLOCK }} />,
                },
              ]}
            />
          )}
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
            The viewer app is a proper couch-and-remote TV app: an Aurora channel-guide grid, a glass player
            with a DVR scrubber, channel up/down, and the “Up Next” bumper card. The same app across
            platforms, delivered as a native binary or a browser player.
          </p>
          <p className="mb-6 text-fd-muted-foreground">
            Built for a big screen and a remote, deliberately not a phone UI.
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
        <ScrollReveal>
          <SectionHeader
            label="Features"
            title="Everything a channel needs."
            titleCh={12}
            description="Not a media browser, a channel you leave on. All of it runs from your own Plex, on your own hardware."
            className="mb-[clamp(2.5rem,6vw,4.5rem)]"
          />
        </ScrollReveal>
        <Bento items={FEATURES} bordered={false} />
      </Wide>

      {/* ── Living-room grid (fumadocs "For Engineers"-style grid) ───────────── */}
      <Wide className="mt-16 lg:mt-28">
        <ScrollReveal>
          <SectionHeader
            label="Platforms"
            title="Built for the living room."
            titleCh={14}
            description="One app on every big screen, and a three-step path from your library to a channel you leave on."
            className="mb-[clamp(2.5rem,6vw,4.5rem)]"
          />
        </ScrollReveal>
        <div className="grid grid-cols-1 gap-6 lg:[grid-template-columns:2.2fr_1fr] xl:[grid-template-columns:2.5fr_1fr]">
          {/* Works on most platforms — dithered-warp background, like fumadocs' "Framework Agnostic" card */}
          <div className={cn(card(), "relative z-2 flex flex-col overflow-hidden")}>
            <h3 className={heading("h3", "mb-3")}>Works on most platforms.</h3>
            <p className="mb-8 max-w-md text-fd-muted-foreground">
              10-foot native apps for the living room, plus a browser player you serve from the same stack,
              the same app everywhere.
            </p>
            {/* Square tiles — icon stacked over the platform name, like an app grid. */}
            <div className="mb-8 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
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

          {/* Three steps — an animated vertical stepper that cycles through the setup flow. */}
          <div className={cn(card(), "flex flex-col")}>
            <h3 className={heading("h3", "mb-6")}>Three steps to live TV.</h3>
            <LiveTvStepper
              steps={[
                {
                  title: "Connect Plex",
                  description:
                    "Sign in with Plex once, enable your libraries, and sync metadata into Airwave's cache.",
                },
                {
                  title: "Build channels",
                  description:
                    "Filter your library into channels (“90s comedies”, “all Studio Ghibli”), laid onto a continuous timeline.",
                },
                {
                  title: "Tune in",
                  description:
                    "Open a TV app, sign in, and channel-surf your library like it's live cable, at home or on the road.",
                },
              ]}
            />
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
              scheduler keep every channel running deterministically, no babysitting.
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
              alt="The Airwave admin: channels"
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
