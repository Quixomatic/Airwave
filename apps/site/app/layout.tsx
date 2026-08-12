import "./global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import type { Metadata } from "next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Airwave — your Plex library as custom live TV",
    template: "%s — Airwave",
  },
  description:
    "Airwave is a self-hostable service that turns your Plex library into custom, always-on live-TV channels — watch on webOS, Apple TV, iPad, Android TV, and Fire TV.",
  metadataBase: new URL("https://getairwave.tv"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        {/* Default to dark — the navy 10-foot brand is the intended first impression. The theme toggle still
            works and persists per-visitor; we just don't follow the OS preference by default. */}
        <RootProvider theme={{ defaultTheme: "dark", enableSystem: false }}>{children}</RootProvider>
      </body>
    </html>
  );
}
