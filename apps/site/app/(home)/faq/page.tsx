import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import type { ReactNode } from "react";
import { Container, Eyebrow } from "@/components/marketing";

export const metadata = {
  title: "FAQ",
  description: "Common questions about Airwave — what it is, how it's different from Plex, platforms, self-hosting, privacy, and pricing.",
};

type QA = { q: string; a: ReactNode };
const GROUPS: { heading: string; items: QA[] }[] = [
  {
    heading: "The basics",
    items: [
      { q: "What is Airwave?", a: "Think Pluto TV or an old cable box, except every channel is yours — built from your own Plex library and running on your own hardware. Airwave turns your media into always-on channels with a real 10-foot channel guide." },
      { q: "How is this different from just using Plex?", a: "Plex is a catalog you pick from. Airwave is a channel you leave on. You don't choose a file and start it at 0:00 — you tune into whatever's already airing and surf. It's built for stumbling onto things, not for making a decision every time you sit down." },
      { q: "Is it live TV or on-demand?", a: "Both, in the way that matters. Channels air on a real, always-running schedule that everyone sees in sync — that's the “live” part. But there's a full DVR behind LIVE: scrub back through what already aired, restart the current program, or jump to an earlier episode. The only thing you can't do is seek ahead of live." },
      { q: "What inspired it?", a: "NostalgeX and BunnyEars TV, which proved the idea is as fun as it sounds. Airwave is a server-first, multi-platform take on the same concept." },
      { q: "Do I choose exactly what plays, and when?", a: "You control what's eligible — you define each channel's pool with a filter (or a Plex collection, playlist, or hand-picked set) and how it's ordered. Airwave builds the actual back-to-back schedule for you, deterministically, so you're not hand-programming every time slot. Prefer a marathon, a strict rotation, or “no repeats within an hour”? Those are options too." },
    ],
  },
  {
    heading: "Watching",
    items: [
      { q: "What can I build channels from?", a: "Metadata filters (genre, year, network, cast, rating, “added in the last N days,” and more), Plex collections, playlists, or hand-picked media — plus grouping and rotation: marathons, round-robins, duration/count blocks, and no-repeat windows." },
      { q: "Do all my devices show the same thing?", a: "Yes. The lineup lives on the server, so every client — living room, bedroom, an iPad on a trip — tunes into the same channels and the same thing currently airing. There's no per-device copy of your channels." },
      { q: "Does it work away from home?", a: "Yes. Clients probe local → remote → relay and stream from the right Plex connection, so the same channels work on the road (as long as your Plex server is set up for remote access)." },
      { q: "Are there bumpers or music?", a: "Optionally, yes — “Up Next” interstitials between programs with cover art, plus an optional ambient music bed mixed from your own tracks." },
    ],
  },
  {
    heading: "Setup & platforms",
    items: [
      { q: "Do I need Plex?", a: "Yes. Airwave builds channels from, and streams from, your existing Plex library." },
      { q: "Do I need Plex Pass?", a: "No — not for Airwave itself. The remote-access checks that can require Plex Pass live in the official Plex apps, client-side; Airwave talks directly to your Plex server's API, so there's no Plex Pass gate. (Streaming from outside your home still requires your Plex server to be reachable remotely.)" },
      { q: "Does it support Jellyfin or Emby?", a: "Not yet — Plex only, for now. The data model already reserves Jellyfin and Emby and they're on the roadmap, but only Plex is wired up today." },
      { q: "Will Plex block or ban it?", a: "Unlikely. Airwave uses the officially documented Plex API with Plex's recommended sign-in flow — the same endpoints the wider Plex ecosystem relies on." },
      { q: "What can I watch it on?", a: "Apple TV, iPad, Android TV, Fire TV, LG webOS, and any browser. More clients are planned." },
      { q: "How do I run the server?", a: "It's self-hosted with Docker and PostgreSQL — one image, deploy with compose, update by pulling a new tag. It runs well on a NAS. The docs walk through it." },
      { q: "Can I share it with my family?", a: "Yes. Packages group channels, and per-user access control lets you grant everything, a whole package (future channels included), or specific channels — all enforced on the server." },
    ],
  },
  {
    heading: "Privacy, pricing & the project",
    items: [
      { q: "Is my data private?", a: "Yes. Airwave is self-hosted with no telemetry — your library, viewers, and watch history stay on your server, and your Plex token is encrypted at rest. Nothing phones home." },
      { q: "Is it free?", a: "The server, admin panel, and browser player are free and source-available to run and tinker with. You can build and sideload the native apps yourself too; the prebuilt App Store / Play versions are a small paid convenience." },
      { q: "Can I try it before buying the apps?", a: "Yes. The server, admin panel, and browser player are free, and you can build and sideload the native apps from source. The paid store builds are just a convenience — the app itself isn't paywalled." },
      { q: "Is it really mostly AI-written?", a: "Yes, and it's stated plainly on the About page: designed and directed by a developer with 10+ years of experience, with most of the literal code written by Claude Code — all reviewed, debugged, and tested on real hardware." },
      { q: "Can I move my lineup between servers?", a: "Yes. Export your packages, channels, and filters and import them into another Airwave instance, with de-duplication and a dry-run." },
      { q: "Is it affiliated with Plex?", a: "No. Airwave is an independent project that works with a Plex server you own and control. It isn't affiliated with, endorsed by, or sponsored by Plex, Inc." },
    ],
  },
];

export default function FaqPage() {
  return (
    <main className="flex-1">
      <Container className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <Eyebrow>FAQ</Eyebrow>
            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Frequently asked questions
            </h1>
            <p className="mt-4 text-lg text-fd-muted-foreground">
              The short answers. For the long version, the{" "}
              <a href="/docs" className="text-fd-primary underline">
                docs
              </a>{" "}
              go deep.
            </p>
          </div>

          <div className="mt-12 space-y-10">
            {GROUPS.map((group) => (
              <div key={group.heading}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fd-muted-foreground">
                  {group.heading}
                </h2>
                <Accordions type="single">
                  {group.items.map((item) => (
                    <Accordion key={item.q} title={item.q}>
                      {item.a}
                    </Accordion>
                  ))}
                </Accordions>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}
