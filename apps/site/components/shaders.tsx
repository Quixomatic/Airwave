"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

// The animated backgrounds are the one third-party piece — @paper-design/shaders-react (WebGL). Loaded
// client-only via next/dynamic (ssr:false) exactly like fumadocs.dev does, so they never run on the server.
const GrainGradient = dynamic(
  () => import("@paper-design/shaders-react").then((m) => m.GrainGradient),
  { ssr: false },
);
// Dithers an arbitrary image — we feed it the Airwave mark so the dithered shape IS our logo.
const ImageDithering = dynamic(
  () => import("@paper-design/shaders-react").then((m) => m.ImageDithering),
  { ssr: false },
);
// A slow dithered "warp" — a subtle animated texture (fumadocs' AgnosticBackground).
const Dithering = dynamic(
  () => import("@paper-design/shaders-react").then((m) => m.Dithering),
  { ssr: false },
);

const HERO_GRAIN_DARK = ["#2c6494", "#132444", "#0a0f1c00"];
const HERO_GRAIN_LIGHT = ["#93c5fd", "#4a9fe0", "#dbeafe00"];

/**
 * The full shader glow behind the home hero panel — a `GrainGradient` wash + the dithered Airwave logo.
 * Kicked off after a short delay (the shaders error if uniforms aren't ready on slower devices) and paused
 * (`speed: 0`) whenever it scrolls off-screen so it isn't burning GPU.
 */
export function HeroShaders() {
  const dark = useIsDark();
  const ref = useRef<HTMLDivElement | null>(null);
  const visible = useIsVisible(ref);
  const show = useDeferredShow();

  return (
    <div ref={ref} className="absolute inset-0 -z-1 overflow-hidden">
      {show && (
        <GrainGradient
          className="absolute inset-0 animate-fd-fade-in duration-800"
          colors={dark ? HERO_GRAIN_DARK : HERO_GRAIN_LIGHT}
          colorBack="#00000000"
          softness={1}
          intensity={dark ? 0.7 : 0.9}
          noise={0.5}
          speed={visible ? 1 : 0}
          shape="corners"
          minPixelRatio={1}
          maxPixelCount={1920 * 1080}
        />
      )}
      {show && (
        <ImageDithering
          image="/logo-lit.png"
          width={470}
          height={340}
          colorBack="#00000000"
          colorFront={dark ? "#4a9fe0" : "#3f8fd0"}
          colorHighlight={dark ? "#8ec5f0" : "#6aa8e0"}
          type="4x4"
          size={2.5}
          fit="contain"
          speed={0}
          className="absolute animate-fd-fade-in duration-400 max-lg:-right-6 max-lg:-bottom-6 max-lg:opacity-60 lg:top-[7%] lg:right-[4%]"
          minPixelRatio={1}
        />
      )}
    </div>
  );
}

/**
 * A compact call-to-action panel with the hero's shader treatment scaled down for a short band: the moving
 * `GrainGradient` wash + a smaller dithered Airwave logo anchored right. Content (heading + buttons) is
 * passed in, so each page gets its own copy/CTAs. Its own thing — deliberately not the full-size hero.
 */
export function ShaderCta({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const dark = useIsDark();
  const ref = useRef<HTMLDivElement | null>(null);
  const visible = useIsVisible(ref);
  const show = useDeferredShow();

  return (
    <div
      ref={ref}
      className="relative flex min-h-[240px] flex-col justify-center overflow-hidden rounded-2xl border px-8 py-12 md:px-12"
    >
      <div className="absolute inset-0 -z-1 overflow-hidden">
        {show && (
          <GrainGradient
            className="absolute inset-0 animate-fd-fade-in duration-800"
            colors={dark ? HERO_GRAIN_DARK : HERO_GRAIN_LIGHT}
            colorBack="#00000000"
            softness={1}
            intensity={dark ? 0.6 : 0.85}
            noise={0.5}
            speed={visible ? 1 : 0}
            shape="corners"
            // The CTA is a short, wide band — without a zoom the blobs render tiny against its narrow
            // height. Scale the pattern up (+ cover-fit) so the moving shapes read large.
            scale={1.8}
            fit="cover"
            minPixelRatio={1}
            maxPixelCount={1920 * 1080}
          />
        )}
        {show && (
          <ImageDithering
            image="/logo-lit.png"
            width={280}
            height={205}
            colorBack="#00000000"
            colorFront={dark ? "#4a9fe0" : "#3f8fd0"}
            colorHighlight={dark ? "#8ec5f0" : "#6aa8e0"}
            type="4x4"
            size={2}
            fit="contain"
            speed={0}
            className="absolute top-1/2 right-[2%] -translate-y-1/2 animate-fd-fade-in duration-400 max-md:right-[-8%] max-md:opacity-40"
            minPixelRatio={1}
          />
        )}
      </div>

      <div className="z-2 max-w-xl">
        <h2
          className={`text-2xl leading-tight font-medium tracking-tight text-fd-foreground [text-shadow:0_2px_16px_rgb(3_7_18_/_0.55)] lg:text-3xl ${subtitle ? "mb-3" : "mb-6"}`}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mb-6 max-w-lg text-fd-foreground/80 [text-shadow:0_1px_12px_rgb(3_7_18_/_0.5)]">
            {subtitle}
          </p>
        )}
        <div className="flex flex-row flex-wrap items-center gap-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * A subtle dithered "warp" texture anchored to the bottom of a card — the Airwave analog of fumadocs.dev's
 * `AgnosticBackground`. Masked to fade out toward the top, and paused when off-screen.
 */
export function AgnosticBackground() {
  const ref = useRef<HTMLDivElement | null>(null);
  const visible = useIsVisible(ref);
  const dark = useIsDark();
  const show = useDeferredShow();

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 -z-1"
      style={{
        maskImage: "linear-gradient(to top, white 12%, transparent 78%)",
        WebkitMaskImage: "linear-gradient(to top, white 12%, transparent 78%)",
      }}
    >
      {show && (
        <Dithering
          colorBack="#00000000"
          colorFront={dark ? "#183a63" : "#cddff4"}
          shape="warp"
          type="4x4"
          speed={visible ? 0.4 : 0}
          className="size-full"
          minPixelRatio={1}
        />
      )}
    </div>
  );
}

/** Defer mounting the shaders ~400ms (they error if uniforms aren't ready on slower devices). */
function useDeferredShow() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 400);
    return () => clearTimeout(t);
  }, []);
  return show;
}

/** Tracks the site theme by watching the `.dark` class on <html> — avoids pulling in next-themes just to
 * pick shader colors. Defaults to dark (the site's default theme) before hydration. */
function useIsDark() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains("dark"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/** IntersectionObserver visibility of a ref — used to pause the shaders when off-screen. */
function useIsVisible(ref: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) setVisible(entry.isIntersecting);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return visible;
}
