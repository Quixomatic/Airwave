import Link from "next/link";
import type { ComponentType } from "react";
import { SiApple, SiAndroid, SiLg, SiRoku, SiSamsung } from "react-icons/si";
import { FaAmazon, FaWindows, FaLinux } from "react-icons/fa";
import { Globe } from "lucide-react";

/**
 * A compact, clickable grid of every supported platform — a smaller sibling of the home page's platform
 * tiles, themed for docs/blog (fd- tokens) instead of the landing shader. Each tile links to the downloads
 * page. Drop into any MDX with `<PlatformTiles />` (optionally `<PlatformTiles href="/docs/downloads" />`).
 * The list mirrors the home page grid and the platform matrix; keep them in step when a platform changes.
 */
const PLATFORMS: { name: string; Icon: ComponentType<{ className?: string }> }[] = [
  { name: "Apple TV", Icon: SiApple },
  { name: "iPad", Icon: SiApple },
  { name: "macOS", Icon: SiApple },
  { name: "Windows", Icon: FaWindows },
  { name: "Linux", Icon: FaLinux },
  { name: "Android TV", Icon: SiAndroid },
  { name: "Fire TV", Icon: FaAmazon },
  { name: "Roku", Icon: SiRoku },
  { name: "LG webOS", Icon: SiLg },
  { name: "Samsung", Icon: SiSamsung },
  { name: "Any browser", Icon: Globe },
];

export function PlatformTiles({ href = "/docs/downloads" }: { href?: string }) {
  return (
    <div className="not-prose my-6 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
      {PLATFORMS.map((p) => (
        <Link
          key={p.name}
          href={href}
          className="group flex flex-col items-center justify-center gap-2 rounded-lg border border-fd-border bg-fd-card/40 p-3 text-center transition-colors hover:border-fd-primary/40 hover:bg-fd-accent"
        >
          <p.Icon className="size-6 shrink-0 text-fd-foreground transition-colors group-hover:text-fd-primary" />
          <span className="text-xs font-medium text-fd-foreground">{p.name}</span>
        </Link>
      ))}
    </div>
  );
}
