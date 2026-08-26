import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * The marketing-site footer — rendered on every `(home)` page (not the docs, which have their own chrome).
 * A sitemap of columns + a bottom bar. Theme-aware via fumadocs `fd-*` tokens. The sticky-to-bottom behavior
 * comes from the `(home)` layout wrapper (flex column, content `flex-1`), so on short pages it sits at the
 * bottom of the viewport rather than floating mid-screen.
 */

type FooterLink = { label: string; href: string; external?: boolean };

const COLUMNS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Channel guide", href: "/channel-guide" },
      { label: "Platforms", href: "/docs/platforms" },
    ],
  },
  {
    heading: "Documentation",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Quick start", href: "/docs/getting-started" },
      { label: "Self-hosting", href: "/docs/self-hosting" },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "About", href: "/about" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "Blog", href: "/blog" },
      { label: "FAQ", href: "/faq" },
      { label: "GitHub", href: "https://github.com/Quixomatic/Airwave", external: true },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

function FooterLinkItem({ link }: { link: FooterLink }) {
  const className =
    "text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground";
  if (link.external) {
    return (
      <a href={link.href} className={className} target="_blank" rel="noreferrer noopener">
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-12 border-t border-fd-border bg-fd-card/40">
      <div className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
          {/* Brand block */}
          <div className="col-span-2">
            <Link href="/" className="inline-flex" aria-label="Airwave home">
              <Logo markWidth={26} />
            </Link>
            <p className="mt-4 max-w-xs text-sm text-fd-muted-foreground">
              Your Plex library, as custom live TV. Self-hostable, free, and yours.
            </p>
          </div>

          {/* Sitemap columns */}
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fd-foreground">
                {col.heading}
              </h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-fd-border pt-6 text-xs text-fd-muted-foreground sm:flex-row sm:items-center">
          <p>© {year} Airwave. Free and self-hosted.</p>
          <p>
            Not affiliated with Plex, Inc. — Airwave is an independent project that works with your own Plex
            server.
          </p>
        </div>
      </div>
    </footer>
  );
}
