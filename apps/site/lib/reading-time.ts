import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Estimated reading time (minutes) for a blog post, computed from its raw MDX body at build time. fumadocs
 * doesn't expose a word count, so we read the file by slug (content/blog/<slug>.mdx), strip the frontmatter,
 * and count words at ~200 wpm. Best-effort — returns 1 on any error.
 */
export function readingTimeMinutes(slug: string): number {
  try {
    const raw = readFileSync(join(process.cwd(), "content", "blog", `${slug}.mdx`), "utf8");
    const body = raw.replace(/^---[\s\S]*?---/, ""); // drop frontmatter
    const words = body.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
  } catch {
    return 1;
  }
}
