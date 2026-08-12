import { defineDocs, defineConfig, frontmatterSchema } from "fumadocs-mdx/config";
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
    }),
  },
});

export default defineConfig();
