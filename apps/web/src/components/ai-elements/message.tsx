import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * AI Elements' Message / MessageContent, rebuilt on base-lyra. `from` drives alignment + bubble
 * color via a group class (user = right/primary, assistant = left/muted).
 */

export type MessageProps = HTMLAttributes<HTMLDivElement> & { from: "user" | "assistant" | "system" };
export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      data-from={from}
      className={cn(
        "group flex w-full items-end gap-2 py-1.5",
        from === "user" ? "is-user justify-end" : "is-assistant justify-start",
        className,
      )}
      {...props}
    />
  );
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;
export function MessageContent({ className, children, ...props }: MessageContentProps) {
  return (
    <div
      className={cn(
        "flex max-w-[85%] flex-col gap-2 overflow-hidden rounded-lg px-3 py-2 text-sm",
        "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground",
        "group-[.is-assistant]:bg-muted group-[.is-assistant]:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
