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
    links: [
      { text: "Features", url: "/features" },
      { text: "Channel guide", url: "/channel-guide" },
      { text: "Docs", url: "/docs" },
    ],
    githubUrl: "https://github.com/Quixomatic/Airwave",
  };
}
