import { HomeLayout } from "fumadocs-ui/layouts/home";
import type { ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { Footer } from "@/components/footer";

// Marketing group (`/`, `/features`, `/channel-guide`, `/contact`, `/about`, `/faq`, `/privacy`, `/terms`).
// fumadocs' HomeLayout gives the shared header/nav; we add the sitemap Footer, pinned to the bottom on short
// pages via the flex wrapper (content grows, footer sits under it).
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex flex-1 flex-col">
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
    </HomeLayout>
  );
}
