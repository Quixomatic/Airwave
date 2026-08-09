import { Button } from "@airwave/ui/components/button";
import { ArrowDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

import { cn } from "@/lib/utils";

/**
 * AI Elements' Conversation, rebuilt on base-lyra + use-stick-to-bottom (the AI Elements registry
 * assumes stock shadcn and clashes with base-lyra, so we ship our own equivalents). A scroll region
 * that auto-sticks to the bottom as messages stream, with a "scroll to bottom" button when scrolled up.
 */

export type ConversationProps = ComponentProps<typeof StickToBottom>;
export function Conversation({ className, ...props }: ConversationProps) {
  return <StickToBottom className={cn("relative flex-1 overflow-y-auto", className)} initial="smooth" resize="smooth" role="log" {...props} />;
}

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;
export function ConversationContent({ className, ...props }: ConversationContentProps) {
  return <StickToBottom.Content className={cn("flex flex-col gap-1 p-3", className)} {...props} />;
}

export function ConversationScrollButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-sm"
      onClick={() => void scrollToBottom()}
      aria-label="Scroll to bottom"
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  );
}
