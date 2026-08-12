import { Grid3x3, Rewind, Radio, SlidersHorizontal } from "lucide-react";
import { ButtonLink, Container, Eyebrow, SectionHeading } from "@/components/marketing";

export const metadata = {
  title: "The channel guide",
  description: "Airwave's channel guide — the grid your viewers surf, with a live playhead, a DVR scrubber, and per-viewer filter lenses.",
};

const POINTS = [
  { icon: Grid3x3, title: "A grid you surf", body: "Channels down the side, what's-on across the top, and a live playhead marking now. Arrow to a channel and you join it mid-program — exactly where it is on the shared timeline." },
  { icon: Rewind, title: "A DVR scrubber", body: "Every channel has a multi-segment scrubber: the program you're in, flanked by the previous tail and the upcoming bumper. Scrub back within the buffer; you just can't jump ahead of live." },
  { icon: SlidersHorizontal, title: "Filter lenses", body: "Packages become lenses in the guide sidebar — Favorites, Recents, and one per package — each in its own accent, so a viewer can narrow a big lineup to just what they want." },
  { icon: Radio, title: "Channel surfing", body: "Channel up/down steps the lineup without leaving what's playing, and a number-entry jumps straight to a channel — the muscle memory of a real remote." },
];

export default function ChannelGuidePage() {
  return (
    <main className="flex-1">
      <Container className="py-16 text-center sm:py-20">
        <div className="flex justify-center">
          <Eyebrow>The channel guide</Eyebrow>
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
          The grid your viewers actually live in
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-fd-muted-foreground">
          A 10-foot channel guide built for a remote — a live playhead, a DVR scrubber, and per-viewer lenses,
          all driven off the same deterministic timeline everyone shares.
        </p>
        <div className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-xl border border-fd-border shadow-2xl shadow-black/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/screenshots/appletv-guide.webp" alt="The Airwave channel guide on Apple TV" className="w-full" />
        </div>
      </Container>

      <section className="border-t border-fd-border py-16">
        <Container>
          <div className="grid gap-10 sm:grid-cols-2">
            {POINTS.map((p) => (
              <div key={p.title} className="flex gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-fd-border bg-fd-card/40 text-fd-primary">
                  <p.icon className="size-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm text-fd-muted-foreground">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-t border-fd-border py-16">
        <Container>
          <div className="overflow-hidden rounded-xl border border-fd-border bg-fd-card/30">
            <div className="grid items-center gap-8 p-8 lg:grid-cols-2 lg:p-12">
              <div>
                <SectionHeading
                  center={false}
                  eyebrow="In the admin"
                  title="Preview the guide before anyone tunes in"
                  subtitle="The admin's guide preview shows the same materialized timeline your viewers get, so you can sanity-check a lineup — channel order, what's on, and the bumper breaks — before it ships."
                />
                <div className="mt-8">
                  <ButtonLink href="/docs/channels/schedule">How the schedule works</ButtonLink>
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border border-fd-border shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/screenshots/admin-guidepreview.webp" alt="The Airwave admin guide preview" className="w-full" />
              </div>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}
