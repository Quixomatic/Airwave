import "./global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Inter } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import type { Metadata } from "next";

// Umami — self-hosted, privacy-friendly analytics. Configured via env so nothing instance-specific lives in
// the (source-available) repo: set NEXT_PUBLIC_UMAMI_SRC + NEXT_PUBLIC_UMAMI_WEBSITE_ID in the Vercel
// PRODUCTION environment. Rendered only on the production deploy (and only when both are set), so local dev,
// Vercel previews, and anyone who clones the repo don't count against the real stats. Umami auto-tracks App
// Router client-side navigation, so no per-route pageview calls are needed.
const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SRC;
const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Airwave · your Plex library as custom live TV",
    template: "%s · Airwave",
  },
  description:
    "Airwave is a self-hostable service that turns your Plex library into custom, always-on live-TV channels. Watch on webOS, Apple TV, iPad, Android TV, and Fire TV.",
  metadataBase: new URL("https://getairwave.tv"),
  // Social/rich-share cards. The og:image / twitter:image come from app/opengraph-image.png +
  // app/twitter-image.png (Next's file convention adds them with dimensions); this fills in the rest.
  openGraph: {
    type: "website",
    siteName: "Airwave",
    url: "https://getairwave.tv",
    title: "Airwave · your Plex library as custom live TV",
    description:
      "Turn your Plex library into custom, always-on live-TV channels. Watch on webOS, Apple TV, iPad, Android TV, and Fire TV.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Airwave · your Plex library as custom live TV",
    description:
      "Turn your Plex library into custom, always-on live-TV channels. Watch on webOS, Apple TV, iPad, Android TV, and Fire TV.",
  },
};

// Site-wide structured data: the Organization (brand entity + logo) and WebSite. Emitted on every page so
// search engines can attach the brand knowledge panel / sitelinks; page-specific JSON-LD (Article,
// VideoObject) is added by the individual pages.
const SITE_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Airwave",
    url: "https://getairwave.tv",
    logo: "https://getairwave.tv/logo.png",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Airwave",
    url: "https://getairwave.tv",
  },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger -- static structured data
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }}
        />
        {/* Default to dark — the navy 10-foot brand is the intended first impression. The theme toggle still
            works and persists per-visitor; we just don't follow the OS preference by default. */}
        <RootProvider theme={{ defaultTheme: "dark", enableSystem: false }}>{children}</RootProvider>
        {process.env.VERCEL_ENV === "production" && UMAMI_SRC && UMAMI_WEBSITE_ID ? (
          <Script src={UMAMI_SRC} data-website-id={UMAMI_WEBSITE_ID} strategy="afterInteractive" />
        ) : null}
      </body>
    </html>
  );
}
