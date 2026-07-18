import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@ChannelGuide/ui/components/collapsible";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Response } from "./response";

/**
 * AI Elements' Reasoning, rebuilt on base-lyra — a collapsible that shows the model's reasoning
 * (thinking) as muted markdown, collapsed by default.
 */

export function Reasoning({ className, ...props }: ComponentProps<typeof Collapsible>) {
  return <Collapsible className={cn("text-muted-foreground w-full", className)} {...props} />;
}

export function ReasoningTrigger({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <CollapsibleTrigger className={cn("flex items-center gap-1.5 text-xs", className)}>
      <BrainIcon className="size-3.5" />
      {children ?? "Reasoning"}
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
