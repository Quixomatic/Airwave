import { Code2, MessageCircle, Bug, Mail } from "lucide-react";
import { Container, Eyebrow } from "@/components/marketing";

export const metadata = {
  title: "Contact",
  description: "Get in touch — GitHub issues and discussions, or email.",
};

const CHANNELS = [
  { icon: Bug, title: "Report a bug", body: "Something broken? Open an issue with your setup and steps to reproduce.", href: "https://github.com/Quixomatic/Airwave/issues", cta: "Open an issue" },
  { icon: MessageCircle, title: "Ask a question", body: "Setup help, feature ideas, or just showing off your lineup — start a discussion.", href: "https://github.com/Quixomatic/Airwave/discussions", cta: "Start a discussion" },
  { icon: Code2, title: "Browse the code", body: "Airwave is developed in the open. Star it, read the source, or send a pull request.", href: "https://github.com/Quixomatic/Airwave", cta: "View on GitHub" },
  { icon: Mail, title: "Email", body: "For anything that doesn't belong in public — press, security reports, or partnerships.", href: "mailto:contact@getairwave.tv", cta: "contact@getairwave.tv" },
];

export default function ContactPage() {
  return (
    <main className="flex-1">
      <Container className="py-16 text-center sm:py-20">
        <div className="flex justify-center">
          <Eyebrow>Contact</Eyebrow>
        </div>
        <h1 className="mx-auto mt-6 max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
          Get in touch
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-balance text-lg text-fd-muted-foreground">
          Airwave is a community project — most conversations happen in the open on GitHub, where they help
          the next person too.
        </p>
      </Container>

      <section className="pb-20">
        <Container>
          <div className="grid gap-5 sm:grid-cols-2">
            {CHANNELS.map((c) => (
              <a
                key={c.title}
                href={c.href}
                target={c.href.startsWith("http") ? "_blank" : undefined}
                rel={c.href.startsWith("http") ? "noreferrer noopener" : undefined}
                className="group rounded-xl border border-fd-border bg-fd-card/40 p-6 transition-colors hover:border-fd-primary/40"
              >
                <div className="flex size-10 items-center justify-center rounded-lg border border-fd-border bg-fd-background text-fd-primary">
                  <c.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm text-fd-muted-foreground">{c.body}</p>
                <p className="mt-4 text-sm font-medium text-fd-primary group-hover:underline">{c.cta} →</p>
              </a>
            ))}
          </div>
        </Container>
      </section>
    </main>
  );
}
