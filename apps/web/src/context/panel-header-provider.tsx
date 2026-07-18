import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Lets the panel CONTENT publish dynamic header (title + right-side meta) AND footer chrome up to
 * the DetailsPanel via portals — so the header/footer can read the same live query state as the
 * body (no setState-with-JSX). See the `use-portals-not-slots` convention. Ported from BTT.
 *
 *   function EditChannelPanel() {
 *     const { data } = useQuery(...);
 *     return (
 *       <>
 *         <PanelHeaderTitle>{data?.name}</PanelHeaderTitle>
 *         <SidePanelBody>...</SidePanelBody>
 *         <PanelFooter><SaveButton /></PanelFooter>
 *       </>
 *     );
 *   }
 */

type PanelHeaderContextValue = {
  titleNode: HTMLElement | null;
  metaNode: HTMLElement | null;
  footerNode: HTMLElement | null;
  setTitleNode: (n: HTMLElement | null) => void;
  setMetaNode: (n: HTMLElement | null) => void;
  setFooterNode: (n: HTMLElement | null) => void;
};

const PanelHeaderContext = createContext<PanelHeaderContextValue | null>(null);

export function PanelHeaderProvider({ children }: { children: ReactNode }) {
  const [titleNode, setTitleNode] = useState<HTMLElement | null>(null);
  const [metaNode, setMetaNode] = useState<HTMLElement | null>(null);
  const [footerNode, setFooterNode] = useState<HTMLElement | null>(null);
  return (
    <PanelHeaderContext.Provider value={{ titleNode, metaNode, footerNode, setTitleNode, setMetaNode, setFooterNode }}>
      {children}
    </PanelHeaderContext.Provider>
  );
}

function usePanelHeaderCtx() {
  const ctx = useContext(PanelHeaderContext);
  if (!ctx) throw new Error("PanelHeader components must be used within a PanelHeaderProvider");
  return ctx;
}

/* ---- Slot containers (rendered by the panel chrome) -------------------- */

export function PanelHeaderTitleSlot(props: ComponentProps<"div">) {
  const { setTitleNode } = usePanelHeaderCtx();
  return <div ref={setTitleNode} {...props} />;
}

export function PanelHeaderMetaSlot(props: ComponentProps<"div">) {
  const { setMetaNode } = usePanelHeaderCtx();
  return <div ref={setMetaNode} {...props} />;
}

export function PanelFooterSlot(props: ComponentProps<"div">) {
  const { setFooterNode } = usePanelHeaderCtx();
  return <div ref={setFooterNode} {...props} />;
}

/* ---- Portal targets (rendered by panel content) ----------------------- */

export function PanelHeaderTitle({ children }: { children: ReactNode }) {
  const { titleNode } = usePanelHeaderCtx();
  return titleNode ? createPortal(children, titleNode) : null;
}

export function PanelHeaderMeta({ children }: { children: ReactNode }) {
  const { metaNode } = usePanelHeaderCtx();
  return metaNode ? createPortal(children, metaNode) : null;
}

export function PanelFooter({ children }: { children: ReactNode }) {
  const { footerNode } = usePanelHeaderCtx();
  return footerNode ? createPortal(children, footerNode) : null;
}
