import { AirwaveLogo } from "@/components/airwave-logo";
import { BlobBackground } from "@/components/blob-background";
import { ColorSwatch } from "@/components/brand/color-swatch";
import { MarkToolbar } from "@/components/brand/mark-toolbar";
import { Pill, SectionHeader, Wide } from "@/components/landing";
import { Container } from "@/components/marketing";
import { ShaderCta } from "@/components/shaders";

export const metadata = {
  title: "Brand",
  description: "The Airwave logo, colors, and type — download the logomark and grab the brand colors.",
};

/** A labelled preview tile showing the mark (and optionally the wordmark lockup) on a given background. */
function Tile({ tone, children, note }: { tone: "dark" | "light"; children: React.ReactNode; note: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-fd-border">
      <div
        className="flex aspect-[4/3] items-center justify-center p-10"
        style={{ backgroundColor: tone === "dark" ? "#060a14" : "#ffffff" }}
      >
        {children}
      </div>
      <p className="border-t border-fd-border px-4 py-2.5 text-xs text-fd-muted-foreground">{note}</p>
    </div>
  );
}

function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {intro ? <p className="mt-3 max-w-2xl text-fd-muted-foreground">{intro}</p> : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}

// The mark's own gradient colors (from components/airwave-logo.tsx) — the authoritative brand spectrum.
const LOGO_GRADIENT = [
  { name: "Deep blue", hex: "#004A9D" },
  { name: "Ocean", hex: "#0059B5" },
  { name: "Wave blue", hex: "#0675CD" },
  { name: "Sky", hex: "#179AEC" },
  { name: "Cyan", hex: "#43D0F0" },
  { name: "Aqua", hex: "#7EF2F3" },
];

// Core UI palette (from the dark 10-foot theme in app/global.css).
const CORE = [
  { name: "Navy", hex: "#060A14", usage: "Backgrounds" },
  { name: "Surface", hex: "#0B1120", usage: "Cards, panels" },
  { name: "Sky accent", hex: "#4A9FE0", usage: "Links & buttons (dark)" },
  { name: "Blue accent", hex: "#2563EB", usage: "Accent on light" },
  { name: "Foreground", hex: "#F1F5F9", usage: "Primary text" },
  { name: "Muted", hex: "#94A3B8", usage: "Secondary text" },
];

