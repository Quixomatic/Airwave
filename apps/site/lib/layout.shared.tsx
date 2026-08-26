import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Logo } from "@/components/logo";

/**
 * Shared chrome (nav title + top-level links) used by BOTH the marketing HomeLayout and the DocsLayout, so
 * the header is identical across `/`, `/about`, `/faq`, and `/docs`. The wordmark is the Airwave brand mark
 * (rebuilt from the admin app's `Logo`).
 */
export function baseOptions(context: "home" | "docs" = "home"): BaseLayoutProps {
  // The DOCS layout pins links to the navbar only (`on: "nav"`) so they don't duplicate into the docs
  // sidebar, which has its own switcher (see `app/docs/layout.tsx` sidebar tabs). The HOME/marketing layout
  // leaves `on` unset — the fumadocs default shows links in BOTH the desktop navbar and the mobile hamburger
  // menu. (Using `on: "nav"` everywhere is what emptied the marketing mobile menu: per fumadocs, `on: "nav"`
  // is "only displayed on navbar, not mobile menu".)
  const on = context === "docs" ? ("nav" as const) : undefined;
  return {
    nav: {
      title: <Logo />,
    },
    // Keep the marquee items top-level; tuck the secondary ones behind a native fumadocs "Resources" menu.
    // The logo (nav title) links home to `/` by default.
    links: [
      { text: "Documentation", url: "/docs", on },
      { text: "Features", url: "/features", on },
      { text: "Channel guide", url: "/channel-guide", on },
      { text: "Roadmap", url: "/roadmap", on },
      { text: "FAQ", url: "/faq", on },
      {
        type: "menu",
        text: "Resources",
        on,
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
