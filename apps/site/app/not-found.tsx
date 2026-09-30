import { HomeLayout } from "fumadocs-ui/layouts/home";
import type { Metadata } from "next";

import { BottomBlur } from "@/components/bottom-blur";
import { Footer } from "@/components/footer";
import { NotFoundContent } from "@/components/not-found-content";
import { baseOptions } from "@/lib/layout.shared";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page doesn't exist or has moved.",
};

// Root 404 boundary — serves top-level and /docs 404s, which are wrapped only by the bare root layout, so this
// one supplies the header/footer/blur itself. The (home) group has its OWN not-found (which skips the chrome,
// since the group layout already provides it), so blog/marketing 404s don't double the header.
export default function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex flex-1 flex-col">
        <div className="flex-1">
          <NotFoundContent />
        </div>
        <Footer />
      </div>
      <BottomBlur />
    </HomeLayout>
  );
}
