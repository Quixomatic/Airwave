import type { Metadata } from "next";

export const metadata: Metadata = { title: "About" };

// PLACEHOLDER — replaced in the creative pass with the real story/positioning.
export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">About Airwave</h1>
      <div className="mt-6 space-y-4 text-fd-muted-foreground">
        <p>
          Airwave is a self-hostable service that turns your Plex library into custom, always-on live-TV
          channels — the experience of flipping through cable, built entirely from media you already own.
        </p>
        <p>
          It runs as an admin-panel server you host yourself, with native apps that stream directly from your
          Plex on webOS, Apple TV, iPad, Android TV, and Fire TV. Free and self-hosted, no subscription.
        </p>
        <p className="text-sm italic">This page is a placeholder — full story coming soon.</p>
      </div>
    </main>
  );
}
