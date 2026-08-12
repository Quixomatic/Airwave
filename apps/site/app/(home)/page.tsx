import { Tv, Rewind, Clapperboard, MonitorPlay, ShieldCheck, Sparkles, Plug, ListVideo, PlayCircle } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink, Container, Eyebrow, SectionHeading } from "@/components/marketing";

export const metadata = {
  title: "Airwave — your Plex library, as custom live TV",
};

const FEATURES = [
  { icon: Tv, title: "A real channel guide", body: "A proper grid guide you surf like cable — always-on channels, laid onto a continuous, deterministic timeline everyone sees in sync." },
  { icon: Rewind, title: "Live offset + DVR", body: "Tune in mid-program at the correct moment, then scrub back within the live buffer. You join what's on now — you just can't skip ahead." },
  { icon: Clapperboard, title: "Bumpers & ambient music", body: "Between-program “Up Next” interstitials with cover art, plus an optional ambient music bed — the little touches that make it feel like a channel." },
  { icon: MonitorPlay, title: "Direct-play everywhere", body: "Each device measures what it can actually decode and direct-plays your files natively — 4K HDR, multichannel audio — transcoding only when it must." },
  { icon: ShieldCheck, title: "Self-hosted & private", body: "You run the server. Your library, viewers, and history stay on your infrastructure. No telemetry, no accounts on our end, nothing phoning home." },
  { icon: Sparkles, title: "Build channels fast", body: "Author channels from metadata filters, auto-generate a whole lineup, or let a bring-your-own-key AI assistant draft one for you." },
];

const PLATFORMS = ["LG webOS", "Apple TV", "iPad", "Android TV", "Fire TV", "Any browser"];

const STEPS = [
  { icon: Plug, title: "Connect Plex", body: "Sign in with Plex once, enable your libraries, and sync metadata into Airwave's cache." },
  { icon: ListVideo, title: "Build channels", body: "Filter your library into channels — “90s comedies”, “all Studio Ghibli” — and let Airwave lay them onto a timeline." },
  { icon: PlayCircle, title: "Tune in", body: "Open a TV app, sign in, and channel-surf your own library like it's live cable — at home or on the road." },
];

function Card({ icon: Icon, title, body }: { icon: typeof Tv; title: string; body: ReactNode }) {
  return (
    <div className="rounded-xl border border-fd-border bg-fd-card/40 p-6 transition-colors hover:border-fd-primary/40">
      <div className="flex size-10 items-center justify-center rounded-lg border border-fd-border bg-fd-background text-fd-primary">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-fd-muted-foreground">{body}</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* gradient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[500px] max-w-4xl opacity-60 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--color-fd-primary) 35%, transparent), transparent)",
          }}
        />
        <Container className="pt-20 pb-16 text-center sm:pt-28">
          <div className="flex justify-center">
            <Eyebrow>Self-hostable · Plex-powered · Free</Eyebrow>
          </div>
          <h1 className="mx-auto mt-6 max-w-4xl text-balance text-5xl font-semibold tracking-tight sm:text-7xl">
            Your Plex library, as custom live TV.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-fd-muted-foreground sm:text-xl">
            Airwave turns your own media into always-on, channel-surfable live TV — a real guide, DVR, and
            bumpers — streamed straight from your Plex to native apps on every big screen you own.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/docs/getting-started">Get started</ButtonLink>
            <ButtonLink href="/features" variant="secondary">
              Explore features
            </ButtonLink>
          </div>

          {/* Hero shot */}
          <div className="mx-auto mt-16 max-w-5xl">
            <div className="overflow-hidden rounded-xl border border-fd-border shadow-2xl shadow-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/screenshots/appletv-guide.webp" alt="The Airwave channel guide on Apple TV" className="w-full" />
            </div>
          </div>
        </Container>
      </section>

      {/* Features */}
      <section className="py-20">
        <Container>
          <SectionHeading
            eyebrow="Why Airwave"
            title="The cable experience, built from media you already own"
            subtitle="Not a media browser — a channel you leave on. Everything below runs from your own Plex, on your own hardware."
          />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} icon={f.icon} title={f.title} body={f.body} />
            ))}
          </div>
        </Container>
      </section>

      {/* Platforms */}
      <section className="border-y border-fd-border bg-fd-card/30 py-16">
        <Container className="text-center">
          <p className="text-sm font-semibold text-fd-primary">Watch anywhere</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Native apps on every big screen</h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {PLATFORMS.map((p) => (
              <span key={p} className="rounded-full border border-fd-border bg-fd-background px-4 py-2 text-sm font-medium">
                {p}
              </span>
            ))}
          </div>
          <p className="mt-6 text-sm text-fd-muted-foreground">
            10-foot native apps + a browser player.{" "}
            <a href="/docs/platforms" className="text-fd-primary underline">
              See the full platform matrix →
            </a>
          </p>
        </Container>
      </section>

      {/* How it works */}
      <section className="py-20">
        <Container>
          <SectionHeading eyebrow="How it works" title="Three steps from library to live TV" />
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full border border-fd-border text-sm font-semibold text-fd-primary">
                    {i + 1}
                  </span>
                  <s.icon className="size-5 text-fd-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-fd-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Showcase */}
      <section className="pb-20">
        <Container>
          <div className="overflow-hidden rounded-xl border border-fd-border bg-fd-card/30">
            <div className="grid items-center gap-8 p-8 lg:grid-cols-2 lg:p-12">
              <div>
                <SectionHeading
                  center={false}
                  eyebrow="Admin panel"
                  title="Design your lineup, then forget about it"
                  subtitle="Build channels from filters, group them into packages, share them per-viewer, and let the scheduler keep every channel running deterministically — no babysitting."
                />
                <div className="mt-8 flex flex-wrap gap-3">
                  <ButtonLink href="/docs/channels">How channels work</ButtonLink>
                  <ButtonLink href="/channel-guide" variant="secondary">
                    The channel guide
                  </ButtonLink>
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border border-fd-border shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/screenshots/admin-channels.webp" alt="The Airwave admin — channels" className="w-full" />
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Final CTA */}
      <section className="pb-24">
        <Container>
          <div className="relative overflow-hidden rounded-2xl border border-fd-border bg-fd-card/40 px-6 py-16 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -bottom-32 -z-10 mx-auto h-[400px] max-w-3xl opacity-50 blur-3xl"
              style={{
                background:
                  "radial-gradient(closest-side, color-mix(in oklab, var(--color-fd-primary) 30%, transparent), transparent)",
              }}
            />
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Turn your library into a channel you leave on.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-fd-muted-foreground">
              Free, self-hosted, and yours. Deploy the server, connect Plex, and start surfing.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <ButtonLink href="/docs/getting-started">Read the docs</ButtonLink>
              <ButtonLink href="https://github.com/Quixomatic/Airwave" variant="secondary" external>
                GitHub
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}
