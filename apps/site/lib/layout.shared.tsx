import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Logo } from "@/components/logo";

/**
 * Shared chrome (nav title + top-level links) used by BOTH the marketing HomeLayout and the DocsLayout, so
 * the header is identical across `/`, `/about`, `/faq`, and `/docs`. The wordmark is the Airwave brand mark
 * (rebuilt from the admin app's `Logo`).
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Logo />,
    },
    // Keep the marquee items top-level; tuck the secondary ones behind a native fumadocs "Resources" menu.
    // The logo (nav title) links home to `/` by default.
    // `on: "nav"` keeps each item in the TOP NAV only — not duplicated in the docs sidebar menu, which now
    // has its own switcher (see `app/docs/layout.tsx` sidebar tabs).
    links: [
      { text: "Documentation", url: "/docs", on: "nav" },
      { text: "Features", url: "/features", on: "nav" },
      { text: "Channel guide", url: "/channel-guide", on: "nav" },
      { text: "FAQ", url: "/faq", on: "nav" },
      {
        type: "menu",
        text: "Resources",
        on: "nav",
        items: [
          { text: "Blog", description: "News + the occasional dev-log", url: "/blog" },
          { text: "About", description: "Why Airwave exists", url: "/about" },
          { text: "Contact", description: "Get in touch", url: "/contact" },
          { text: "Platforms", description: "What it runs on", url: "/docs/platforms" },
        ],
      },
    ],
    githubUrl: "https://github.com/Quixomatic/Airwave",
  };
}
