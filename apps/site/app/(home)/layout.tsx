import { HomeLayout } from "fumadocs-ui/layouts/home";
import type { ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";

// Marketing group (`/`, `/about`, `/faq`) — fumadocs' HomeLayout gives us the shared header/nav + footer
// slot for free, so the marketing pages and /docs stay visually cohesive. The creative landing pass builds
// its hero/sections as the page content inside this shell.
export default function Layout({ children }: { children: ReactNode }) {
  return <HomeLayout {...baseOptions()}>{children}</HomeLayout>;
}
