import Link from "next/link";
import type { Metadata } from "next";

import { Container, Eyebrow } from "@/components/marketing";
import { button } from "@/components/landing";
import { BlobBackground } from "@/components/blob-background";

export const metadata: Metadata = {
  title: "Community",
  description:
    "Share your Airwave channel lineups with the community: post what you've built, discover and upvote others' channels, and import them into your own server. Coming soon.",
};

// What the Community Exchange will be — see .plans/community-marketplace.md. This is a scaffold: the page
// exists and is linked, with a "coming soon" state until the feed, accounts (Sign in with Airwave), and
// submit/upvote flows are built.
const PILLARS = [
  {
    title: "Post your lineups",
    body: "Export a channel or a whole package from your server and share it. Others can see exactly how it's built — the filters, the ordering, the bumpers.",
  },
  {
    title: "Discover and upvote",
    body: "Browse the most-loved lineups from the community, sorted by what people actually use. A preview shows what would be on each channel, no library required.",
  },
  {
    title: "Import in a click",
    body: "Found one you like? Pull it straight into your own Airwave server. Filter channels resolve against your library; hand-picked ones match by title.",
  },
];

export default function CommunityPage() {
  return (
    <main className="flex-1">
      {/* Full-width hero so the gradient blob spans the viewport (clipped only at the screen edge) */}
      <div className="relative">
        <BlobBackground variant="ellipse" offsetY={-150} overflow="visible" />
        <Container className="relative z-10 pt-16 sm:pt-20">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Community</Eyebrow>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
              Share your channels with the community
            </h1>
            <p className="mt-4 text-lg text-fd-muted-foreground">
              Post the channel lineups you've built, discover what others are watching, upvote the best,
              and import them into your own Airwave server.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card/40 px-3 py-1 text-sm font-medium text-fd-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fd-primary/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-fd-primary" />
              </span>
              Coming soon
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/roadmap" className={button()}>
                Follow the roadmap
              </Link>
              <Link href="/blog" className={button("secondary")}>
                Read the blog
              </Link>
            </div>
          </div>
        </Container>
      </div>

      {/* What it will be */}
      <Container className="pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-fd-border bg-fd-card/30 p-6 text-left"
            >
              <h2 className="text-base font-semibold text-fd-foreground">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-fd-muted-foreground">
          Only channel definitions and public metadata are ever shared, never any media. Your library stays
          yours.
        </p>
      </Container>
    </main>
  );
}
