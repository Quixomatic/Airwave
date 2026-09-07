import Link from "next/link";
import { FaGithub } from "react-icons/fa";
import { cn } from "@/lib/cn";
import { button } from "@/components/landing";
import { Wide } from "@/components/landing";
import { ClipCarousel } from "@/components/clip-carousel";
import { HeroPromo } from "@/components/hero-promo";
import { HeroDownloadButtons } from "@/components/hero-downloads";
import { HeroShaders } from "@/components/shaders";
import type { HeroDownloads } from "@/lib/releases";

// The hero shot quietly cycles these once ready (bare carousel — no controls); the guide screenshot is the poster.
export const HERO_REEL = [
  { src: "/demos/guide-surf.mp4" },
  { src: "/demos/mini-player.mp4" },
  { src: "/demos/lenses.mp4" },
];

// GuideEngine's `shadow-glass` is built for a LIGHT page (dark drop-shadows on white). On our dark navy hero
// those shadows vanish and the frame reads flat, so this is the same glass idea re-tuned for a dark backdrop:
// a bright top-edge highlight + a subtle white inner ring for the frosted sheen, plus deep ambient shadows for
// lift where the frame hangs off the panel.
const GLASS_SHADOW =
  "inset 0 1px 0 0 rgba(255,255,255,0.35), inset 0 0 0 1px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.35), 0 16px 40px rgba(0,0,0,0.45), 0 36px 70px rgba(0,0,0,0.4)";
// A top-lit sheen over the frosted fill (the second half of the glass look on dark).
const GLASS_SHEEN = "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03))";

function GitHubButton() {
  return (
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
  );
}

/**
 * HeroV1 — the current shipped hero: one fixed-height, overflow-hidden shader panel that CONTAINS everything,
 * with the demo reel bleeding to the lower-right. Extracted verbatim from `app/(home)/page.tsx`.
 */
export function HeroV1({ dl }: { dl: HeroDownloads }) {
  return (
    <Wide>
      <div className="dark relative isolate flex h-[76vh] max-h-[900px] min-h-[620px] w-full overflow-hidden rounded-2xl border bg-fd-background text-landing-foreground">
        <HeroShaders />
        <ClipCarousel
          variant="bare"
          poster="/screenshots/appletv-guide.webp"
          clips={HERO_REEL}
          className="pointer-events-none absolute top-[74%] left-1/2 z-1 w-[90%] max-w-none -translate-x-1/2 rounded-xl border-2 border-fd-border shadow-2xl shadow-black/40 md:top-[66%] md:left-[38%] md:w-[760px] md:translate-x-0 lg:top-[62%] lg:left-[42%] lg:w-[900px] xl:left-[49%] xl:w-[980px]"
        />
        <div className="z-2 flex size-full flex-col px-4 max-md:items-center max-md:text-center md:p-12">
          <p className="mt-12 w-fit rounded-full border border-brand/50 bg-fd-background/50 px-3 py-1.5 text-xs font-medium text-brand backdrop-blur-md">
            The live-TV layer for your Plex library.
          </p>
          <h1 className="my-8 font-display text-[clamp(2.5rem,7vw,4.75rem)] leading-none font-medium tracking-[-0.045em] text-fd-foreground [text-shadow:0_2px_18px_rgb(3_7_18_/_0.6)] xl:mb-10">
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
            <GitHubButton />
          </div>
        </div>
      </div>
    </Wide>
  );
}

/**
 * HeroV2 — GuideEngine's hero shape: a near-full-width, slightly-inset shader background panel BEHIND
 * constrained content, where the panel ends early (above the section bottom) so the frosted-glass demo frame
 * straddles its lower edge — half on the panel, half off onto the page. Built to match GuideEngine's frame
 * exactly, minus the macOS traffic-light header.
 */
export function HeroV2({ dl }: { dl: HeroDownloads }) {
  return (
    // -mt-4 cancels the page <main>'s pt-4 so the inset panel's own top gutter (top-2/top-4) is the only gap
    // above it — matching GuideEngine's near-full-bleed inset. (V1 keeps the pt-4 as its top gap.)
    <section className="relative -mt-4">
      {/* Background panel — wider than the content column, ends ~clear of the section bottom so the glass
          frame hangs past it. Pinned dark (the shader wash needs the dark tokens). */}
      <div className="dark absolute inset-x-2 top-2 bottom-[200px] -z-1 overflow-hidden rounded-2xl border bg-fd-background md:inset-x-4 md:top-4 md:bottom-[260px]" />
      <div className="dark absolute inset-x-2 top-2 bottom-[200px] -z-1 overflow-hidden rounded-2xl md:inset-x-4 md:top-4 md:bottom-[260px]">
        <HeroShaders constrainLogo />
      </div>

      {/* Constrained content, centered in the wide panel. */}
      <div className="dark relative z-10 text-landing-foreground">
        <Wide>
          <div className="mx-auto max-w-5xl pt-24 pb-6 text-center lg:pt-36 lg:text-left">
            <p className="w-fit rounded-full border border-brand/50 bg-fd-background/50 px-3 py-1.5 text-xs font-medium text-brand backdrop-blur-md max-lg:mx-auto">
              The live-TV layer for your Plex library.
            </p>
            <h1 className="mt-8 max-w-4xl font-display text-[clamp(2.5rem,7vw,4.75rem)] leading-none font-medium tracking-[-0.045em] text-fd-foreground [text-shadow:0_2px_18px_rgb(3_7_18_/_0.6)] max-lg:mx-auto">
              Your library, always on.
              <br />
              Surf it like <span className="text-brand-200">live TV</span>.
            </h1>
            <p className="mt-6 mb-10 max-w-2xl text-base text-fd-foreground/85 [text-shadow:0_1px_14px_rgb(3_7_18_/_0.55)] max-lg:mx-auto md:text-lg">
              Airwave turns your own media into always-on, channel-surfable live TV — a real guide, DVR, and
              bumpers — streamed straight from your Plex to native apps on every big screen you own.
            </p>
            <div className="flex flex-col gap-4 max-lg:items-center">
              <HeroDownloadButtons dl={dl} />
              <div className="flex flex-row flex-wrap items-center gap-2.5">
                <Link href="/docs/getting-started" className={cn(button("secondary"), "max-sm:text-sm")}>
                  Get started
                </Link>
                <GitHubButton />
              </div>
            </div>

            {/* Frosted-glass frame straddling the panel's bottom edge — GuideEngine's frame, no traffic lights,
                re-tuned for the dark backdrop (sheen + top highlight instead of light-mode drop-shadows). */}
            <div
              className="mt-14 rounded-2xl border border-white/15 backdrop-blur-2xl lg:mt-16"
              style={{ boxShadow: GLASS_SHADOW, background: GLASS_SHEEN }}
            >
              <div className="m-2 overflow-hidden rounded-lg bg-fd-background">
                <HeroPromo poster="/screenshots/appletv-guide.webp" clips={HERO_REEL} />
              </div>
            </div>
          </div>
        </Wide>
      </div>
    </section>
  );
}
