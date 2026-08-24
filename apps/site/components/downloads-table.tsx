import { Check, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { FaWindows, FaApple, FaLinux, FaDocker, FaAndroid, FaChrome } from "react-icons/fa";
import { RELEASES_PAGE } from "@/lib/releases";

/**
 * Airwave's download matrix for the /docs/downloads page — a scannable table of every client and server
 * build, which OS each is for, where to get it, and its status. Mirrors PlatformMatrix's styling. Static
 * on purpose (links point at the GitHub releases/latest page, store pages, or GHCR — all stable URLs), so
 * it never needs a per-release edit. The homepage keeps the OS-aware one-click download buttons.
 */

// Stable, non-versioned links. Fill the store URLs as each store listing goes live.
const GHCR = "https://github.com/Quixomatic/Airwave/pkgs/container/airwave";
const PLAY = "https://play.google.com/store/apps/details?id=com.airwave.tv";
const SELF_HOST = "/docs/self-hosting";
// const APP_STORE_TV = "";  // TODO: paste the Apple TV App Store URL once you have it
// const APP_STORE_IPAD = ""; // TODO: paste the iPad App Store URL once you have it

type Status = "available" | "beta" | "planned";

const STATUS: Record<Status, { label: string; icon: ReactNode; className: string }> = {
  available: { label: "Available", icon: <Check className="size-3.5" />, className: "bg-emerald-500/10 text-emerald-500" },
  beta: { label: "In testing", icon: <Clock className="size-3.5" />, className: "bg-amber-500/10 text-amber-500" },
  planned: { label: "Planned", icon: <Clock className="size-3.5" />, className: "bg-fd-muted text-fd-muted-foreground" },
};

function Badge({ status, override }: { status: Status; override?: string }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.className}`}>
      {s.icon}
      {override ?? s.label}
    </span>
  );
}

type Row = {
  platform: string;
  sub?: string;
  Icon: React.ComponentType<{ className?: string }>;
  delivery: string;
  href?: string; // omitted → the "Get it" cell is plain text (e.g. a store listing not yet public)
  getLabel: string;
  external?: boolean;
  status: Status;
  statusLabel?: string;
};

function DownloadTable({ caption, rows }: { caption: string; rows: Row[] }) {
  return (
    <div className="my-6 overflow-x-auto rounded-lg border border-fd-border">
      <table className="!my-0 w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-fd-border bg-fd-card/40 text-left text-fd-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Platform</th>
            <th className="px-4 py-2.5 font-medium">Delivery</th>
            <th className="px-4 py-2.5 font-medium">Get it</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.platform} className={i < rows.length - 1 ? "border-b border-fd-border/60" : ""}>
              <td className="px-4 py-3 font-medium text-fd-foreground">
                <span className="inline-flex items-center gap-2">
                  <r.Icon className="size-4 shrink-0 text-fd-muted-foreground" />
                  {r.platform}
                  {r.sub ? <span className="font-normal text-fd-muted-foreground"> · {r.sub}</span> : null}
                </span>
              </td>
              <td className="px-4 py-3 text-fd-muted-foreground">{r.delivery}</td>
              <td className="px-4 py-3">
                {r.href ? (
                  <a
                    href={r.href}
                    {...(r.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                    className="font-medium text-brand hover:underline"
                  >
                    {r.getLabel}
                  </a>
                ) : (
                  <span className="text-fd-muted-foreground">{r.getLabel}</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge status={r.status} override={r.statusLabel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClientDownloads() {
  const rows: Row[] = [
    { platform: "Apple TV", sub: "tvOS", Icon: FaApple, delivery: "Native app", getLabel: "App Store", status: "available" },
    { platform: "iPad", sub: "iPadOS", Icon: FaApple, delivery: "Native app", getLabel: "App Store", status: "beta", statusLabel: "In review" },
    { platform: "Android TV / Google TV", Icon: FaAndroid, delivery: "Native app", href: PLAY, getLabel: "Google Play", external: true, status: "beta", statusLabel: "In testing" },
    { platform: "Fire TV", Icon: FaAndroid, delivery: "Native app", getLabel: "Amazon Appstore", status: "planned", statusLabel: "Coming" },
    { platform: "LG webOS", Icon: FaChrome, delivery: "Packaged web app", getLabel: "LG Content Store", status: "planned", statusLabel: "Coming" },
    { platform: "Roku", Icon: FaChrome, delivery: "Native channel", getLabel: "Roku Channel Store", status: "planned", statusLabel: "Coming" },
    { platform: "Windows", Icon: FaWindows, delivery: "Desktop app (Tauri)", href: RELEASES_PAGE, getLabel: "Download (.exe)", external: true, status: "available" },
    { platform: "macOS", sub: "Apple Silicon + Intel", Icon: FaApple, delivery: "Desktop app (Tauri)", href: RELEASES_PAGE, getLabel: "Download (.dmg)", external: true, status: "available" },
    { platform: "Linux", Icon: FaLinux, delivery: "Desktop app (Tauri)", getLabel: "From source", status: "planned", statusLabel: "Next" },
    { platform: "Any browser", Icon: FaChrome, delivery: "Web player", href: SELF_HOST, getLabel: "Self-host (tvweb role)", status: "available" },
  ];
  return <DownloadTable caption="Airwave client downloads by platform" rows={rows} />;
}

export function ServerDownloads() {
  const rows: Row[] = [
    { platform: "Docker", sub: "any OS", Icon: FaDocker, delivery: "Container image", href: GHCR, getLabel: "ghcr.io/quixomatic/airwave", external: true, status: "available", statusLabel: "Recommended" },
    { platform: "Windows", sub: "x64", Icon: FaWindows, delivery: "One-click installer", href: RELEASES_PAGE, getLabel: "Download (.exe)", external: true, status: "available" },
    { platform: "macOS", sub: "Apple Silicon", Icon: FaApple, delivery: "One-click installer", href: RELEASES_PAGE, getLabel: "Download (.dmg)", external: true, status: "available" },
    { platform: "macOS", sub: "Intel", Icon: FaApple, delivery: "One-click installer", href: RELEASES_PAGE, getLabel: "Download (.dmg)", external: true, status: "available" },
    { platform: "Linux", sub: "x64", Icon: FaLinux, delivery: "One-click installer", href: RELEASES_PAGE, getLabel: "Download (.tar.gz)", external: true, status: "available" },
  ];
  return <DownloadTable caption="Airwave server downloads by OS" rows={rows} />;
}
