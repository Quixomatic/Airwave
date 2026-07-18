import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useMatches, useNavigate, useSearch } from "@tanstack/react-router";

import { AiChatPanel } from "@/components/ai/ai-chat-panel";

/**
 * Side-panel system, ported from BasicTimeTracker. Two parallel modes:
 *
 *   1. Route-driven panels — opened by `?panel=<type>` on the URL (shareable / refresh-survivable).
 *      Content for each `<type>` is declared by the matched route's context
 *      (`{ detailsPanelConfig: { panels: { ... } } }`). Use for "edit this record" panels.
 *   2. Global panels — opened via local React state; persist across navigation; declared statically
 *      in GLOBAL_PANELS. Use for always-available panels like the AI assistant.
 *
 * Global takes precedence over route (opening the AI chat overlays whatever record panel was open).
 */

export type PanelVariant = "default" | "full";

export type PanelConfig = {
  title: string;
  content: ReactNode;
  /** "default" = padded scrollable body. "full" = no padding, self-manages scroll (e.g. the chat). */
  variant?: PanelVariant;
};

/** Per-route panel config. Routes declare via their loader/context. */
export type DetailsPanelConfig = {
  panels: Record<string, PanelConfig>;
};

/** Union of every global panel type. Extend when adding always-available panels. */
export type GlobalPanelType = "chat";

const GLOBAL_PANEL_TYPES = new Set<GlobalPanelType>(["chat"]);

/** Statically declared global panels. Keys must match GlobalPanelType. */
export const GLOBAL_PANELS: Partial<Record<GlobalPanelType, PanelConfig>> = {
  chat: { title: "AI Assistant", content: <AiChatPanel />, variant: "full" },
};

function isGlobalType(type: string): type is GlobalPanelType {
  return GLOBAL_PANEL_TYPES.has(type as GlobalPanelType);
}

type ContextValue = {
  panelType: string | null;
  isOpen: boolean;
  isGlobalPanel: boolean;
  globalPanelType: GlobalPanelType | null;
  openRoutePanel: (type: string) => void;
  closeRoutePanel: () => void;
  toggleRoutePanel: (type: string) => void;
  openGlobalPanel: (type: GlobalPanelType) => void;
  closeGlobalPanel: () => void;
  toggleGlobalPanel: (type: GlobalPanelType) => void;
  // Auto-routing convenience — picks the mode from whether `type` is a declared global panel.
  openPanel: (type: string) => void;
  closePanel: () => void;
  togglePanel: (type: string) => void;
};

const DetailsPanelContext = createContext<ContextValue | undefined>(undefined);

// This router build strictly types search params to each route's `validateSearch`; our `panel` param
// is an undeclared passthrough, so we navigate through a loosened signature.
type LooseNav = (opts: { search: (prev: Record<string, unknown>) => Record<string, unknown> }) => void;

export function DetailsPanelProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate() as unknown as LooseNav;
  const search = useSearch({ strict: false }) as { panel?: string };
  const [globalPanelType, setGlobalPanelType] = useState<GlobalPanelType | null>(null);

  const routePanelType = search.panel ?? null;
  const isGlobalPanelOpen = globalPanelType !== null;
  const isRoutePanelOpen = routePanelType !== null;

  const panelType = isGlobalPanelOpen ? (globalPanelType as string) : routePanelType;
  const isGlobalPanel = isGlobalPanelOpen;
  const isOpen = isGlobalPanelOpen || isRoutePanelOpen;

  const openRoutePanel = useCallback(
    (type: string) => {
      nav({ search: (prev) => ({ ...prev, panel: type }) });
    },
    [nav],
  );
  const closeRoutePanel = useCallback(() => {
    nav({
      search: (prev) => {
        const next = { ...prev };
        delete next.panel;
        return next;
      },
    });
  }, [nav]);
  const toggleRoutePanel = useCallback(
    (type: string) => {
      if (routePanelType === type) closeRoutePanel();
      else openRoutePanel(type);
    },
    [routePanelType, openRoutePanel, closeRoutePanel],
  );

  const openGlobalPanel = useCallback((type: GlobalPanelType) => setGlobalPanelType(type), []);
  const closeGlobalPanel = useCallback(() => setGlobalPanelType(null), []);
  const toggleGlobalPanel = useCallback((type: GlobalPanelType) => setGlobalPanelType((prev) => (prev === type ? null : type)), []);

  const openPanel = useCallback(
    (type: string) => {
      if (isGlobalType(type)) openGlobalPanel(type);
      else openRoutePanel(type);
    },
    [openGlobalPanel, openRoutePanel],
  );
  const closePanel = useCallback(() => {
    if (isGlobalPanelOpen) closeGlobalPanel();
    else closeRoutePanel();
  }, [isGlobalPanelOpen, closeGlobalPanel, closeRoutePanel]);
  const togglePanel = useCallback(
    (type: string) => {
      if (isGlobalType(type)) toggleGlobalPanel(type);
      else toggleRoutePanel(type);
    },
    [toggleGlobalPanel, toggleRoutePanel],
  );

  const value = useMemo<ContextValue>(
    () => ({
      panelType,
      isOpen,
      isGlobalPanel,
      globalPanelType,
      openRoutePanel,
      closeRoutePanel,
      toggleRoutePanel,
      openGlobalPanel,
      closeGlobalPanel,
      toggleGlobalPanel,
      openPanel,
      closePanel,
      togglePanel,
    }),
    [
      panelType,
      isOpen,
      isGlobalPanel,
      globalPanelType,
      openRoutePanel,
      closeRoutePanel,
      toggleRoutePanel,
      openGlobalPanel,
      closeGlobalPanel,
      toggleGlobalPanel,
      openPanel,
      closePanel,
      togglePanel,
    ],
  );

  return <DetailsPanelContext.Provider value={value}>{children}</DetailsPanelContext.Provider>;
}

export function useDetailsPanel() {
  const ctx = useContext(DetailsPanelContext);
  if (!ctx) throw new Error("useDetailsPanel must be used within a DetailsPanelProvider");
  return ctx;
}

/** Resolve the active panel config — global from GLOBAL_PANELS, else the matched route's config. */
export function useResolvedPanel(): PanelConfig | undefined {
  const { panelType, isGlobalPanel, globalPanelType } = useDetailsPanel();
  const matches = useMatches();

  if (isGlobalPanel && globalPanelType) return GLOBAL_PANELS[globalPanelType];
  if (!panelType) return undefined;

  const routeConfig = matches
    .slice()
    .reverse()
    .find((m) => (m.context as { detailsPanelConfig?: DetailsPanelConfig })?.detailsPanelConfig)?.context as
    | { detailsPanelConfig?: DetailsPanelConfig }
    | undefined;

  return routeConfig?.detailsPanelConfig?.panels?.[panelType];
}
