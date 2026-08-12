import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { BookText, Newspaper, CircleHelp, House } from "lucide-react";
import type { ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

// Colored icon chip for the sidebar switcher items (fumadocs-style: a tinted rounded square). Fills the
// icon slot fumadocs provides (`size-9` mobile / `size-5` desktop) so it stays centered and the layout's
// `gap-2` between icon and text is preserved.
function TabIcon({ icon: Icon, className }: { icon: typeof BookText; className: string }) {
  return (
    <div className={`flex size-full items-center justify-center rounded-md ${className}`}>
      <Icon className="size-3.5" />
    </div>
  );
}

// A "jump" switcher at the top of the docs sidebar (fumadocs Sidebar Tabs) — colored icon + subtitle per
// destination, to hop between the main site areas from within the docs. Explicit targets, not tree roots.
const sidebarTabs = [
  {
    title: "Documentation",
    description: "Guides & reference",
    url: "/docs",
    icon: <TabIcon icon={BookText} className="bg-blue-500/10 text-blue-500" />,
  },
  {
    title: "Blog",
    description: "News & the dev-log",
    url: "/blog",
    icon: <TabIcon icon={Newspaper} className="bg-amber-500/10 text-amber-500" />,
  },
  {
    title: "FAQ",
    description: "Common questions",
    url: "/faq",
    icon: <TabIcon icon={CircleHelp} className="bg-violet-500/10 text-violet-500" />,
  },
  {
    title: "Home",
    description: "Back to the landing page",
    url: "/",
    icon: <TabIcon icon={House} className="bg-emerald-500/10 text-emerald-500" />,
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout tree={source.getPageTree()} tabs={sidebarTabs} {...baseOptions("docs")}>
      {children}
    </DocsLayout>
  );
}
