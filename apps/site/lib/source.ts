import { docs, blog } from "@/.source/server";
import { loader } from "fumadocs-core/source";
import { icons } from "lucide-react";
import { createElement } from "react";

// Per-category icon tints for the docs sidebar, keyed by the Lucide icon name each section uses. Scoped to
// the **Using Airwave** group only — those items map to the admin app's tinted sidebar icons (apps/web
// `sidebar-data.ts` + `TintedIconTile`), so a category reads the same color in both places: Channels indigo,
// Sources sky, Packages violet, Bumpers amber, Users emerald, Settings rose (+ AI assistant purple). Getting
// Started and How it works are intentionally left untinted. `-500` matches the shade the sidebar switcher
// chips use (see `app/docs/layout.tsx`). fumadocs only *sizes* the tree svg (`[&_svg]:size-4`) and colors it
// by inheritance, so a color class set directly on the svg wins.
const ICON_TINT: Record<string, string> = {
  Plug: "text-sky-500", // Sources (admin: sky)
  Tv: "text-indigo-500", // Channels (admin: indigo)
  Package: "text-violet-500", // Packages (admin: violet)
  Users: "text-emerald-500", // Users & access (admin: emerald)
  Clapperboard: "text-amber-500", // Bumpers (admin: amber)
  Settings: "text-rose-500", // Settings (admin: rose)
  Sparkles: "text-purple-500", // AI assistant
};

// The `/docs` source, backed by the fumadocs-mdx `content/docs` collection (generated into `.source`).
// `icon` resolves a page/folder's frontmatter `icon:` (a Lucide icon name) to a React element for the
// sidebar — high-level pages set one; sub-pages leave it off. Each icon is tinted per `ICON_TINT`.
export const source = loader({
  baseUrl: "/docs",
  icon(icon) {
    if (icon && icon in icons) {
      const className = ICON_TINT[icon];
      return createElement(
        icons[icon as keyof typeof icons],
        className ? { className } : undefined,
      );
    }
  },
  source: docs.toFumadocsSource(),
});

// The `/blog` source, backed by the `content/blog` collection (posts carry `author` + `date`).
export const blogSource = loader({
  baseUrl: "/blog",
  source: blog.toFumadocsSource(),
});
