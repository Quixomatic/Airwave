"use client";

// Ported from fumadocs-core's `toc` primitive (the in-view-heading tracker behind the docs TOC), trimmed to
// what we need: no TOC-list auto-scroll (and its extra dependency), no numbered "steps". The observed items
// are passed in via `AnchorProvider`'s `toc` prop, so this works for any set of on-page anchors.
import { type ReactNode, createContext, use, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

export interface TOCItemType {
  title: ReactNode;
  /** An in-page anchor, e.g. "#details". */
  url: string;
  /** Nesting depth (1 = top level). Drives the rail indentation. */
  depth: number;
}

export type TOCItemState = { id: string; active: boolean; fallback: boolean; t: number; original: TOCItemType };
type ObserverItem = TOCItemState;

function getItemId(url: string): string | null {
  return url.startsWith("#") ? url.slice(1) : null;
}

export function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (value: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(value);
      else if (ref != null) (ref as React.RefObject<T | null>).current = value;
    }
  };
}

/** Tracks which anchors are in view via an IntersectionObserver; identical logic to fumadocs-core. */
class Observer {
  activeAnchors: string[] = [];
  activeAnchor: string | undefined;
  items: ObserverItem[] = [];
  private observer: IntersectionObserver | null = null;
  private listeners = new Set<(items: ObserverItem[]) => void>();

  constructor(
    toc: TOCItemType[],
    private single: boolean,
  ) {
    for (const item of toc) {
      const id = getItemId(item.url);
      if (id) this.items.push({ id, active: false, fallback: false, t: 0, original: item });
    }
  }

  subscribe = (listener: (items: ObserverItem[]) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  watch(options: IntersectionObserverInit) {
    if (this.observer) return;
    this.observer = new IntersectionObserver((entries) => this.callback(entries), options);
    for (const item of this.items) {
      const el = document.getElementById(item.id);
      if (el) this.observer.observe(el);
    }
  }

  unwatch() {
    this.observer?.disconnect();
    this.observer = null;
  }

  private callback(entries: IntersectionObserverEntry[]) {
    if (entries.length === 0) return;
    let hasActive = false;
    const updated = this.items.map((item) => {
      const entry = entries.find((e) => e.target.id === item.id);
      let active = entry ? entry.isIntersecting : item.active && !item.fallback;
      if (this.single && hasActive) active = false;
      if (item.active !== active) item = { ...item, t: Date.now(), active, fallback: false };
      if (active) hasActive = true;
      return item;
    });
    // Nothing 90%-visible (e.g. a section taller than the viewport) → fall back to the one nearest the top.
    if (!hasActive && entries[0]!.rootBounds) {
      const viewTop = entries[0]!.rootBounds.top;
      let min = Number.MAX_VALUE;
      let fallbackIdx = -1;
      for (let i = 0; i < updated.length; i++) {
        const el = document.getElementById(updated[i]!.id);
        if (!el) continue;
        const d = Math.abs(viewTop - el.getBoundingClientRect().top);
        if (d < min) {
          fallbackIdx = i;
          min = d;
        }
      }
      if (fallbackIdx !== -1) updated[fallbackIdx] = { ...updated[fallbackIdx]!, active: true, fallback: true, t: Date.now() };
    }
    this.update(updated);
  }

  private update(next: ObserverItem[]) {
    let latest: ObserverItem | undefined;
    const activeAnchors: string[] = [];
    for (const item of next) {
      if (!item.active) continue;
      activeAnchors.push(item.id);
      if (!latest || item.t > latest.t) latest = item;
    }
    this.items = next;
    this.activeAnchors = activeAnchors;
    this.activeAnchor = latest?.id;
    for (const listener of this.listeners) listener(next);
  }
}

const ObserverContext = createContext<Observer | null>(null);

export function AnchorProvider({
  toc,
  single = false,
  children,
}: {
  toc: TOCItemType[];
  single?: boolean;
  children: ReactNode;
}) {
  const observer = useMemo(() => new Observer(toc, single), [toc, single]);
  useEffect(() => {
    // threshold 0 = "any part in view is active" (so several on-screen sections highlight at once), vs
    // fuma's 0.9 which suits small doc headings. Our sections/frames are large, so 0 is the right fit.
    observer.watch({ threshold: 0 });
    return () => observer.unwatch();
  }, [observer]);
  return <ObserverContext value={observer}>{children}</ObserverContext>;
}

function useObserver() {
  const observer = use(ObserverContext);
  if (!observer) throw new Error("Component must be used under <AnchorProvider />.");
  return observer;
}

function useObserverValue<T>(get: (o: Observer) => T): T {
  const observer = useObserver();
  const getSnapshot = () => get(observer);
  return useSyncExternalStore(observer.subscribe, getSnapshot, getSnapshot);
}

export function useActiveAnchor() {
  return useObserverValue((o) => o.activeAnchor);
}

/** Static accessor for the current items — for custom render logic (e.g. the thumb's initial position). */
export function useTOC() {
  const observer = useObserver();
  return useMemo(() => ({ get: () => observer.items }), [observer]);
}

/** Subscribe to every observer update (the thumb recomputes its track from the active items). */
export function useTOCListener(listener: (items: TOCItemState[]) => void) {
  const observer = useObserver();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => observer.subscribe((items) => ref.current(items)), [observer]);
}

/** A single anchor link that reports its active state via `data-active`. */
export function TOCItem({
  onActiveChange,
  ...props
}: React.ComponentProps<"a"> & { onActiveChange?: (active: boolean) => void }) {
  const id = props.href ? getItemId(props.href) : null;
  const active = useObserverValue((o) => id !== null && o.activeAnchors.includes(id));
  const prevActiveRef = useRef(active);
  if (prevActiveRef.current !== active) {
    prevActiveRef.current = active;
    onActiveChange?.(active);
  }
  return <a data-active={String(active)} {...props} />;
}
