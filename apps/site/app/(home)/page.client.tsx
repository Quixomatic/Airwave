"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/cn";

// The animated hero background is the one third-party piece — @paper-design/shaders-react (WebGL). Loaded
// client-only via next/dynamic (ssr:false) exactly like fumadocs.dev does, so it never runs on the server.
const GrainGradient = dynamic(
  () => import("@paper-design/shaders-react").then((m) => m.GrainGradient),
  { ssr: false },
);
// Dithers an arbitrary image — we feed it the Airwave mark so the hero's dithered shape IS our logo.
const ImageDithering = dynamic(
  () => import("@paper-design/shaders-react").then((m) => m.ImageDithering),
  { ssr: false },
);
// A slow dithered "warp" — a subtle animated texture behind the platforms card (fumadocs' AgnosticBackground).
const Dithering = dynamic(
  () => import("@paper-design/shaders-react").then((m) => m.Dithering),
  { ssr: false },
);

/**
 * The shader glow behind the hero panel — an Airwave-tinted port of fumadocs.dev's hero. A `GrainGradient`
 * wash plus a `Dithering` orb, in our sky-blue/navy palette. Kicked off after a short delay (the shaders
 * error if uniforms aren't ready on slower devices) and paused (`speed: 0`) whenever the hero scrolls out of
 * view, so it isn't burning GPU off-screen.
 */
export function HeroShaders() {
  const dark = useIsDark();
  const ref = useRef<HTMLDivElement | null>(null);
  const visible = useIsVisible(ref);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div ref={ref} className="absolute inset-0 -z-1 overflow-hidden">
      {show && (
        <GrainGradient
          className="absolute inset-0 animate-fd-fade-in duration-800"
          colors={
            dark
              ? ["#2c6494", "#132444", "#0a0f1c00"]
              : ["#93c5fd", "#4a9fe0", "#dbeafe00"]
          }
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
 * The "one app, three screens" preview switcher — a pill toggle sliding between a few TV screenshots that
 * crossfade. Ported from fumadocs.dev's `PreviewImages` (theirs switched docs themes; ours switches between
 * the guide, playback chrome, and a bumper).
 */
export function PreviewImages() {
  const [active, setActive] = useState(0);
  const previews = [
    { src: "/screenshots/appletv-guide.webp", name: "Guide" },
    { src: "/screenshots/appletv-fullchrome.webp", name: "Playing" },
    { src: "/screenshots/appletv-bumper.webp", name: "Bumper" },
  ];

  return (
    <div className="relative grid w-full">
      <div className="absolute bottom-4 left-1/2 z-2 flex -translate-x-1/2 flex-row rounded-full border bg-fd-card p-0.5 shadow-xl">
        <div
          role="none"
          aria-hidden
          className="absolute z-[-1] h-8 w-20 rounded-full bg-fd-primary transition-transform"
          style={{ transform: `translateX(calc(5rem * ${active}))` }}
        />
        {previews.map((item, i) => (
          <button
            key={item.name}
            type="button"
            onClick={() => setActive(i)}
            className={cn(
              "h-8 w-20 rounded-full text-sm font-medium transition-colors",
              active === i ? "text-fd-primary-foreground" : "text-fd-muted-foreground",
            )}
          >
            {item.name}
          </button>
        ))}
      </div>
      {previews.map((item, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={item.name}
          src={item.src}
          alt={`Airwave — ${item.name}`}
          className={cn(
            "col-start-1 row-start-1 w-full select-none rounded-xl transition-opacity duration-500",
            active === i ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />
      ))}
    </div>
  );
}

/**
 * A subtle dithered "warp" texture anchored to the bottom of the platforms card — the Airwave analog of
 * fumadocs.dev's `AgnosticBackground`. Masked to fade out toward the top, and paused when off-screen.
 */
export function AgnosticBackground() {
  const ref = useRef<HTMLDivElement | null>(null);
  const visible = useIsVisible(ref);
  const dark = useIsDark();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 400);
    return () => clearTimeout(t);
  }, []);

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

/** IntersectionObserver visibility of a ref — used to pause the shaders when the hero is off-screen. */
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
