import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type HeaderContextValue = {
  // Sub-header (inside the inset card)
  leftNode: HTMLElement | null;
  centerNode: HTMLElement | null;
  rightNode: HTMLElement | null;
  setLeftNode: (n: HTMLElement | null) => void;
  setCenterNode: (n: HTMLElement | null) => void;
  setRightNode: (n: HTMLElement | null) => void;
  // Top header (above the inset card, spans the width right of the sidebar)
  topLeftNode: HTMLElement | null;
  topCenterNode: HTMLElement | null;
  topRightNode: HTMLElement | null;
  setTopLeftNode: (n: HTMLElement | null) => void;
  setTopCenterNode: (n: HTMLElement | null) => void;
  setTopRightNode: (n: HTMLElement | null) => void;
};

const HeaderContext = createContext<HeaderContextValue | null>(null);

/**
 * Header slot system, portal-based (NOT setState-with-JSX slots — those loop).
 *
 * Two parallel header bars:
 *   - TopHeader  — sits above the inset card, transparent, spans the width to
 *                  the right of the sidebar. Portal via <TopHeaderLeft/Center/Right>.
 *   - SubHeader  — lives inside the inset card. Page-level slots.
 *                  Portal via <HeaderLeft/Center/Right>.
 *
 * The container divs register via ref callbacks; consumers portal in with the
 * matching target component. React reconciles natively.
 */
export function HeaderProvider({ children }: { children: ReactNode }) {
  const [leftNode, setLeftNode] = useState<HTMLElement | null>(null);
  const [centerNode, setCenterNode] = useState<HTMLElement | null>(null);
  const [rightNode, setRightNode] = useState<HTMLElement | null>(null);
  const [topLeftNode, setTopLeftNode] = useState<HTMLElement | null>(null);
  const [topCenterNode, setTopCenterNode] = useState<HTMLElement | null>(null);
  const [topRightNode, setTopRightNode] = useState<HTMLElement | null>(null);
  return (
    <HeaderContext.Provider
      value={{
        leftNode,
        centerNode,
        rightNode,
        setLeftNode,
        setCenterNode,
        setRightNode,
        topLeftNode,
        topCenterNode,
        topRightNode,
        setTopLeftNode,
        setTopCenterNode,
        setTopRightNode,
      }}
    >
      {children}
    </HeaderContext.Provider>
  );
}

function useHeaderCtx() {
  const ctx = useContext(HeaderContext);
  if (!ctx) {
    throw new Error("Header components must be used within a HeaderProvider");
  }
  return ctx;
}

/* ---- Sub-header slot containers (inside the inset card) ----------------- */

export function HeaderLeftSlot(props: ComponentProps<"div">) {
  const { setLeftNode } = useHeaderCtx();
  return <div ref={setLeftNode} {...props} />;
}

export function HeaderCenterSlot(props: ComponentProps<"div">) {
  const { setCenterNode } = useHeaderCtx();
  return <div ref={setCenterNode} {...props} />;
}

export function HeaderRightSlot(props: ComponentProps<"div">) {
  const { setRightNode } = useHeaderCtx();
  return <div ref={setRightNode} {...props} />;
}

/* ---- Top-header slot containers (above the inset card) ------------------ */

export function TopHeaderLeftSlot(props: ComponentProps<"div">) {
  const { setTopLeftNode } = useHeaderCtx();
  return <div ref={setTopLeftNode} {...props} />;
}

export function TopHeaderCenterSlot(props: ComponentProps<"div">) {
  const { setTopCenterNode } = useHeaderCtx();
  return <div ref={setTopCenterNode} {...props} />;
}

export function TopHeaderRightSlot(props: ComponentProps<"div">) {
  const { setTopRightNode } = useHeaderCtx();
  return <div ref={setTopRightNode} {...props} />;
}

/* ---- Sub-header portal targets ------------------------------------------ */

export function HeaderLeft({ children }: { children: ReactNode }) {
  const { leftNode } = useHeaderCtx();
  return leftNode ? createPortal(children, leftNode) : null;
}

export function HeaderCenter({ children }: { children: ReactNode }) {
  const { centerNode } = useHeaderCtx();
  return centerNode ? createPortal(children, centerNode) : null;
}

export function HeaderRight({ children }: { children: ReactNode }) {
  const { rightNode } = useHeaderCtx();
  return rightNode ? createPortal(children, rightNode) : null;
}

/* ---- Top-header portal targets ------------------------------------------ */

export function TopHeaderLeft({ children }: { children: ReactNode }) {
  const { topLeftNode } = useHeaderCtx();
  return topLeftNode ? createPortal(children, topLeftNode) : null;
}

export function TopHeaderCenter({ children }: { children: ReactNode }) {
  const { topCenterNode } = useHeaderCtx();
  return topCenterNode ? createPortal(children, topCenterNode) : null;
}

export function TopHeaderRight({ children }: { children: ReactNode }) {
  const { topRightNode } = useHeaderCtx();
  return topRightNode ? createPortal(children, topRightNode) : null;
}
