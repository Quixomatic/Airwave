import Link from "next/link";

// PLACEHOLDER landing page — a real, cohesive hero goes here in the creative pass. Kept intentionally
// simple + on-brand so the scaffold looks deliberate, not like an unstyled Next default.
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <span className="mb-4 rounded-full border border-fd-border px-3 py-1 text-xs font-medium text-fd-muted-foreground">
        Self-hostable · Plex-powered · Free
      </span>
      <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
        Your Plex library, as custom live TV.
      </h1>
      <p className="mt-6 max-w-xl text-balance text-lg text-fd-muted-foreground">
        Airwave turns your own media into always-on, channel-surfable live TV — with a real guide, DVR, and
        bumpers — on webOS, Apple TV, iPad, Android TV, and Fire TV.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/docs"
          className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
        >
          Read the docs
        </Link>
        <a
          href="https://github.com/Quixomatic/Airwave"
          className="rounded-lg border border-fd-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
        >
          GitHub
        </a>
      </div>
    </main>
  );
}
