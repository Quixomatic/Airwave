import { cn } from "@/lib/cn";
import { card, heading, Pill, Wide } from "@/components/landing";
import { ClipCarousel, type Clip } from "@/components/clip-carousel";
import { ShaderCta } from "@/components/shaders";

export const metadata = {
  title: "The channel guide",
  description: "Airwave's channel guide — the grid your viewers surf, with a live playhead, a DVR scrubber, favorites, filter lenses, a mini player, bumpers, and program details.",
};

// The split carousel narrates a few marquee features as each clip plays.
const GUIDE_CLIPS: Clip[] = [
  {
    src: "/demos/guide-surf.mp4",
    title: "A grid you surf.",
    subtitle: "Channels down the side, what's-on across the top, and a live playhead marking now. Arrow to a channel and you join it mid-program — exactly where it is on the shared timeline.",
  },
  {
    src: "/demos/dvr-bumper.mp4",
    title: "A DVR scrubber.",
    subtitle: "The program you're in, flanked by the previous tail and the upcoming bumper. Scrub back within the buffer — you just can't jump ahead of live.",
  },
  {
    src: "/demos/lenses.mp4",
    title: "Filter lenses.",
    subtitle: "Packages become lenses in the guide sidebar — Favorites, Recents, and one per package — so a viewer can narrow a big lineup to just what they want.",
  },
  {
    src: "/demos/channel-surf.mp4",
    title: "Channel surfing.",
    subtitle: "Channel up/down steps the lineup without leaving what's playing, and a channel-surf overlay jumps straight to another channel — the muscle memory of a real remote.",
  },
];

type Block = { eyebrow: string; title: string; paras: string[]; cardTitle: string; bullets: string[] };

const BLOCKS: Block[] = [
  {
    eyebrow: "Navigation & the dial",
    title: "Surf it like a real dial.",
    paras: [
      "The guide is a grid — channels down the side, what's-on across the top, and a live playhead marking now. Arrow to any channel and you join it mid-program, exactly where it sits on the timeline everyone shares.",
      "It's built for a remote, not a mouse. Channel up/down, number entry, a channel-surf overlay, and one-press lenses do the work of a real set-top box.",
    ],
    cardTitle: "Everything's one press away.",
    bullets: [
      "Arrow to a channel to join it mid-program at the shared live offset.",
      "Channel up/down steps the lineup without leaving what's playing.",
      "Number entry and a channel-surf overlay jump straight to a channel.",
      "Favorite a channel from the rail — it collects into a Favorites lens.",
      "Package lenses (Favorites, Recents, one per package) narrow a big lineup fast.",
    ],
  },
  {
    eyebrow: "Playback & timeshift",
    title: "Live — with a DVR's controls.",
    paras: [
      "You join what's on now at the right offset, then scrub back within the live buffer. You can't jump ahead of live — that's what keeps every viewer on the same channel at the same moment.",
      "And you never lose your show: a mini player keeps it running while you browse, and full program details are a press away for anything on now, already aired, or coming up.",
    ],
    cardTitle: "You never lose your show.",
    bullets: [
      "Scrub back within the live buffer; you just can't skip ahead of live.",
      "Restart the current program from its beginning, DVR-style.",
      "The mini player keeps the show in a corner while you browse the guide.",
      "Hold OK — or press the green button — to pop straight back to the mini player.",
      "Full details (cast, ratings, summary, how it's playing) for any current, past, or upcoming program.",
    ],
  },
  {
    eyebrow: "Between programs",
    title: "The connective tissue of a real channel.",
    paras: [
      "Programs don't just cut to black. Between them, Airwave plays “Up Next” bumpers — blurred cover art, a countdown, and an optional ambient-music bed mixed from your own tracks — so one show flows into the next.",
      "And it's tunable: set how long breaks run, and every channel always knows what's coming up next, surfaced in the bumper and across the guide.",
    ],
    cardTitle: "Breaks that feel produced.",
    bullets: [
      "“Up Next” bumper cards with blurred cover art and a live countdown.",
      "An optional ambient-music bed under bumpers, faded in and out with the break.",
      "Configurable bumper length — dial the pacing in to taste.",
      "Every channel always knows what's on next, in the bumper and the guide.",
    ],
  },
];

function SplitBlock({ block, reverse }: { block: Block; reverse: boolean }) {
  return (
    <Wide className="mt-16 lg:mt-28">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <div className={cn(reverse && "lg:order-2")}>
          <p className="mb-4 text-xs font-semibold tracking-widest text-brand uppercase">{block.eyebrow}</p>
          <h2 className={heading("h2", "mb-5")}>{block.title}</h2>
          {block.paras.map((p, i) => (
            <p
              key={i}
              className={cn("leading-relaxed text-fd-muted-foreground", i < block.paras.length - 1 && "mb-5")}
            >
              {p}
            </p>
          ))}
        </div>
        <div className={cn(card(), "p-7 md:p-8", reverse && "lg:order-1")}>
          <h3 className="mb-5 text-lg font-medium text-fd-foreground lg:text-xl">{block.cardTitle}</h3>
          <ul className="space-y-4">
            {block.bullets.map((b, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                <span className="text-fd-muted-foreground">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Wide>
  );
}

export default function ChannelGuidePage() {
  return (
    <main className="pt-4 pb-6 text-landing-foreground md:pb-12">
      {/* Hero + the split carousel */}
      <Wide className="pt-10 text-center lg:pt-16">
        <p className="mx-auto w-fit rounded-full border border-brand/50 px-3 py-1.5 text-xs font-medium text-brand">
          The channel guide
        </p>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl leading-tight font-medium text-fd-foreground xl:text-6xl">
          The grid your viewers actually <span className="text-brand">live in</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-fd-muted-foreground md:text-lg">
          A 10-foot channel guide built for a remote — a live playhead, a DVR scrubber, favorites, per-viewer
          lenses, a mini player, and bumpers, all driven off the same deterministic timeline everyone shares.
        </p>
        <ClipCarousel
          variant="split"
          clips={GUIDE_CLIPS}
          className="mx-auto mt-12 max-w-[1200px] text-left"
        />
      </Wide>

      {/* The full feature breakdown — alternating editorial blocks */}
      {BLOCKS.map((block, i) => (
        <SplitBlock key={block.title} block={block} reverse={i % 2 === 1} />
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
        <ShaderCta title="Surf your own library.">
          <Pill href="/docs/getting-started">Get started</Pill>
          <Pill href="/features" variant="secondary">All features</Pill>
        </ShaderCta>
      </Wide>
    </main>
  );
}
