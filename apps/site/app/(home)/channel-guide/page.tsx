import { Grid3x3, Rewind, Radio, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { button, card, DemoVideo, heading, Pill, Wide } from "@/components/landing";

export const metadata = {
  title: "The channel guide",
  description: "Airwave's channel guide — the grid your viewers surf, with a live playhead, a DVR scrubber, and per-viewer filter lenses.",
};

type Point = {
  icon: typeof Grid3x3;
  eyebrow: string;
  title: string;
  body: string;
  media: { video?: string; image?: string; alt: string };
};

const POINTS: Point[] = [
  {
    icon: Grid3x3,
    eyebrow: "The grid",
    title: "A grid you surf.",
    body: "Channels down the side, what's-on across the top, and a live playhead marking now. Arrow to a channel and you join it mid-program — exactly where it is on the shared timeline.",
    media: { image: "/screenshots/appletv-guide.webp", alt: "The Airwave channel guide grid" },
  },
  {
    icon: Rewind,
    eyebrow: "Timeshift",
    title: "A DVR scrubber.",
    body: "Every channel has a multi-segment scrubber: the program you're in, flanked by the previous tail and the upcoming bumper. Scrub back within the buffer — you just can't jump ahead of live.",
    media: { video: "/demos/dvr-bumper.mp4", alt: "Scrubbing back into a bumper, then jumping to live" },
  },
  {
    icon: SlidersHorizontal,
    eyebrow: "Lenses",
    title: "Filter lenses.",
    body: "Packages become lenses in the guide sidebar — Favorites, Recents, and one per package — each in its own accent, so a viewer can narrow a big lineup to just what they want.",
    media: { video: "/demos/lenses.mp4", alt: "Applying filter lenses to the guide" },
  },
  {
    icon: Radio,
    eyebrow: "The remote",
    title: "Channel surfing.",
    body: "Channel up/down steps the lineup without leaving what's playing, and a channel-surf overlay jumps straight to another channel — the muscle memory of a real remote.",
    media: { video: "/demos/channel-surf.mp4", alt: "The channel-surf overlay" },
  },
];

export default function ChannelGuidePage() {
  return (
    <main className="pt-4 pb-6 text-landing-foreground md:pb-12">
      {/* Hero */}
      <Wide className="pt-10 text-center lg:pt-16">
        <p className="mx-auto w-fit rounded-full border border-brand/50 px-3 py-1.5 text-xs font-medium text-brand">
          The channel guide
        </p>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl leading-tight font-medium text-fd-foreground xl:text-6xl">
          The grid your viewers actually <span className="text-brand">live in</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-fd-muted-foreground md:text-lg">
          A 10-foot channel guide built for a remote — a live playhead, a DVR scrubber, and per-viewer lenses,
          all driven off the same deterministic timeline everyone shares.
        </p>
        <div className="mx-auto mt-10 max-w-[1100px]">
          <DemoVideo src="/demos/guide-surf.mp4" aria-label="Surfing the Airwave channel guide" className="border-2" />
        </div>
      </Wide>

      {/* Points — alternating media / text */}
      {POINTS.map((p, i) => (
        <Wide key={p.title} className="mt-16 lg:mt-24">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div className={cn(i % 2 === 1 && "lg:order-2")}>
              {p.media.video ? (
                <DemoVideo src={p.media.video} aria-label={p.media.alt} />
              ) : (
                <div className="overflow-hidden rounded-xl border shadow-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.media.image} alt={p.media.alt} className="w-full" />
                </div>
              )}
            </div>
            <div className={cn(i % 2 === 1 && "lg:order-1")}>
              <div className="mb-4 flex items-center gap-2 text-brand">
                <p.icon className="size-5" />
                <span className="text-xs font-semibold tracking-wide uppercase">{p.eyebrow}</span>
              </div>
              <h2 className={heading("h2", "mb-3")}>{p.title}</h2>
              <p className="max-w-md text-fd-muted-foreground">{p.body}</p>
            </div>
          </div>
        </Wide>
      ))}

      {/* Admin preview */}
      <Wide className="mt-16 lg:mt-28">
        <div className={cn(card(), "grid grid-cols-1 items-center gap-8 p-8 lg:grid-cols-2 lg:p-10")}>
          <div>
            <p className="mb-3 text-xs font-semibold tracking-wide text-brand uppercase">In the admin</p>
            <h2 className={heading("h2", "mb-3")}>Preview the guide before anyone tunes in.</h2>
            <p className="mb-6 text-fd-muted-foreground">
              The admin's guide preview shows the same materialized timeline your viewers get, so you can
              sanity-check a lineup — channel order, what's on, and the bumper breaks — before it ships.
            </p>
            <Pill href="/docs/channels/schedule" className="text-sm">How the schedule works</Pill>
          </div>
          <div className="overflow-hidden rounded-xl border shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/screenshots/admin-guidepreview.webp" alt="The Airwave admin guide preview" className="w-full" />
          </div>
        </div>
      </Wide>

      {/* CTA */}
      <Wide className="mt-16 lg:mt-28">
        <div className={cn(card("secondary"), "flex flex-col items-center p-12 text-center")}>
          <h2 className={heading("h2", "mb-4")}>Surf your own library.</h2>
          <div className="flex flex-row flex-wrap items-center justify-center gap-4">
            <Pill href="/docs/getting-started">Get started</Pill>
            <Pill href="/features" variant="secondary">All features</Pill>
          </div>
        </div>
      </Wide>
    </main>
  );
}
