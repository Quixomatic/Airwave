import {
  Tv, Rewind, Radio, Clapperboard, Filter, Shuffle, Package, Wand2, Bot,
  MonitorPlay, Gauge, Wifi, Users, Lock, ServerCog,
} from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink, Container, Eyebrow, SectionHeading } from "@/components/marketing";

export const metadata = {
  title: "Features",
  description: "Everything Airwave does — the channel guide, DVR, bumpers, channel building, direct-play, per-user access, and self-hosting.",
};

type Feature = { icon: typeof Tv; title: string; body: ReactNode };

const GROUPS: { eyebrow: string; title: string; features: Feature[] }[] = [
  {
    eyebrow: "Watching",
    title: "It feels like live TV, because it is",
    features: [
      { icon: Tv, title: "A real channel guide", body: "A grid guide you surf like cable. Every viewer sees the same thing at the same wall-clock moment — channels are laid onto a deterministic, always-on timeline." },
      { icon: Rewind, title: "Live offset + DVR", body: "You join whatever's on now, mid-program, at the right offset — then scrub back within the live buffer. You can't skip ahead; that's the point." },
      { icon: Clapperboard, title: "Bumpers", body: "Between-program “Up Next” interstitials with blurred cover art and a countdown — the connective tissue that makes a lineup feel produced." },
      { icon: Radio, title: "Ambient music bed", body: "An optional music bed under bumpers, mixed from a folder of your own tracks, faded in and out with the break." },
    ],
  },
  {
    eyebrow: "Building",
    title: "Author a lineup, or let it author itself",
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
    title: "Plays your files as-is, wherever it can",
    features: [
      { icon: MonitorPlay, title: "Direct-play first", body: "Streams straight from your Plex and plays the original file natively — 4K HEVC, HDR, multichannel audio — falling back to transcode only when a device can't decode it." },
      { icon: Gauge, title: "Real capability measurement", body: "Each device runs a short diagnostic that measures what it can actually decode, instead of guessing from a device profile. Accurate, per-device." },
      { icon: Wifi, title: "On- and off-network", body: "Probes local → remote → relay and picks the best path to your Plex, so the same app works at home and on the road." },
    ],
  },
  {
    eyebrow: "Access & privacy",
    title: "Your server, your rules",
    features: [
      { icon: Users, title: "Per-user access", body: "Plex-style sharing: grant everything, a whole package (future channels included), or specific channels — enforced server-side on every request." },
      { icon: Lock, title: "Private by design", body: "Self-hosted with no telemetry. Your library, viewers, and history stay on your box; the Plex owner token is encrypted at rest." },
      { icon: ServerCog, title: "One image, self-hosted", body: "A single Docker image with a Postgres database. Deploy with compose, update by pulling a new tag. Runs great on a NAS." },
    ],
  },
];

function FeatureRow({ icon: Icon, title, body }: Feature) {
  return (
    <div className="flex gap-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-fd-border bg-fd-card/40 text-fd-primary">
        <Icon className="size-5" />
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-fd-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <main className="flex-1">
      <Container className="py-16 text-center sm:py-20">
        <div className="flex justify-center">
          <Eyebrow>Features</Eyebrow>
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
          Everything you need to run your own TV network
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-fd-muted-foreground">
          From the channel guide your viewers surf to the scheduler that keeps it running — all from your own
          Plex, on your own hardware.
        </p>
      </Container>

      {GROUPS.map((group) => (
        <section key={group.eyebrow} className="border-t border-fd-border py-16">
          <Container>
            <SectionHeading center={false} eyebrow={group.eyebrow} title={group.title} />
            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              {group.features.map((f) => (
                <FeatureRow key={f.title} {...f} />
              ))}
            </div>
          </Container>
        </section>
      ))}

      <section className="border-t border-fd-border py-16">
        <Container className="flex flex-wrap items-center justify-center gap-3 text-center">
          <ButtonLink href="/docs/getting-started">Get started</ButtonLink>
          <ButtonLink href="/docs" variant="secondary">
            Read the docs
          </ButtonLink>
        </Container>
      </section>
    </main>
  );
}
