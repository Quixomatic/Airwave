import type { ComponentType } from "react";
import Link from "next/link";
import { FaWindows, FaApple, FaLinux, FaDocker } from "react-icons/fa";
import { Wide } from "@/components/landing";
import { getLatestRelease, RELEASES_PAGE } from "@/lib/releases";

/**
 * The Download area — inline pill buttons (plezy-style), split into two rows: the **Server** (runs your
 * channels next to Plex) first, then the **Client** (the viewer you install to watch). URLs resolve to the
 * latest GitHub Release's real assets at request time (see lib/releases.ts), so they never go stale.
 */

// A download target: either a GitHub Release asset (matched by `re`) or an external store link (`href`).
type Dl = {
  os: string;
  arch: string;
  Icon: ComponentType<{ className?: string }>;
  re?: RegExp;
  href?: string;
  external?: boolean;
};

// TODO: swap these stubs for the real App Store product URLs once the apps are live.
const APPSTORE = {
  appleTv: "#", // Airwave on the Apple TV App Store
  ipad: "#", // Airwave on the iPad App Store
};

const SERVER: Dl[] = [
  { os: "Windows", arch: "x64", Icon: FaWindows, re: /^Airwave-Server-.*-windows-x64-Setup\.exe$/ },
  { os: "macOS", arch: "Apple Silicon", Icon: FaApple, re: /^Airwave-Server-.*-macos-arm64\.dmg$/ },
  { os: "macOS", arch: "Intel", Icon: FaApple, re: /^Airwave-Server-.*-macos-x64\.dmg$/ },
  { os: "Linux", arch: "x64", Icon: FaLinux, re: /^Airwave-Server-.*-linux-x64-Setup\.tar\.gz$/ },
  { os: "Linux", arch: "arm64", Icon: FaLinux, re: /^Airwave-Server-.*-linux-arm64-Setup\.tar\.gz$/ },
];

const CLIENT: Dl[] = [
  { os: "Apple TV", arch: "App Store", Icon: FaApple, href: APPSTORE.appleTv, external: true },
  { os: "iPad", arch: "App Store", Icon: FaApple, href: APPSTORE.ipad, external: true },
  { os: "Windows", arch: "x64", Icon: FaWindows, re: /^Airwave-Client_.*_x64-setup\.exe$/ },
  { os: "macOS", arch: "Apple Silicon", Icon: FaApple, re: /^Airwave-Client_.*_aarch64\.dmg$/ },
  { os: "macOS", arch: "Intel", Icon: FaApple, re: /^Airwave-Client_.*_x86_64\.dmg$/ },
];

const PILL =
  "inline-flex items-center gap-2 rounded-full border bg-fd-secondary px-4 py-2.5 text-sm font-medium text-fd-secondary-foreground transition-colors hover:bg-fd-accent";

function Row({ label, sub, items, find }: { label: string; sub: string; items: Dl[]; find: (re: RegExp) => string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="w-32 shrink-0">
        <div className="font-medium text-fd-foreground">{label}</div>
        <div className="text-xs text-fd-muted-foreground">{sub}</div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {items.map((d) => {
          const href = d.href ?? (d.re ? find(d.re) : RELEASES_PAGE);
          return (
            <a
              key={`${d.os}-${d.arch}`}
              href={href}
              className={PILL}
              {...(d.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
            >
              <d.Icon className="size-4 shrink-0" />
              {d.os}
              <span className="text-xs font-normal text-fd-muted-foreground">{d.arch}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export async function DownloadSection() {
  const rel = await getLatestRelease();
  return (
    <section id="download">
      <Wide className="mt-16 lg:mt-28">
        <h2 className="text-2xl font-medium tracking-tight text-brand">Download Airwave</h2>
        <p className="mt-2 mb-8 max-w-2xl text-fd-muted-foreground">
          The <strong className="font-medium text-fd-foreground">Server</strong> runs your channels next to
          Plex; the <strong className="font-medium text-fd-foreground">Client</strong> is the viewer you
          install to watch.{rel.version ? ` Latest: ${rel.version}.` : ""}
        </p>

        <div className="flex flex-col gap-6">
          <Row label="Server" sub="runs next to Plex" items={SERVER} find={rel.find} />
          <Row label="Client" sub="the viewer" items={CLIENT} find={rel.find} />
        </div>

        <p className="mt-8 text-sm text-fd-muted-foreground">
          Prefer containers?{" "}
          <Link href="/docs/self-hosting" className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
            <FaDocker className="size-4" /> Docker / self-host guide
          </Link>{" "}
          · all builds signed ·{" "}
          <a href={RELEASES_PAGE} className="text-brand hover:underline" target="_blank" rel="noreferrer noopener">
            all releases &amp; checksums →
          </a>
        </p>
      </Wide>
    </section>
  );
}
