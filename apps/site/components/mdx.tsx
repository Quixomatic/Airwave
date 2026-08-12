import defaultMdxComponents from "fumadocs-ui/mdx";
import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";

/**
 * A styled, self-contained video embed for screencasts / demos — usable in any MDX page as
 * `<Video src="/screenshots/demo.mp4" caption="Building a channel" />`. Shows controls by default; pass
 * `autoPlay muted loop` for a silent looping demo. Drop the file in `public/screenshots/` (or `public/`).
 */
function Video({ caption, className, ...rest }: ComponentProps<"video"> & { caption?: string }) {
  return (
    <figure className="my-6">
      <video
        controls
        playsInline
        preload="metadata"
        className={`w-full rounded-lg border border-fd-border shadow-sm ${className ?? ""}`}
        {...rest}
      />
      {caption ? (
        <figcaption className="mt-2 text-center text-sm text-fd-muted-foreground">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

/**
 * MDX component map for the docs. Extends fumadocs' defaults with:
 * - `img` → fumadocs `ImageZoom` (click-to-zoom screenshots). It wraps `next/image`, and fumadocs-mdx's
 *   build-time image sizing fills in width/height for local images in `public/` — so a plain markdown
 *   `![alt](/screenshots/foo.webp)` becomes an optimized, zoomable image with no manual dimensions.
 * - `Video` → the styled embed above, available to every page without an import.
 */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    img: (props) => <ImageZoom {...(props as ComponentProps<typeof ImageZoom>)} />,
    Video,
    ...components,
  };
}
