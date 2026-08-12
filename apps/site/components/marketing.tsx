import Link from "next/link";
import type { ReactNode } from "react";

/** Shared marketing-page primitives (kept small + consistent so every `(home)` page reads the same). */

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-6 ${className}`}>{children}</div>;
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  external,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  external?: boolean;
}) {
  const cls = `inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
    variant === "primary"
      ? "bg-fd-primary text-fd-primary-foreground hover:opacity-90"
      : "border border-fd-border hover:bg-fd-accent"
  }`;
  if (external) {
    return (
      <a href={href} className={cls} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-fd-border px-3 py-1 text-xs font-medium text-fd-muted-foreground">
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  center = true,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow ? (
        <p className="text-sm font-semibold text-fd-primary">{eyebrow}</p>
      ) : null}
      <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle ? <p className="mt-4 text-balance text-lg text-fd-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

/** A shared shell for the legal pages (Privacy, Terms) — a readable prose column. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="flex-1">
      <Container className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-fd-muted-foreground">Last updated: {updated}</p>
          <div className="mt-10 space-y-5 leading-relaxed text-fd-muted-foreground [&_a]:text-fd-primary [&_a]:underline [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-fd-foreground [&_li]:ml-1 [&_strong]:text-fd-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
            {children}
          </div>
        </div>
      </Container>
    </main>
  );
}
