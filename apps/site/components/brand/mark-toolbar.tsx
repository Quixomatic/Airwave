"use client";

import { useRef, useState } from "react";

import { AirwaveLogo } from "@/components/airwave-logo";

/**
 * Copy / download controls for the Airwave logomark, driven entirely off the `AirwaveLogo` SVG component
 * (the single source of truth). It renders one hidden, native-size copy of the mark, serializes that live
 * DOM node for "Copy SVG" / "Download SVG", and rasterizes it to a canvas for "Download PNG". No separate
 * asset files to keep in sync. Client-only (clipboard, Blob, canvas).
 */
const VIEWBOX_W = 715;
const VIEWBOX_H = 517;
const PNG_WIDTH = 1024;

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function MarkToolbar() {
  const sourceRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  /** The mark as a standalone, native-size SVG document string. */
  const svgString = (): string | null => {
    const svg = sourceRef.current?.querySelector("svg");
    if (!svg) return null;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(VIEWBOX_W));
    clone.setAttribute("height", String(VIEWBOX_H));
    const xml = new XMLSerializer().serializeToString(clone);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
  };

  const copySvg = async () => {
    const svg = svgString();
    if (!svg) return;
    try {
      await navigator.clipboard.writeText(svg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the download buttons still work */
    }
  };

  const downloadSvg = () => {
    const svg = svgString();
    if (svg) triggerDownload(new Blob([svg], { type: "image/svg+xml" }), "airwave-logomark.svg");
  };

  const downloadPng = () => {
    const svg = svgString();
    if (!svg) return;
    const src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = PNG_WIDTH;
      canvas.height = Math.round((PNG_WIDTH * VIEWBOX_H) / VIEWBOX_W);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) triggerDownload(blob, "airwave-logomark.png");
        }, "image/png");
      }
      URL.revokeObjectURL(src);
    };
    img.src = src;
  };

  const btn =
    "inline-flex items-center justify-center rounded-lg border border-fd-border px-4 py-2 text-sm font-medium transition-colors hover:bg-fd-accent";

  return (
    <div className="flex flex-wrap gap-2">
      {/* Hidden native-size source, serialized on demand — keeps the component the single source of truth. */}
      <div ref={sourceRef} aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0">
        <AirwaveLogo />
      </div>
      <button type="button" onClick={copySvg} className={btn}>
        {copied ? "Copied!" : "Copy SVG"}
      </button>
      <button type="button" onClick={downloadSvg} className={btn}>
        Download SVG
      </button>
      <button type="button" onClick={downloadPng} className={btn}>
        Download PNG
      </button>
    </div>
  );
}
