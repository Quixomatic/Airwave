"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { FaWindows, FaApple, FaLinux, FaDocker, FaChevronDown } from "react-icons/fa";
import { cn } from "@/lib/cn";
import type { HeroDownloads } from "@/lib/releases";
import { APP_STORE_APPLE } from "@/lib/store-links";

// Apple TV + iPad share ONE universal App Store listing (same bundle id). Until the App ID is set,
// fall back to the downloads docs page rather than a dead link.
const appleHref = APP_STORE_APPLE || "/docs/downloads";
const appleExternal = Boolean(APP_STORE_APPLE);

type OS = "windows" | "macos" | "linux" | "apple" | "other";

type Item = {
  id: string;
  short: string; // button label, e.g. "macOS"
  label: string; // menu label, e.g. "macOS (Apple Silicon)"
  Icon: ComponentType<{ className?: string }>;
  href: string;
  os?: OS; // if set, auto-selected when the visitor is on this OS (only when autoDetect)
  external?: boolean;
  cta?: string; // overrides the main-button text (e.g. "Self-host with Docker")
};

function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/iPhone|iPad|iPod/i.test(ua)) return "apple";
  if (/Mac/i.test(ua)) return "macos";
  if (/Linux|X11|Android/i.test(ua)) return "linux";
  return "other";
}

function DownloadButton({
  productLabel,
  items,
  variant,
  fallbackHref,
  defaultId,
  autoDetect = false,
}: {
  productLabel: string;
  items: Item[];
  variant: "primary" | "secondary";
  fallbackHref: string;
  /** id of the item to lead with by default (and when no OS matches). */
  defaultId: string;
  /** when true, override the default with the build matching the visitor's OS. */
  autoDetect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(defaultId);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoDetect) return;
    const os = detectOS();
    const match = items.find((i) => i.os === os);
    setActiveId(match?.id ?? defaultId);
  }, [items, defaultId, autoDetect]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const main = items.find((i) => i.id === activeId) ?? items[0];
  const base =
    variant === "primary"
      ? "bg-brand text-brand-foreground hover:bg-brand-200"
      : "border bg-fd-secondary text-fd-secondary-foreground hover:bg-fd-accent";

  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="pl-1 text-[11px] font-semibold tracking-wide text-fd-muted-foreground uppercase">
        {productLabel}
      </span>
      <div ref={ref} className="relative inline-flex">
        <a
          href={main?.href ?? fallbackHref}
          {...(main?.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
          className={cn(
            "inline-flex items-center gap-2 rounded-l-full py-3 pr-4 pl-5 font-medium tracking-tight transition-colors",
            base,
          )}
        >
          {main ? <main.Icon className="size-4 shrink-0" /> : null}
          {main ? (main.cta ?? `Download for ${main.short}`) : "Download"}
        </a>
        <button
          type="button"
          aria-label="Choose platform"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn("inline-flex items-center rounded-r-full border-l border-black/15 px-3 py-3 transition-colors", base)}
        >
          <FaChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
        </button>
        {open ? (
          <div className="absolute top-full left-0 z-20 mt-2 min-w-full overflow-hidden rounded-xl border bg-fd-popover p-1 text-left shadow-xl">
            {items.map((i) => (
              <a
                key={i.id}
                href={i.href}
                {...(i.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-fd-popover-foreground hover:bg-fd-accent"
              >
                <i.Icon className="size-4 shrink-0" />
                {i.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function HeroDownloadButtons({ dl }: { dl: HeroDownloads }) {
  const server: Item[] = [
    { id: "docker", short: "Docker", label: "Docker / self-host", Icon: FaDocker, href: "/docs/self-hosting", cta: "Self-host with Docker" },
    { id: "win", short: "Windows", label: "Windows (x64)", Icon: FaWindows, href: dl.server.windows, os: "windows" },
    { id: "mac", short: "macOS", label: "macOS (Apple Silicon)", Icon: FaApple, href: dl.server.macos, os: "macos" },
    { id: "mac-intel", short: "macOS", label: "macOS (Intel)", Icon: FaApple, href: dl.server.macosIntel },
    { id: "linux", short: "Linux", label: "Linux (x64)", Icon: FaLinux, href: dl.server.linux, os: "linux" },
  ];
  const client: Item[] = [
    { id: "appletv", short: "Apple TV", label: "Apple TV (App Store)", Icon: FaApple, href: appleHref, os: "apple", external: appleExternal },
    { id: "ipad", short: "iPad", label: "iPad (App Store)", Icon: FaApple, href: appleHref, external: appleExternal },
    { id: "win", short: "Windows", label: "Windows (x64)", Icon: FaWindows, href: dl.client.windows, os: "windows" },
    { id: "mac", short: "macOS", label: "macOS (Apple Silicon)", Icon: FaApple, href: dl.client.macos, os: "macos" },
    { id: "mac-intel", short: "macOS", label: "macOS (Intel)", Icon: FaApple, href: dl.client.macosIntel },
  ];

  return (
    <div className="flex flex-row flex-wrap items-start gap-4">
      {/* Server always leads with Docker (self-host is the primary path); Client auto-detects the OS. */}
      <DownloadButton productLabel="Server" items={server} variant="primary" fallbackHref={dl.releases} defaultId="docker" />
      <DownloadButton productLabel="Client" items={client} variant="secondary" fallbackHref={dl.releases} defaultId="mac" autoDetect />
    </div>
  );
}
