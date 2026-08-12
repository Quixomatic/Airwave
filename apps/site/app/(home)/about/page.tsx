import { ButtonLink, Container, Eyebrow } from "@/components/marketing";

export const metadata = {
  title: "About",
  description: "Why Airwave exists — I missed the experience of television, so I built a self-hosted way to turn my Plex library back into live TV.",
};

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-8 border-l-2 border-fd-primary pl-5 text-xl font-medium text-fd-foreground">
      {children}
    </blockquote>
  );
}

export default function AboutPage() {
  return (
    <main className="flex-1">
      <Container className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <Eyebrow>About</Eyebrow>
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            I missed TV. So I built Airwave.
          </h1>

          <div className="mt-10 space-y-5 text-lg leading-relaxed text-fd-muted-foreground [&_a]:text-fd-primary [&_a]:underline [&_h2]:mt-14 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-fd-foreground [&_strong]:text-fd-foreground">
            <p>
              Not the cable bill, the commercials, or being stuck with whatever the networks decided to show. I
              missed the <em>experience</em> — turning it on, seeing what&apos;s already playing, dropping into a
              movie halfway through, finding an episode of something I hadn&apos;t watched in years. Something
              just <em>being on</em>, instead of staring at Plex for fifteen minutes trying to decide.
            </p>
            <p>
              And now that I have a son, I wanted him to have that too — except with channels made from our own
              media. So that&apos;s what Airwave became.
            </p>

            <h2>Inspired by the ones who proved it works</h2>
            <p>
              Airwave owes a lot to <strong>NostalgeX</strong> and <strong>BunnyEars TV</strong>. They showed me
              that turning your own library back into live television is every bit as fun as it sounds. But both
              were built around Apple TV and did the work on the device itself — and I wanted this running on my{" "}
              <strong>LG webOS TV</strong>, with the brain living as a real service I self-host next to Plex.
            </p>
            <Quote>The channels belong to your Airwave server — not to a device.</Quote>
            <p>
              The server owns the lineup, the schedules, the packages, the users, the metadata, the playback
              state. The TV apps are just clients that tune in. Open Airwave on the LG, the Apple TV, an iPad,
              Fire TV, or a browser and you&apos;re looking at the same network — the same channels, the same
              guide, the same thing currently airing. It&apos;s much closer to running your own little TV
              provider than launching an app.
            </p>

            <h2>Live — but with a DVR</h2>
            <p>
              When you tune in, you don&apos;t start the file at the beginning. You join whatever&apos;s airing,
              at the point it would actually be. But it isn&apos;t rigid: there&apos;s a full DVR timeline behind
              LIVE. Scrub back through programs that already aired, restart what&apos;s on from the top, jump
              back to an earlier episode. The only thing you can&apos;t do is seek <em>ahead</em> of live.
            </p>
            <p>
              I did exactly that on my son&apos;s Bluey channel the other day — went back a few episodes in the
              channel&apos;s history and started one that had aired earlier, so he could watch from there.
            </p>
            <Quote>The discovery of live TV, without giving up the useful parts of a DVR.</Quote>

            <h2>It gets me watching my own library again</h2>
            <p>
              The other night, <strong>Avengers: Age of Ultron</strong> happened to be on one of my channels. I
              dropped in because it was on — and then just watched the rest of it. I never would have gone into
              Plex and deliberately picked that movie. But stumbling across it, the way you would have on TV
              years ago, pulled me right in. That&apos;s the whole point: it gets me watching things buried in my
              library that I&apos;d forgotten about, instead of endlessly scrolling thumbnails.
            </p>

            <h2>I actually use this</h2>
            <p>
              This isn&apos;t a demo I threw on GitHub. I use Airwave basically every day on my Apple TV. My son
              has his own channels. On a recent road trip he watched a mixed channel of his shows on an iPad for
              a big chunk of the drive — streaming back from our Plex at home, tuning into the <em>same</em>{" "}
              channels we have in the living room, not some separate copy. Most of Airwave&apos;s testing happens
              simply because my family actually uses the thing.
            </p>

            <h2>About the AI part</h2>
            <p>
              I&apos;ll be upfront: Airwave is heavily AI-assisted. I&apos;ve been a full-stack developer for
              10+ years, and I designed the product — the architecture, data model, scheduling and playback
              behavior, the infrastructure and constraints, the UX. I review the work, debug it, test it on real
              hardware, and decide what ships. But Claude Code wrote most of the literal source. I&apos;m less
              interested in who typed each function than in whether the result is understandable, maintainable,
              and actually works.
            </p>

            <h2>I made it because I wanted it</h2>
            <p>
              Not to launch a product. I wanted my channels back. I wanted my son to have channels. I wanted to
              turn on the TV without making a decision — and that old feeling of catching a movie you hadn&apos;t
              thought about in years and going &ldquo;oh, this is on.&rdquo;
            </p>
            <p>
              Streaming solved access to content. But somewhere along the way everything became a catalog, and
              every time you sit down you&apos;re expected to choose exactly what you want. I kind of hate that.
              Airwave is my attempt to bring the other thing back.
            </p>
          </div>

          <div className="mt-12 flex flex-wrap gap-3">
            <ButtonLink href="/docs/getting-started">Get started</ButtonLink>
            <ButtonLink href="https://github.com/Quixomatic/Airwave" variant="secondary" external>
              GitHub
            </ButtonLink>
          </div>
        </div>
      </Container>
    </main>
  );
}
