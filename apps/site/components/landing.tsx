import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The shared landing design system — the fumadocs.dev-style patterns first used on the home page, extracted
 * so every marketing page (Features, Channel guide, …) reads the same: spacious rounded-2xl panels + a small
 * set of cva-style variant helpers backed by the `--brand*` tokens in `global.css`.
 */

export const heading = (variant: "h2" | "h3", extra = "") =>
  cn(
    "font-medium tracking-tight",
    variant === "h2" ? "text-3xl lg:text-4xl" : "text-xl lg:text-2xl",
    extra,
  );

export const button = (variant: "primary" | "secondary" = "primary", extra = "") =>
  cn(
    "inline-flex justify-center px-5 py-3 rounded-full font-medium tracking-tight transition-colors",
    variant === "primary"
      ? "bg-brand text-brand-foreground hover:bg-brand-200"
      : "border bg-fd-secondary text-fd-secondary-foreground hover:bg-fd-accent",
    extra,
  );

export const card = (variant: "default" | "secondary" = "default", extra = "") =>
  cn(
    "rounded-2xl text-sm p-6 shadow-lg",
    variant === "secondary"
      ? "bg-brand-secondary text-brand-secondary-foreground"
      : "border bg-fd-card",
    extra,
  );

/** Wide, spacious landing gutter (matches fumadocs.dev's 1400px canvas). */
export function Wide({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1400px] px-6 md:px-12", className)}>{children}</div>;
}

/**
 * A section header — label pill + display heading + description — built on our theme tokens: a subtle
 * muted pill, a big `font-display` heading (`clamp(2.5rem,7vw,4.75rem)`, tight tracking, balanced), and
 * a muted description capped at 34rem. Left-aligned by default (`center` mirrors it). Pair with
 * `<ScrollReveal>` for the fade-up, and put it at the top of a `<Section>` (or any container). Pass
 * `titleCh` to clamp the heading width in `ch` for clean line-wraps.
 */
export function SectionHeader({
  label,
  title,
  description,
  center = false,
  titleCh,
  className = "",
}: {
  label?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  center?: boolean;
  titleCh?: number;
  className?: string;
}) {
  return (
    <div className={cn(center ? "flex flex-col items-center text-center" : "text-left", className)}>
      {label ? (
        <p className="mb-4 w-fit rounded-full bg-fd-muted px-3.5 py-2 text-xs font-bold tracking-[0.03em] text-fd-muted-foreground">
          {label}
        </p>
      ) : null}
      <h2
        className="mb-4 font-display text-[clamp(2.5rem,7vw,4.75rem)] leading-none font-bold tracking-[-0.045em] text-balance text-fd-foreground"
        style={titleCh ? { maxWidth: `${titleCh}ch` } : undefined}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            "max-w-[34rem] text-[clamp(1rem,2vw,1.125rem)] leading-[1.7] text-fd-muted-foreground",
            center && "mx-auto",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** A major page section with plezy's vertical rhythm (`clamp(4rem,9vw,8rem)` block padding) + a
 *  centered content column. Width defaults to a readable 72rem; override with `className`. */
export function Section({
  children,
  id,
  className = "",
}: {
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "mx-auto w-full max-w-6xl px-6 py-[clamp(4rem,9vw,8rem)] md:px-12",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** A pill button/link — used for CTAs. */
export function Pill({
  href,
  children,
  variant = "primary",
  external,
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  external?: boolean;
  className?: string;
}) {
  const cls = button(variant, className);
  return external ? (
    <a href={href} className={cls} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
