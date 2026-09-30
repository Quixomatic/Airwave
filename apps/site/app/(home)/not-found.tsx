import type { Metadata } from "next";

import { NotFoundContent } from "@/components/not-found-content";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page doesn't exist or has moved.",
};

// 404 boundary for the (home) group (blog, marketing pages). The group layout already renders the header,
// footer, and blur, so this only supplies the body — wrapping it in HomeLayout again is what doubled the
// header. Top-level / docs 404s fall through to the root not-found, which does add the chrome.
export default function NotFound() {
  return <NotFoundContent />;
}
