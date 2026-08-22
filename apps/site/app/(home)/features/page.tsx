import {
  Tv, Rewind, Radio, Clapperboard, Filter, Shuffle, Package, Wand2, Bot,
  MonitorPlay, Gauge, Wifi, Users, Lock, ServerCog,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Pill, SectionHeader, Wide } from "@/components/landing";
import { ScrollReveal } from "@/components/scroll-reveal";
import { ClipCarousel } from "@/components/clip-carousel";
import { InViewVideo } from "@/components/motion-video";
import { ShaderCta } from "@/components/shaders";

export const metadata = {
  title: "Features",
  description: "Everything Airwave does — the channel guide, DVR, bumpers, channel building, direct-play, per-user access, and self-hosting.",
};

type Feature = { icon: typeof Tv; title: string; body: ReactNode };
type Media = { video?: string; image?: string; alt: string };

const GROUPS: { eyebrow: string; title: string; media: Media; features: Feature[] }[] = [
  {
    eyebrow: "Watching",
    title: "It feels like live TV, because it is.",
    media: { video: "/demos/guide-surf.mp4", alt: "Surfing the Airwave channel guide" },
    features: [
      { icon: Tv, title: "A real channel guide", body: "A grid guide you surf like cable. Every viewer sees the same thing at the same wall-clock moment — channels laid onto a deterministic, always-on timeline." },
      { icon: Rewind, title: "Live offset + DVR", body: "You join whatever's on now, mid-program, at the right offset — then scrub back within the live buffer. You can't skip ahead; that's the point." },
      { icon: Clapperboard, title: "Bumpers", body: "Between-program “Up Next” interstitials with blurred cover art and a countdown — the connective tissue that makes a lineup feel produced." },
      { icon: Radio, title: "Ambient music bed", body: "An optional music bed under bumpers, mixed from a folder of your own tracks, faded in and out with the break." },
    ],
  },
  {
    eyebrow: "Building",
    title: "Author a lineup, or let it author itself.",
    media: { image: "/screenshots/admin-channel-filter.webp", alt: "Building a channel from a metadata filter" },
    features: [
      { icon: Filter, title: "Filter-based channels", body: "Define a channel by a metadata filter — genre, year, network, cast, resolution, “added in the last N days” — with a live preview of what resolves." },
      { icon: Shuffle, title: "Ordering & strategies", body: "Shuffle, sort, or layer grouping/rotation strategies on top: marathons, round-robins, length-aware blocks, and no-repeat windows." },
      { icon: Package, title: "Packages", body: "Group channels into named bundles for organization, the guide's filter lenses, and per-user sharing." },
      { icon: Wand2, title: "Auto-generate a lineup", body: "One click evaluates a catalog of presets against your library and builds every channel it can fill — empty install to dozens of channels." },
      { icon: Bot, title: "AI assistant", body: "Optional and bring-your-own-key: describe what you want and a durable multi-agent workflow drafts a whole lineup for you." },
    ],
  },
  {
    eyebrow: "Playback",
    title: "Plays your files as-is, wherever it can.",
    media: { video: "/demos/tune-in-info.mp4", alt: "Program info showing direct-play of the original file" },
    features: [
      { icon: MonitorPlay, title: "Direct-play first", body: "Streams straight from your Plex and plays the original file natively — 4K HEVC, HDR, multichannel audio — falling back to transcode only when a device can't decode it." },
      { icon: Gauge, title: "Real capability measurement", body: "Each device runs a short diagnostic that measures what it can actually decode, instead of guessing from a device profile. Accurate, per-device." },
      { icon: Wifi, title: "On- and off-network", body: "Probes local → remote → relay and picks the best path to your Plex, so the same app works at home and on the road." },
    ],
  },
  {
    eyebrow: "Access & privacy",
    title: "Your server, your rules.",
    media: { image: "/screenshots/admin-users.webp", alt: "Per-user access management in the admin" },
    features: [
      { icon: Users, title: "Per-user access", body: "Plex-style sharing: grant everything, a whole package (future channels included), or specific channels — enforced server-side on every request." },
      { icon: Lock, title: "Private by design", body: "Self-hosted with no telemetry. Your library, viewers, and history stay on your box; the Plex owner token is encrypted at rest." },
      { icon: ServerCog, title: "One image, self-hosted", body: "A single Docker image with a Postgres database. Deploy with compose, update by pulling a new tag. Runs great on a NAS." },
    ],
  },
];

// The hero carousel cycles through every clip (story-style progress indicator).
const HERO_CLIPS = [
  { src: "/demos/guide-surf.mp4", label: "Surf the guide" },
  { src: "/demos/tune-in-info.mp4", label: "Program info" },
  { src: "/demos/channel-surf.mp4", label: "Channel surf" },
  { src: "/demos/restart.mp4", label: "Start over" },
  { src: "/demos/dvr-bumper.mp4", label: "DVR + bumper" },
  { src: "/demos/mini-player.mp4", label: "Mini player" },
  { src: "/demos/lenses.mp4", label: "Filter lenses" },
  { src: "/demos/filtered-pick.mp4", label: "Filtered pick" },
];

function FeatureRow({ icon: Icon, title, body }: Feature) {
  return (
    <div className="flex gap-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-fd-secondary text-brand">
        <Icon className="size-4.5" />
      </div>
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 text-sm text-fd-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function Media({ media }: { media: Media }) {
  if (media.video) return <InViewVideo src={media.video} aria-label={media.alt} />;
  return (
    <div className="overflow-hidden rounded-xl border shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={media.image} alt={media.alt} className="w-full" />
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <main className="pt-4 pb-6 text-landing-foreground md:pb-12">
      {/* Hero */}
      <Wide className="pt-10 text-center lg:pt-16">
        <p className="mx-auto w-fit rounded-full border border-brand/50 px-3 py-1.5 text-xs font-medium text-brand">
          Features
        </p>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl leading-tight font-medium text-fd-foreground xl:text-6xl">
          Everything you need to run your own <span className="text-brand">TV network</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-fd-muted-foreground md:text-lg">
          From the channel guide your viewers surf to the scheduler that keeps it running — all from your own
          Plex, on your own hardware.
        </p>
        <ClipCarousel clips={HERO_CLIPS} className="mx-auto mt-10 max-w-[1100px]" />
      </Wide>

      {/* Groups — alternating media / feature list */}
      {GROUPS.map((group, i) => (
        <Wide key={group.eyebrow} className="mt-16 lg:mt-28">
          <ScrollReveal>
            <SectionHeader
              label={group.eyebrow}
              title={group.title}
              titleCh={18}
              className="mb-[clamp(2.5rem,6vw,4.5rem)]"
            />
          </ScrollReveal>
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div className={cn(i % 2 === 1 && "lg:order-2")}>
              <Media media={group.media} />
            </div>
            <div className={cn("flex flex-col gap-6", i % 2 === 1 && "lg:order-1")}>
              {group.features.map((f) => (
                <FeatureRow key={f.title} {...f} />
              ))}
            </div>
          </div>
        </Wide>
      ))}

      {/* CTA */}
      <Wide className="mt-16 lg:mt-28">
        <ShaderCta title="Ready to build your lineup?">
          <Pill href="/docs/getting-started">Get started</Pill>
          <Pill href="/docs" variant="secondary">Read the docs</Pill>
        </ShaderCta>
      </Wide>
    </main>
  );
}
