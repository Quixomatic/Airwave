import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type HeaderContextValue = {
  leftNode: HTMLElement | null;
  centerNode: HTMLElement | null;
  rightNode: HTMLElement | null;
  setLeftNode: (n: HTMLElement | null) => void;
  setCenterNode: (n: HTMLElement | null) => void;
  setRightNode: (n: HTMLElement | null) => void;
};

const HeaderContext = createContext<HeaderContextValue | null>(null);

/**
 * Header slot system, portal-based (NOT setState-with-JSX slots — those loop).
 * The layout renders the slot containers (HeaderLeftSlot etc.) which register
 * their DOM node via a ref callback; pages portal content in with HeaderLeft /
 * HeaderCenter / HeaderRight. React reconciles the portal children natively.
 */
export function HeaderProvider({ children }: { children: ReactNode }) {
  const [leftNode, setLeftNode] = useState<HTMLElement | null>(null);
  const [centerNode, setCenterNode] = useState<HTMLElement | null>(null);
  const [rightNode, setRightNode] = useState<HTMLElement | null>(null);
  return (
    <HeaderContext.Provider
      value={{
        leftNode,
        centerNode,
        rightNode,
        setLeftNode,
        setCenterNode,
        setRightNode,
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

/* ---- Slot containers (rendered by the layout header) -------------------- */

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

/* ---- Portal targets (used by pages) ------------------------------------- */

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
