import { BookText, Braces, CircleHelp, House, Newspaper } from "lucide-react";
import type { ReactNode } from "react";

function TabIcon({ icon: Icon, className }: { icon: typeof BookText; className: string }) {
  return (
    <div className={`flex size-full items-center justify-center rounded-md ${className}`}>
      <Icon className="size-3.5" />
    </div>
  );
}

/** The root-switcher dropdown at the top of the docs sidebar — jumps between the main site sections. Shared by
 * the /docs and /api-reference layouts so the switcher is identical everywhere. */
export const sidebarTabs: { title: string; description: string; url: string; icon: ReactNode }[] = [
  {
    title: "Documentation",
    description: "Guides & reference",
    url: "/docs",
    icon: <TabIcon icon={BookText} className="bg-blue-500/10 text-blue-500" />,
  },
  {
    title: "API Reference",
    description: "The public REST API",
    url: "/api-reference",
    icon: <TabIcon icon={Braces} className="bg-teal-500/10 text-teal-500" />,
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