export default function BrandPage() {
  return (
    <main className="flex-1">
      {/* Hero over the same animated gradient blob the blog articles use (full-width wrapper so it isn't
          clipped by the content column). */}
      <div className="relative">
        <BlobBackground variant="ellipse" offsetY={-150} overflow="visible" />
        <Container className="relative z-10 pt-16 sm:pt-20">
          <SectionHeader
            label="Brand"
            title="Airwave brand"
            description="The Airwave logomark, colors, and type. Grab the logo as SVG or PNG, copy a color, and keep the mark recognizable wherever it shows up. Questions about usage? Open an issue on GitHub."
          />
        </Container>
      </div>

      <Container className="pb-16 sm:pb-20">
        <div className="mt-24 space-y-24 sm:mt-32 sm:space-y-28">
          {/* Logomark */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Logomark</h2>
            <p className="mt-3 max-w-2xl text-fd-muted-foreground">
              The cloud-and-wave mark is the core of the brand. It&apos;s a full-color gradient that reads on
              both dark and light backgrounds. Use it on its own in tight spaces, or beside the wordmark.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Tile tone="dark" note="On dark (preferred)">
                <AirwaveLogo className="h-24 w-auto" aria-label="Airwave" />
              </Tile>
              <Tile tone="light" note="On light">
                <AirwaveLogo className="h-24 w-auto" aria-label="Airwave" />
              </Tile>
            </div>
            <div className="mt-5">
              <MarkToolbar />
            </div>
          </section>

          {/* Wordmark lockup */}
          <Section
            title="Wordmark lockup"
            intro="The mark paired with the Airwave wordmark, set in Inter Bold. Keep the spacing between the mark and the word roughly equal to the mark's width."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Tile tone="dark" note="On dark (preferred)">
                <span className="inline-flex items-center gap-3" style={{ color: "#f1f5f9" }}>
                  <AirwaveLogo className="h-12 w-auto" aria-hidden />
                  <span className="text-4xl font-bold tracking-tight">Airwave</span>
                </span>
              </Tile>
              <Tile tone="light" note="On light">
                <span className="inline-flex items-center gap-3" style={{ color: "#0b1120" }}>
                  <AirwaveLogo className="h-12 w-auto" aria-hidden />
                  <span className="text-4xl font-bold tracking-tight">Airwave</span>
                </span>
              </Tile>
            </div>
          </Section>

          {/* Clear space + don'ts */}
          <Section title="Using the logo">
            <ul className="grid gap-3 text-fd-muted-foreground sm:grid-cols-2">
              <li className="rounded-lg border border-fd-border p-4">
                <strong className="text-fd-foreground">Give it room.</strong> Keep clear space around the mark
                of at least half its height. Don&apos;t crowd it with text or other logos.
              </li>
              <li className="rounded-lg border border-fd-border p-4">
                <strong className="text-fd-foreground">Keep the colors.</strong> Use the gradient mark as-is.
                Don&apos;t recolor it, add drop shadows, or apply effects.
              </li>
              <li className="rounded-lg border border-fd-border p-4">
                <strong className="text-fd-foreground">Don&apos;t distort it.</strong> Scale it proportionally.
                Never stretch, squash, rotate, or redraw the mark.
              </li>
              <li className="rounded-lg border border-fd-border p-4">
                <strong className="text-fd-foreground">Mind the background.</strong> Prefer a dark or clean
                light surface. Avoid busy imagery that fights the gradient.
              </li>
            </ul>
          </Section>

          {/* Colors */}
          <Section title="Colors" intro="Click any swatch to copy its hex. Sky-blue is the accent on dark; the deeper blue is the accent on light.">
            <h3 className="text-sm font-semibold text-fd-foreground">Core palette</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {CORE.map((c) => (
                <ColorSwatch key={c.hex} name={c.name} hex={c.hex} usage={c.usage} />
              ))}
            </div>
            <h3 className="mt-8 text-sm font-semibold text-fd-foreground">Logomark gradient</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {LOGO_GRADIENT.map((c) => (
                <ColorSwatch key={c.hex} name={c.name} hex={c.hex} />
              ))}
            </div>
          </Section>

          {/* Typography */}
          <Section
            title="Typography"
            intro="Airwave uses Inter by Rasmus Andersson for everything — product, docs, and marketing. Code and monospaced values use the system monospace stack."
          >
            <div className="rounded-xl border border-fd-border p-8">
              <p className="text-fd-muted-foreground text-sm">Inter</p>
              <p className="mt-2 text-6xl font-bold tracking-tight">Aa</p>
              <p className="mt-6 text-2xl font-normal">Airwave — your library, on live TV</p>
              <p className="mt-1 text-2xl font-medium">Airwave — your library, on live TV</p>
              <p className="mt-1 text-2xl font-semibold">Airwave — your library, on live TV</p>
              <p className="mt-1 text-2xl font-bold">Airwave — your library, on live TV</p>
              <p className="mt-6 text-sm text-fd-muted-foreground">
                Get Inter at{" "}
                <a href="https://rsms.me/inter/" target="_blank" rel="noreferrer noopener" className="text-fd-primary underline">
                  rsms.me/inter
                </a>
                .
              </p>
            </div>
          </Section>

        </div>
      </Container>

      {/* Shared shader CTA — same as the other marketing pages. */}
      <Wide className="mt-16 lg:mt-28">
        <ShaderCta title="Build your own live TV.">
          <Pill href="/docs/getting-started">Get started</Pill>
          <Pill href="https://github.com/Quixomatic/Airwave" variant="secondary" external>
            GitHub
          </Pill>
        </ShaderCta>
      </Wide>
    </main>
  );
}
