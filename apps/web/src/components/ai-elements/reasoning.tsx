import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@airwave/ui/components/collapsible";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Response } from "./response";

/**
 * AI Elements' Reasoning, rebuilt on base-lyra. Conveys the model's LIVE thinking: while its reasoning
 * part streams, it auto-expands and ticks a "Thinking… Ns" label; when it finishes it reports "Thought
 * for Ns" and auto-collapses. Reasoning loaded from history (never observed streaming) is a quiet
 * collapsed "Reasoning". Pass `isStreaming={part.state === "streaming"}` from the message part.
 */

type ReasoningState = { streaming: boolean; seconds: number; measured: boolean };
const ReasoningContext = createContext<ReasoningState>({ streaming: false, seconds: 0, measured: false });

export function Reasoning({
  className,
  isStreaming = false,
  children,
  ...props
}: Omit<ComponentProps<typeof Collapsible>, "open" | "onOpenChange"> & { isStreaming?: boolean }) {
  const [open, setOpen] = useState(isStreaming);
  const [seconds, setSeconds] = useState(0);
  const [measured, setMeasured] = useState(false);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (isStreaming) {
      startRef.current ??= Date.now();
      setOpen(true);
      const tick = () => startRef.current && setSeconds(Math.max(1, Math.round((Date.now() - startRef.current) / 1000)));
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }
    // Ended (only if we actually observed a start — otherwise it's history, stay quiet).
    if (startRef.current) {
      setSeconds(Math.max(1, Math.round((Date.now() - startRef.current) / 1000)));
      setMeasured(true);
      startRef.current = null;
      const t = setTimeout(() => setOpen(false), 800);
      return () => clearTimeout(t);
    }
  }, [isStreaming]);

  return (
    <ReasoningContext.Provider value={{ streaming: isStreaming, seconds, measured }}>
      <Collapsible open={open} onOpenChange={setOpen} className={cn("text-muted-foreground w-full", className)} {...props}>
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  );
}

export function ReasoningTrigger({ className, children }: { className?: string; children?: ReactNode }) {
  const { streaming, seconds, measured } = useContext(ReasoningContext);
  const label = children ?? (streaming ? `Thinking… ${seconds}s` : measured ? `Thought for ${seconds}s` : "Reasoning");
  return (
    <CollapsibleTrigger className={cn("flex items-center gap-1.5 text-xs", className)}>
      <BrainIcon className={cn("size-3.5", streaming && "animate-pulse")} />
      <span className={cn(streaming && "animate-pulse")}>{label}</span>
      <ChevronDownIcon className="size-3.5" />
    </CollapsibleTrigger>
  );
}

export function ReasoningContent({ className, children }: { className?: string; children: string }) {
  return (
    <CollapsibleContent className={cn("mt-1", className)}>
      <Response className="text-xs opacity-80">{children}</Response>
    </CollapsibleContent>
  );
}

/** Standalone "Thinking…" bubble for the gap after submit, before the first streamed part arrives. */
export function ThinkingIndicator({ className }: { className?: string }) {
  return (
    <div className={cn("text-muted-foreground flex items-center gap-1.5 text-xs", className)}>
      <BrainIcon className="size-3.5 animate-pulse" />
      <span className="animate-pulse">Thinking…</span>
    </div>
  );
}
