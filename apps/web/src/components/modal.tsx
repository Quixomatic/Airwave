import { Card } from "@airwave/ui/components/card";
import { useEffect, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A minimal centered modal — a dimmed overlay + a Card, closable by clicking the backdrop or pressing
 * Escape. Deliberately lightweight (no focus-trap library); we use it for the handful of admin
 * confirmations (delete source, refresh styling, the generator picker) rather than pulling in a full
 * dialog system.
 */
export function Modal({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <Card className={cn("w-full max-w-md p-6", className)} onClick={(e) => e.stopPropagation()}>
        {children}
      </Card>
    </div>
  );
}
