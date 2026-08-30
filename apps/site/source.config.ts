import { defineDocs, defineConfig, frontmatterSchema } from "fumadocs-mdx/config";
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { z } from "zod";

// The `/docs` content collection.
export const docs = defineDocs({
  dir: "content/docs",
});

// The `/blog` content collection — posts extend the standard title/description frontmatter with an
// `author` and a `date` (ISO string), used for the byline + sorting.
export const blog = defineDocs({
  dir: "content/blog",
  docs: {
    schema: frontmatterSchema.extend({
      author: z.string(),
      date: z.string(),
      // Required featured image (a path under /public, e.g. "/blog/my-post.png"), shown on the blog list
      // cards + the post header. Generate a branded default with scripts/gen-blog-image.py, or drop a real one.
      image: z.string(),
    }),
  },
});

export default defineConfig({
  // Turn ```mermaid code fences into <Mermaid chart="…"/> (rendered by components/mdx/mermaid.tsx).
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
  },
});
