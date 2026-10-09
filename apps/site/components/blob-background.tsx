"use client";

import * as React from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { cn } from "@/lib/cn";

/**
 * A reusable gradient-blob background (ported from the GuideEngine landing's SectionBackground blob).
 *
 * Drop it inside any `relative` container and it fills it behind the content: a big, blurred SVG blob with
 * a linear-gradient fill. Three shape variants, an optional mount-in animation, an optional subtle pulse,
 * and a scroll-linked parallax (the blob drifts and breathes as the section moves through the viewport).
 *
 *   <section className="relative overflow-hidden">
 *     <BlobBackground variant="ellipse" />
 *     <div className="relative z-10"> …content… </div>
 *   </section>
 */

export type BlobVariant = "organic" | "ellipse" | "spotlight";

export interface ColorStop {
  color: string;
  /** 0-100 */
  offset: number;
}

export interface BlobBackgroundProps {
  /** organic = vertical teardrop, ellipse = horizontal cloud, spotlight = cone pointing up. */
  variant?: BlobVariant;
  /** 2 or 3 plain colors (auto offsets) or explicit ColorStop[]. */
  colors?: [string, string] | [string, string, string] | ColorStop[];
  /** Blob fill opacity (0-1). */
  opacity?: number;
  /** Vertical offset in px (negative = up). Defaults per variant. */
  offsetY?: number;
  /** Blob width in px or CSS value. Defaults per variant. */
  width?: number | string;
  /** Blur radius in px. Defaults per variant. */
  blur?: number;
  /** Subtle blur "breathing" pulse. Defaults on for ellipse, off otherwise. */
  animate?: boolean;
  /** Fade + scale + slide in on mount. Default true. */
  animateIn?: boolean;
  /** Scroll parallax: true for a sensible drift, a number for the drift distance in px, false to disable. */
  parallax?: boolean | number;
  /** Clip to the container (default) or let the blob bleed out. */
  overflow?: "hidden" | "visible";
  /** Extra classes on the positioned wrapper (e.g. `-z-10`, inset tweaks). */
  className?: string;
}

type VariantConfig = {
  viewBox: string;
  path: string;
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  offsetY: number;
  width: number;
  blur: number;
  pulse: boolean;
};

const VARIANTS: Record<BlobVariant, VariantConfig> = {
  ellipse: {
    viewBox: "0 0 1042 635",
    path: "M1041.04 122.355C1036.08 -155.193 824.825 126.214 537.407 131.345C249.988 136.476 -4.75243 -136.614 0.202023 140.934C5.15647 418.483 242.172 639.321 529.59 634.19C817.008 629.059 1045.99 399.903 1041.04 122.355Z",
    x1: "0%",
    y1: "50%",
    x2: "100%",
    y2: "50%",
    offsetY: -320,
    width: 1042,
    blur: 100,
    pulse: true,
  },
  spotlight: {
    viewBox: "0 0 550 515",
    path: "M275,0C204.66,170.03,117.61,312.39,0,404.17c181.52,149.78,364.37,145.75,550,0C406.5,316.58,333.17,172.05,275,0Z",
    x1: "275",
    y1: "0",
    x2: "275",
    y2: "515",
    offsetY: 0,
    width: 800,
    blur: 80,
    pulse: false,
  },
  organic: {
    viewBox: "0 0 1544 1351",
    path: "M0 1054.3C0 1636.57 322.24 1181 748.53 1181c426.29 0 795.2 455.57 795.2-126.7C1543.73 472.024 1198.16 0 771.866 0 345.577 0 0 472.024 0 1054.3Z",
    x1: "70.358",
    y1: "611.063",
    x2: "1367.96",
    y2: "1223.91",
    offsetY: -480,
    width: 1544,
    blur: 208,
    pulse: false,
  },
};

// Airwave brand default: indigo into the Airwave sky-blue, fading to transparent is handled by `opacity`.
const DEFAULT_COLORS: [string, string] = ["#2142E7", "#4a9fe0"];

