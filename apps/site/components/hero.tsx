"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FaGithub } from "react-icons/fa";
import { cn } from "@/lib/cn";
import { button } from "@/components/landing";
import { Wide } from "@/components/landing";
import { ClipCarousel } from "@/components/clip-carousel";
import { HeroClipReel } from "@/components/hero-clips";
import { HeroBadge } from "@/components/hero-badge";
import { HeroDownloadButtons } from "@/components/hero-downloads";
import { HeroShaders, DitheredLogo } from "@/components/shaders";
import type { HeroDownloads } from "@/lib/releases";

// The hero clip reel — the same demo clips as the features page carousel; the guide screenshot is the poster.
export const HERO_REEL = [
  { src: "/demos/guide-surf.mp4", label: "Surf the guide" },
  { src: "/demos/tune-in-info.mp4", label: "Program info" },
  { src: "/demos/channel-surf.mp4", label: "Channel surf" },
  { src: "/demos/restart.mp4", label: "Start over" },
  { src: "/demos/dvr-bumper.mp4", label: "DVR + bumper" },
  { src: "/demos/mini-player.mp4", label: "Mini player" },
  { src: "/demos/lenses.mp4", label: "Filter lenses" },
  { src: "/demos/filtered-pick.mp4", label: "Create channel" },
];

// Staggered fade-up entrance (matches the GuideEngine landing hero: fade + slide-up on load, incremental delay).
const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay },
});

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
            Airwave turns your own media into always-on, channel-surfable live TV with a real guide, DVR, and
            bumpers, streamed straight from your Plex to native apps on every big screen you own.
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
        <HeroShaders constrainLogo subtleLogo />
      </div>

      {/* Constrained content, centered in the wide panel. */}
      <div className="dark relative z-10 text-landing-foreground">
        <Wide>
          <div className="mx-auto max-w-5xl pt-24 pb-6 text-center lg:pt-36 lg:text-left">
            <motion.div {...fadeUp(0)}>
              <HeroBadge clips={HERO_REEL} poster="/screenshots/appletv-guide.webp" className="max-lg:mx-auto" />
            </motion.div>
            <motion.h1
              {...fadeUp(0.1)}
              className="mt-8 max-w-4xl font-display text-[clamp(2.5rem,7vw,4.75rem)] leading-none font-medium tracking-[-0.045em] text-fd-foreground [text-shadow:0_2px_18px_rgb(3_7_18_/_0.6)] max-lg:mx-auto"
            >
              Your library, always on.
              <br />
              Surf it like <span className="text-brand-200">live TV</span>.
            </motion.h1>
            <motion.p
              {...fadeUp(0.2)}
              className="mt-6 mb-10 max-w-2xl text-base text-fd-foreground/85 [text-shadow:0_1px_14px_rgb(3_7_18_/_0.55)] max-lg:mx-auto md:text-lg"
            >
              Airwave turns your own media into always-on, channel-surfable live TV with a real guide, DVR, and
              bumpers, streamed straight from your Plex to native apps on every big screen you own.
            </motion.p>
            <motion.div {...fadeUp(0.3)} className="flex flex-col gap-4 max-lg:items-center">
              <HeroDownloadButtons dl={dl} compact="narrow" />
              <div className="flex flex-row flex-wrap items-center gap-2.5">
                <Link href="/docs/getting-started" className={cn(button("secondary"), "max-[598px]:text-sm")}>
                  Get started
                </Link>
                <GitHubButton />
              </div>
            </motion.div>

            {/* The demo clip reel in the glass frame (straddling the panel's bottom edge), controls below. */}
            <motion.div {...fadeUp(0.4)}>
              <HeroClipReel
                clips={HERO_REEL}
                poster="/screenshots/appletv-guide.webp"
                className="mt-14 lg:mt-16"
              />
            </motion.div>
          </div>
        </Wide>
      </div>
    </section>
  );
}

/**
 * HeroV3 — the same inset shader panel + glass media frame as V2, but laid out SIDE-BY-SIDE: hero copy in the
 * left column and the glass-framed promo player in the right column (fully inside the panel, not hanging off
 * the bottom). Type is scaled down a notch to make room for the two-column layout.
 */
