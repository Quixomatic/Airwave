import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

/**
 * Shared chrome (nav title + top-level links) used by BOTH the marketing HomeLayout and the DocsLayout, so
 * the header is identical across `/`, `/about`, `/faq`, and `/docs`. Placeholder branding for now — the
 * creative landing pass will replace the wordmark + add real nav/CTAs.
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="font-semibold tracking-tight">
          Airwave
        </span>
      ),
    },
    links: [
      { text: "Docs", url: "/docs" },
      { text: "About", url: "/about" },
      { text: "FAQ", url: "/faq" },
    ],
    githubUrl: "https://github.com/Quixomatic/Airwave",
  };
}
