import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@airwave/ui/components/collapsible";
import { CheckCircle2Icon, ChevronDownIcon, CircleIcon, Loader2Icon, ShieldQuestionIcon, WrenchIcon, XCircleIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * AI Elements' Tool, rebuilt on base-lyra — renders one tool call in the thread as a collapsible
 * card: header (name + status), input params, and output/error. States mirror the AI SDK's tool part
 * lifecycle (incl. `approval-requested` for write tools awaiting the admin's OK).
 */

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error";

export type ToolProps = ComponentProps<typeof Collapsible>;
export function Tool({ className, ...props }: ToolProps) {
  return <Collapsible className={cn("bg-muted/40 w-full rounded-lg border", className)} {...props} />;
}

const STATUS: Record<ToolState, { label: string; icon: ReactNode }> = {
  "input-streaming": { label: "Preparing", icon: <CircleIcon className="size-3.5" /> },
  "input-available": { label: "Running", icon: <Loader2Icon className="size-3.5 animate-spin" /> },
  "approval-requested": { label: "Needs approval", icon: <ShieldQuestionIcon className="size-3.5 text-amber-600" /> },
  "approval-responded": { label: "Working", icon: <Loader2Icon className="size-3.5 animate-spin" /> },
  "output-available": { label: "Done", icon: <CheckCircle2Icon className="size-3.5 text-emerald-600" /> },
  "output-error": { label: "Error", icon: <XCircleIcon className="size-3.5 text-red-600" /> },
};

// Fallback keeps the panel alive if the AI SDK ever adds another part state we don't map.
const FALLBACK = { label: "Working", icon: <CircleIcon className="size-3.5" /> };

export function ToolHeader({ type, state, className }: { type: string; state: ToolState; className?: string }) {
  const s = STATUS[state] ?? FALLBACK;
  return (
    <CollapsibleTrigger className={cn("flex w-full items-center gap-2 p-2 text-left text-sm", className)}>
      <WrenchIcon className="text-muted-foreground size-3.5 shrink-0" />
      <span className="font-medium">{type.replace(/^tool-/, "")}</span>
      <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
        {s.icon}
        {s.label}
      </span>
      <ChevronDownIcon className="text-muted-foreground size-3.5" />
    </CollapsibleTrigger>
  );
}

export function ToolContent({ className, ...props }: ComponentProps<typeof CollapsibleContent>) {
  return <CollapsibleContent className={cn("border-t", className)} {...props} />;
}

export function ToolInput({ input }: { input: unknown }) {
  if (input === undefined || input === null) return null;
  return (
    <div className="p-2">
      <div className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wide uppercase">Input</div>
      <pre className="bg-muted max-h-48 overflow-auto rounded-md p-2 text-xs">{JSON.stringify(input, null, 2)}</pre>
    </div>
  );
}

export function ToolOutput({ output, errorText }: { output?: unknown; errorText?: string }) {
  if (output === undefined && !errorText) return null;
  return (
    <div className="border-t p-2">
      <div className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wide uppercase">{errorText ? "Error" : "Output"}</div>
      {errorText ? (
        <pre className="max-h-48 overflow-auto text-xs text-red-600">{errorText}</pre>
      ) : (
        <pre className="bg-muted max-h-64 overflow-auto rounded-md p-2 text-xs">
          {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
        </pre>
      )}
    </div>
  );
}
