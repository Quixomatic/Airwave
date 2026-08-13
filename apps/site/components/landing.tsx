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
