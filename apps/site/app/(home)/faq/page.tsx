import type { Metadata } from "next";

export const metadata: Metadata = { title: "FAQ" };

const faqs = [
  {
    q: "What is Airwave?",
    a: "A self-hostable service that turns your Plex library into custom, always-on live-TV channels — with a guide, DVR, and bumpers.",
  },
  {
    q: "Do I need Plex?",
    a: "Yes. Airwave builds channels from your existing Plex library and streams directly from your Plex server.",
  },
  {
    q: "What can I watch it on?",
    a: "webOS (LG TVs), Apple TV, iPad, Android TV, and Fire TV, plus a web player.",
  },
  {
    q: "Is it free?",
    a: "Yes — Airwave is free and self-hosted. You run the server; there's no subscription.",
  },
];

// PLACEHOLDER — the creative pass can restyle this (accordions, sections, etc.).
export default function FaqPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">Frequently asked questions</h1>
      <dl className="mt-8 space-y-8">
        {faqs.map((item) => (
          <div key={item.q}>
            <dt className="font-medium">{item.q}</dt>
            <dd className="mt-2 text-fd-muted-foreground">{item.a}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
