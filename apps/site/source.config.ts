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
      // cards + as the social/OG card + the JSON-LD image. Generate a branded default with
      // scripts/gen-blog-image.py, or drop a real one. For a video post, use a still from the video.
      image: z.string(),
      // Optional CSS feature-image treatment. `image` above stays the static social/OG card + fallback;
      // when `feature` is set, the on-site list card and post hero render `feature.image` (or `image`) as
      // the REAL screenshot and add the blurred, branded logomark+title overlay in CSS, controlled per view.
      // `blur` is a boolean (both views) or `{ list?, article? }`. See components/feature-image.tsx.
      feature: z
        .object({
          image: z.string().optional(),
          title: z.string().optional(),
          subtitle: z.string().optional(),
          blur: z
            .union([z.boolean(), z.object({ list: z.boolean().optional(), article: z.boolean().optional() })])
            .optional(),
        })
        .optional(),
      // Optional YouTube video id. When set, the post header plays the glass-framed embed IN PLACE OF the
      // featured `image` (the image still powers the social card + list thumbnail, which can't be a video),
      // and the page emits VideoObject structured data.
      video: z.string().optional(),
      // Draft posts are hidden everywhere in production (list, direct URL, RSS, sitemap) but still visible in
      // local `dev` so you can preview them. Set `draft: true` to hold a post; delete the line (or set false)
      // to publish. See `listBlogPosts()` in lib/source.ts.
      draft: z.boolean().optional(),
    }),
  },
});

export default defineConfig({
  // Turn ```mermaid code fences into <Mermaid chart="…"/> (rendered by components/mdx/mermaid.tsx).
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
  },
});
