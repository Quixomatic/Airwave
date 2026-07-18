import { Button } from "@ChannelGuide/ui/components/button";
import { Textarea } from "@ChannelGuide/ui/components/textarea";
import { Loader2Icon, SendIcon, SquareIcon } from "lucide-react";
import type { ComponentProps, FormEvent } from "react";

import { cn } from "@/lib/utils";

/**
 * AI Elements' PromptInput (core), rebuilt on base-lyra. A form wrapping a textarea + submit; Enter
 * submits (Shift+Enter for a newline). `onSubmit` receives the typed text. The advanced pieces
 * (attachments / action menu / model selector / speech) are intentionally omitted — the
 * channel-building assistant doesn't need them; add base-lyra equivalents if we ever do.
 */

export type PromptInputMessage = { text: string };

export type PromptInputProps = Omit<ComponentProps<"form">, "onSubmit"> & {
  onSubmit: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => void;
};

export function PromptInput({ className, onSubmit, ...props }: PromptInputProps) {
  return (
    <form
      className={cn("bg-background flex w-full flex-col divide-y overflow-hidden rounded-xl border shadow-sm", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const text = String(new FormData(e.currentTarget).get("message") ?? "").trim();
        if (!text) return;
        onSubmit({ text }, e);
      }}
      {...props}
    />
  );
}

export function PromptInputBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col", className)} {...props} />;
}

export type PromptInputTextareaProps = ComponentProps<typeof Textarea>;
export function PromptInputTextarea({ className, onKeyDown, ...props }: PromptInputTextareaProps) {
  return (
    <Textarea
      name="message"
      className={cn("max-h-40 min-h-[44px] w-full resize-none rounded-none border-none bg-transparent p-3 shadow-none outline-none focus-visible:ring-0", className)}
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

export function PromptInputToolbar({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-between p-1.5", className)} {...props} />;
}

export function PromptInputTools({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-1", className)} {...props} />;
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