export function BlobBackground({
  variant = "ellipse",
  colors = DEFAULT_COLORS,
  opacity = 0.3,
  offsetY,
  width,
  blur,
  animate,
  animateIn = true,
  parallax = true,
  overflow = "hidden",
  className,
}: BlobBackgroundProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Scroll-linked parallax: track the wrapper from when it enters the viewport to when it leaves.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const dist = parallax === false ? 0 : typeof parallax === "number" ? parallax : 160;
  const y = useTransform(scrollYProgress, [0, 1], reduce || !dist ? [0, 0] : [-dist / 2, dist / 2]);
  const scale = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    reduce ? [1, 1, 1] : [0.94, 1.08, 0.94],
  );

  const v = VARIANTS[variant];
  const finalOffsetY = offsetY ?? v.offsetY;
  const finalWidth = width ?? v.width;
  const finalBlur = blur ?? v.blur;
  const pulse = (animate ?? v.pulse) && !reduce;

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -z-10",
        overflow === "hidden" ? "overflow-hidden" : "overflow-visible",
        className,
      )}
    >
      <motion.div style={{ y, scale }} className="absolute inset-0 origin-center">
        {/* Dedicated pulse wrapper: carries no other transform, so its scale/opacity breathing composes
            cleanly with the parallax (parent) and the mount animation (child). */}
        <div className={cn("absolute inset-0 origin-center", pulse && "animate-blob-pulse")}>
          <BlobShape
            config={v}
            colors={colors}
            opacity={opacity}
            offsetY={finalOffsetY}
            width={finalWidth}
            blur={finalBlur}
            animateIn={animateIn && !reduce}
            isSpotlight={variant === "spotlight"}
          />
        </div>
      </motion.div>
    </div>
  );
}

function BlobShape({
  config,
  colors,
  opacity,
  offsetY,
  width,
  blur,
  animateIn,
  isSpotlight,
}: {
  config: VariantConfig;
  colors: [string, string] | [string, string, string] | ColorStop[];
  opacity: number;
  offsetY: number;
  width: number | string;
  blur: number;
  animateIn: boolean;
  isSpotlight: boolean;
}) {
  const gradientId = React.useId();
  const widthValue = typeof width === "number" ? `${width}px` : width;

  const isColorStopArray = (c: typeof colors): c is ColorStop[] =>
    c.length > 0 && typeof c[0] === "object" && "color" in c[0];

  const stops = isColorStopArray(colors) ? (
    colors.map((stop, i) => <stop key={i} offset={`${stop.offset}%`} stopColor={stop.color} />)
  ) : colors.length === 2 ? (
    <>
      <stop offset="0%" stopColor={colors[0]} />
      <stop offset="100%" stopColor={colors[1]} />
    </>
  ) : (
    <>
      <stop offset="0%" stopColor={colors[0]} />
      <stop offset="50%" stopColor={colors[1]} />
      <stop offset="100%" stopColor={colors[2]} />
    </>
  );

  const svg = (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox={config.viewBox} className="h-auto w-full">
      <path fill={`url(#${gradientId})`} d={config.path} opacity={opacity} />
      <defs>
        <linearGradient
          id={gradientId}
          x1={config.x1}
          y1={config.y1}
          x2={config.x2}
          y2={config.y2}
          gradientUnits="userSpaceOnUse"
        >
          {stops}
        </linearGradient>
      </defs>
    </svg>
  );

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    width: widthValue,
    height: "auto",
    bottom: 0,
    left: "50%",
    zIndex: 1,
    filter: `blur(${blur}px)`,
    WebkitFilter: `blur(${blur}px)`,
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  if (animateIn) {
    // Spotlight rises from below; the others settle from above.
    const fromY = isSpotlight ? offsetY + 100 : offsetY - 100;
    return (
      <motion.div
        className="pointer-events-none"
        style={baseStyle}
        initial={{ opacity: 0, scale: 0.5, x: "-50%", y: fromY }}
        animate={{ opacity: 1, scale: 1, x: "-50%", y: offsetY }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        {svg}
      </motion.div>
    );
  }

  return (
    <div
      className="pointer-events-none"
      style={{ ...baseStyle, transform: `translate(-50%, ${offsetY}px)` }}
    >
      {svg}
    </div>
  );
}
