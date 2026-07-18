import { Button } from "@ChannelGuide/ui/components/button";
import { Textarea } from "@ChannelGuide/ui/components/textarea";
import { Loader2Icon, SendIcon, SquareIcon } from "lucide-react";
import type { ComponentProps, FormEvent } from "react";

import { cn } from "@/lib/utils";

/**
 * AI Elements' PromptInput, rebuilt on base-lyra. The whole input is one bordered card: a textarea
 * on top, a divider, then a footer row (tools on the left, submit on the right) — and the focus ring
 * wraps the ENTIRE card (via `focus-within`), not just the textarea, so it reads as a single control.
 * Enter submits, Shift+Enter newlines; the textarea auto-grows (`field-sizing`). The advanced pieces
 * (attachments / action menu / model selector / speech) are intentionally omitted for now.
 */

export type PromptInputMessage = { text: string };

export type PromptInputProps = Omit<ComponentProps<"form">, "onSubmit"> & {
  onSubmit: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => void;
};

export function PromptInput({ className, onSubmit, ...props }: PromptInputProps) {
  return (
    <form
      className={cn(
        "bg-background w-full divide-y overflow-hidden rounded-xl border shadow-sm transition-colors",
        "focus-within:border-ring focus-within:ring-ring/40 focus-within:ring-[3px]",
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault();
        const text = String(new FormData(e.currentTarget).get("message") ?? "").trim();
        if (!text) return;
        onSubmit({ text }, e);
        e.currentTarget.reset();
      }}
      {...props}
    />
  );
}

export function PromptInputHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center gap-2 p-2 empty:hidden", className)} {...props} />;
}

export function PromptInputBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col", className)} {...props} />;
}

export type PromptInputTextareaProps = ComponentProps<typeof Textarea>;
export function PromptInputTextarea({ className, onKeyDown, ...props }: PromptInputTextareaProps) {
  return (
    <Textarea
      name="message"
      className={cn(
        // No own border/ring — the parent card owns the focus ring.
        "max-h-64 min-h-[96px] w-full resize-none rounded-none border-none bg-transparent p-3 shadow-none outline-none [field-sizing:content] focus-visible:ring-0 dark:bg-transparent",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.form?.requestSubmit();
        }
        onKeyDown?.(e);
      }}
      {...props}
    />
  );
}

export function PromptInputFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-between gap-1 p-1.5", className)} {...props} />;
}
/** Alias kept for the AI Elements toolbar naming. */
export const PromptInputToolbar = PromptInputFooter;

export function PromptInputTools({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-1", className)} {...props} />;
}

/** A small ghost button for the footer (attachments, model indicator, etc.). */
export function PromptInputButton({ className, size = "sm", variant = "ghost", ...props }: ComponentProps<typeof Button>) {
  return <Button type="button" size={size} variant={variant} className={cn("text-muted-foreground h-7 gap-1 rounded-lg px-2 text-xs", className)} {...props} />;
}

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
  status?: "submitted" | "streaming" | "ready" | "error";
};
export function PromptInputSubmit({ className, status, children, ...props }: PromptInputSubmitProps) {
  let icon = <SendIcon className="size-4" />;
  if (status === "submitted" || status === "streaming") icon = <Loader2Icon className="size-4 animate-spin" />;
  else if (status === "error") icon = <SquareIcon className="size-4" />;
  return (
    <Button type="submit" size="icon" className={cn("size-8 rounded-lg", className)} {...props}>
      {children ?? icon}
    </Button>
  );
}