export function HeroV3({ dl }: { dl: HeroDownloads }) {
  return (
    <>
      {/* Below xl, V3's two columns get cramped, so fall back to V2's straddle layout. (CSS swap — the hidden
          hero's shaders auto-pause via their IntersectionObserver, so it's cheap.) */}
      <div className="xl:hidden">
        <HeroV2 dl={dl} />
      </div>

      {/* xl and up: the side-by-side layout. */}
      <section className="relative -mt-4 max-xl:hidden">
      {/* Background panel behind both columns. It ends early at the bottom (leaving an apron) so the dithered
          logo can straddle its bottom-center edge — the V2 straddle trick, applied to the logo instead of the
          video. */}
      <div className="dark absolute inset-x-2 top-2 bottom-[48px] -z-1 overflow-hidden rounded-2xl border bg-fd-background md:inset-x-4 md:top-4 md:bottom-[56px]" />
      <div className="dark absolute inset-x-2 top-2 bottom-[48px] -z-1 overflow-hidden rounded-2xl md:inset-x-4 md:top-4 md:bottom-[56px]">
        <HeroShaders hideLogo />
      </div>

      {/* The dithered mark sitting on the panel's bottom-center edge — a modest hang past it (translate-y-1/3),
          with the apron below giving it room. */}
      <DitheredLogo
        width={300}
        height={220}
        className="pointer-events-none absolute bottom-[48px] left-1/2 z-1 -translate-x-1/2 translate-y-1/3 md:bottom-[56px]"
      />

      {/* pb reserves the apron below the columns so the panel's early end lands at the columns' bottom and the
          off-panel half of the logo sits in the apron (not over the next section). */}
      <div className="dark relative z-10 pb-[48px] text-landing-foreground md:pb-[56px]">
        <Wide>
          <div className="grid items-start gap-10 pt-16 pb-28 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-14 lg:pt-24 lg:pb-40">
            {/* Left — hero copy (same type sizes as V2), staggered fade-up on load. */}
            <div className="text-center lg:text-left">
              <motion.div {...fadeUp(0)}>
                <HeroBadge clips={HERO_REEL} poster="/screenshots/appletv-guide.webp" className="max-lg:mx-auto" />
              </motion.div>
              <motion.h1
                {...fadeUp(0.1)}
                className="mt-8 font-display text-[clamp(2.5rem,7vw,4.75rem)] leading-none font-medium tracking-[-0.045em] text-fd-foreground [text-shadow:0_2px_18px_rgb(3_7_18_/_0.6)]"
              >
                Your library, always on. Surf it like <span className="text-brand-200">live TV</span>.
              </motion.h1>
              <motion.p
                {...fadeUp(0.2)}
                className="mt-6 mb-10 text-base text-fd-foreground/85 [text-shadow:0_1px_14px_rgb(3_7_18_/_0.55)] max-lg:mx-auto max-lg:max-w-xl md:text-lg"
              >
                Airwave turns your own media into always-on, channel-surfable live TV with a real guide, DVR, and
                bumpers, streamed straight from your Plex to native apps on every big screen you own.
              </motion.p>
              <motion.div {...fadeUp(0.3)} className="flex flex-col gap-4 max-lg:items-center">
                <HeroDownloadButtons dl={dl} compact />
                <div className="flex flex-row flex-wrap items-center gap-2.5">
                  <Link href="/docs/getting-started" className={cn(button("secondary"), "text-sm")}>
                    Get started
                  </Link>
                  <GitHubButton />
                </div>
              </motion.div>
            </div>

            {/* Right — the glass media frame, top-aligned with the TITLE (invisible badge-sized spacer + matching
                mt-8), sliding in from the right on load. */}
            <motion.div
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              <p
                aria-hidden
                className="invisible w-fit rounded-full px-3 py-1 text-xs font-medium max-lg:hidden"
              >
                &nbsp;
              </p>
              <HeroClipReel
                clips={HERO_REEL}
                poster="/screenshots/appletv-guide.webp"
                className="lg:mt-8"
              />
            </motion.div>
          </div>
        </Wide>
      </div>
      </section>
    </>
  );
}
