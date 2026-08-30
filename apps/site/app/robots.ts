import type { MetadataRoute } from "next";

const SITE_URL = "https://getairwave.tv";

/**
 * robots.txt as a Next metadata route (generated at build → served at /robots.txt), so it stays in sync with
 * the site's canonical URL and points crawlers at the dynamic sitemap. Everything is crawlable except the API
 * routes (e.g. the roadmap vote endpoint) which aren't content.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
