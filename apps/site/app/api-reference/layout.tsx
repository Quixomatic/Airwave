import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";

import { apiReference } from "@/lib/api-source";
import { baseOptions } from "@/lib/layout.shared";
import { sidebarTabs } from "@/lib/sidebar-tabs";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout tree={apiReference.pageTree} tabs={sidebarTabs} {...baseOptions("docs")}>
      {children}
    </DocsLayout>
  );
}
