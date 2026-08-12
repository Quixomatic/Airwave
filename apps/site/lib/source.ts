import { docs } from "@/.source/server";
import { loader } from "fumadocs-core/source";
import { icons } from "lucide-react";
import { createElement } from "react";

// The `/docs` source, backed by the fumadocs-mdx `content/docs` collection (generated into `.source`).
// `icon` resolves a page/folder's frontmatter `icon:` (a Lucide icon name) to a React element for the
// sidebar — high-level pages set one; sub-pages leave it off.
export const source = loader({
  baseUrl: "/docs",
  icon(icon) {
    if (icon && icon in icons) return createElement(icons[icon as keyof typeof icons]);
  },
  source: docs.toFumadocsSource(),
});
