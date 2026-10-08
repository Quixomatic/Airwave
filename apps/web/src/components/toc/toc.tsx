"use client";

// Port of fumadocs-ui's "clerk" TOC (the docs-site table of contents with the moving in-view highlight):
// a faint vertical rail with a primary-colored "thumb" that tracks the active section, clip-path animated.
// Styling adapted from fuma's `fd-*` tokens to ours (fd-primary → primary, fd-foreground/10 → foreground/10,
// fd-muted-foreground → muted-foreground). The observed items are passed in via `items`, so it works for any
// set of on-page anchors (here: the channel editor's sections). Numbered "steps" and TOC auto-scroll dropped.
import { type ReactNode, createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import {
  AnchorProvider,
  TOCItem as PrimitiveTOCItem,
  type TOCItemState,
  type TOCItemType,
  useTOC,
  useTOCListener,
} from "./toc-primitive";

const BASE = 8;
/** Text inset per depth (so the label clears the rail). */
function getItemOffset(depth: number): number {
  if (depth <= 2) return 20;
  if (depth === 3) return 32;
  return 44;
}
/** Rail x-position per depth. */
function getLineOffset(depth: number): number {
  if (depth <= 2) return BASE;
  if (depth === 3) return 20;
  return 32;
}

const TOCContext = createContext<TOCItemType[]>([]);
function useTOCItems() {
  return use(TOCContext);
}

type Computed = { content: ReactNode[]; width: number; height: number; positions: [number, number, number][] };

function TOCItems({ className, children }: { className?: string; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const items = useTOCItems();
  const [svg, setSvg] = useState<Computed | null>(null);

  const onResize = useCallback(() => {
    const container = containerRef.current;
    if (!container || container.clientHeight === 0) return;
    if (items.length === 0) {
      setSvg(null);
      return;
    }
    let w = 0;
    let h = 0;
    let d = "";
    const positions: [number, number, number][] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const el = container.querySelector<HTMLElement>(`a[href="${item.url}"]`);
      if (!el) continue;
      const styles = getComputedStyle(el);
      const x = getLineOffset(item.depth) + 0.5;
      const top = el.offsetTop + Number.parseFloat(styles.paddingTop);
      const bottom = el.offsetTop + el.clientHeight - Number.parseFloat(styles.paddingBottom);
      w = Math.max(x + 8, w);
      h = Math.max(h, bottom);
      if (i === 0) d += ` M${x} ${top} L${x} ${bottom}`;
      else {
        const [, upperBottom, upperX] = positions[i - 1] ?? [0, 0, 0];
        d += ` L ${upperX} ${upperBottom} ${x} ${top} L${x} ${bottom}`;
      }
      positions.push([top, bottom, x]);
    }
    setSvg({
      content: [<path key="rail" d={d} className="stroke-primary" strokeWidth="1" fill="none" />],
      width: w,
      height: h,
      positions,
    });
  }, [items]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(onResize);
    observer.observe(container);
    onResize();
    return () => observer.disconnect();
  }, [onResize]);

  return (
    <div ref={containerRef} className={cn("relative flex flex-col", className)}>
      {svg && <ThumbTrack computed={svg} />}
      {children}
    </div>
  );
}

/** The primary-colored active highlight: the full rail path, clipped to the active items' vertical range. */
function ThumbTrack({ computed }: { computed: Computed }) {
  const ref = useRef<HTMLDivElement>(null);
  const toc = useTOC();

  const calculate = (items: TOCItemState[]): Record<string, string> => {
    const out: Record<string, string> = {};
    const startIdx = items.findIndex((it) => it.active);
    if (startIdx === -1) return out;
    let endIdx = startIdx;
    for (let i = items.length - 1; i >= 0; i--)
      if (items[i]!.active) {
        endIdx = i;
        break;
      }
    out["--track-top"] = `${computed.positions[startIdx]?.[0] ?? 0}px`;
    out["--track-bottom"] = `${computed.positions[endIdx]?.[1] ?? 0}px`;
    return out;
  };

  useTOCListener((items) => {
    const el = ref.current;
    if (!el) return;
    for (const [k, v] of Object.entries(calculate(items))) el.style.setProperty(k, v);
  });

  return (
    <div
      ref={ref}
      className="absolute left-0 top-0 origin-center"
      style={{ width: computed.width, height: computed.height, ...calculate(toc.get()) }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${computed.width} ${computed.height}`}
        className="absolute transition-[clip-path] duration-500"
        style={{
          width: computed.width,
          height: computed.height,
          clipPath:
            "polygon(0 var(--track-top,0), 100% var(--track-top,0), 100% var(--track-bottom,0), 0 var(--track-bottom,0))",
        }}
      >
        {computed.content}
      </svg>
    </div>
  );
}

function TOCItem({ item }: { item: TOCItemType }) {
  const items = useTOCItems();
  const index = items.indexOf(item);
  const isFirst = index === 0;
  const isLast = index === items.length - 1;
  const svg = useMemo(() => {
    const l1 = getLineOffset(item.depth);
    const l0 = isFirst ? l1 : getLineOffset(items[index - 1]!.depth);
    const l2 = isLast ? l1 : getLineOffset(items[index + 1]!.depth);
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className={cn("absolute -top-1.5 bottom-0 left-0 -z-10 h-[calc(100%+6px)]", l1 !== l2 && "bottom-1.5 h-full")}
        style={{ width: Math.max(l0, l1) + 9 }}
      >
        {l0 !== l1 && (
          <path d={`M ${l0 + 0.5} 0 L ${l0 + 0.5} 0 ${l1 + 0.5} 12`} strokeWidth="1" fill="none" className="stroke-foreground/10" />
        )}
        <line x1={l1 + 0.5} y1={l0 === l1 ? "6" : "12"} x2={l1 + 0.5} y2="100%" strokeWidth="1" className="stroke-foreground/10" />
      </svg>
    );
  }, [items, item, index, isFirst, isLast]);

  return (
    <PrimitiveTOCItem
      href={item.url}
      onClick={(e) => {
        e.preventDefault();
        document.getElementById(item.url.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className={cn(
        "relative py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-[active=true]:text-primary",
        isFirst && "pt-0",
        isLast && "pb-0",
      )}
      style={{ paddingInlineStart: getItemOffset(item.depth) }}
    >
      {svg}
      {item.title}
    </PrimitiveTOCItem>
  );
}

/** The whole TOC: pass the on-page anchors to observe. Renders nothing when there are no items. */
export function SectionToc({ items, className }: { items: TOCItemType[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <TOCContext value={items}>
      <AnchorProvider toc={items}>
        <TOCItems className={className}>
          {items.map((item) => (
            <TOCItem key={item.url} item={item} />
          ))}
        </TOCItems>
      </AnchorProvider>
    </TOCContext>
  );
}
