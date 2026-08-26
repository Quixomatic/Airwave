import type { MetadataRoute } from "next";

import { blogSource, source } from "@/lib/source";

const SITE_URL = "https://getairwave.tv";

/**
 * Dynamically generated sitemap so the whole site is crawlable — the static marketing routes plus
 * every docs page and blog post pulled from the fumadocs sources (so new content is covered without
 * touching this file). Absolute URLs are required by the sitemap spec.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Static marketing routes (the `(home)` group + the roadmap).
  const staticRoutes = [
    "/",
    "/features",
    "/channel-guide",
    "/faq",
    "/about",
    "/contact",
    "/blog",
    "/roadmap",
    "/privacy",
    "/terms",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: (path === "/" || path === "/roadmap" ? "weekly" : "monthly") as "weekly" | "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));

  // Every docs page (includes `/docs`), from the generated docs source.
  const docRoutes = source.getPages().map((page) => ({
    url: `${SITE_URL}${page.url}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // Every blog post, dated by its frontmatter.
  const blogRoutes = blogSource.getPages().map((page) => ({
    url: `${SITE_URL}${page.url}`,
    lastModified: page.data.date ? new Date(page.data.date) : now,
    changeFrequency: "yearly" as const,
    priority: 0.5,
  }));

  return [...staticRoutes, ...docRoutes, ...blogRoutes];
}
