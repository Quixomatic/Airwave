import "./global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import type { Metadata } from "next";

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
      </body>
    </html>
  );
}
