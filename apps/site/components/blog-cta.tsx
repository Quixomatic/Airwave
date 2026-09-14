import Link from "next/link";
import type { ReactNode } from "react";

import { button } from "@/components/landing";
import { ShaderCta } from "@/components/shaders";

/**
 * `<Cta />` — the shared ShaderCta panel (grain-gradient + dithered logo, pinned dark) packaged as an MDX
 * component so a post can drop it wherever the call to action belongs. Presence in the MDX is the control:
 * include it to show a CTA, leave it out to skip one (no frontmatter toggle). Copy defaults suit any post;
 * override with `title` / `subtitle`, or pass custom buttons as children.
 *
 * Usage in a blog post:
 *   <Cta />
 *   <Cta title="Ready to save your CPU cycles?" subtitle="Airwave is free and self-hosted." />
 */
export function Cta({
  title = "Turn your Plex library into live TV.",
  subtitle = "Airwave is free, self-hosted, and yours. Point it at Plex and start surfing.",
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="not-prose my-8">
      <ShaderCta title={title} subtitle={subtitle}>
        {children ?? (
          <>
            <Link href="/docs/getting-started" className={button()}>
              Get started
            </Link>
            <Link href="/docs/downloads" className={button("secondary")}>
              Downloads
            </Link>
          </>
        )}
      </ShaderCta>
    </div>
  );
}
