import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMatches } from "@tanstack/react-router";

type Override = { matchId: string; label: string } | null;

const BreadcrumbContext = createContext<{
  override: Override;
  setOverride: (o: Override) => void;
} | null>(null);

/**
 * Holds a single "deepest-match dynamic breadcrumb override" that pages can
 * publish via `useBreadcrumb()` when the label depends on async data (e.g.,
 * a source's name fetched after route match). Static labels live on each
 * route's `staticData.breadcrumb`; this is only the override mechanism.
 */
export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<Override>(null);
  // Memoize so consumers don't see a new reference every parent re-render.
  const value = useMemo(() => ({ override, setOverride }), [override]);
  return (
    <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>
  );
}

/**
 * Publish a dynamic breadcrumb label for the current (deepest) route match.
 * Pass `undefined` while loading — the route's static `breadcrumb` fallback
 * is rendered until a real label is ready.
 */
export function useBreadcrumb(label: string | undefined): void {
  const ctx = useContext(BreadcrumbContext);
  const matches = useMatches();
  // Target the DEEPEST match that declares a breadcrumb — so a LAYOUT route (e.g. `users/$id`) can own a
  // dynamic label even when its active child is a tabbed sub-page (Overview/Access) with no breadcrumb of
  // its own. For a leaf detail route that itself has the breadcrumb (channels/$channelId), this is still
  // that same route, so existing callers are unaffected.
  const currentMatchId = [...matches].reverse().find((m) => m.staticData?.breadcrumb !== undefined)?.id;
  // Depend on the stable setter, not the whole ctx object, to stay loop-proof.
  const setOverride = ctx?.setOverride;

  useEffect(() => {
    if (!setOverride || !label || !currentMatchId) return;
    setOverride({ matchId: currentMatchId, label });
    return () => setOverride(null);
  }, [setOverride, label, currentMatchId]);
}

export function useBreadcrumbOverride(): Override {
  const ctx = useContext(BreadcrumbContext);
  if (!ctx) {
    throw new Error("useBreadcrumbOverride must be used within a BreadcrumbProvider");
  }
  return ctx.override;
}
