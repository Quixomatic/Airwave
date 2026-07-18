import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";

import { cn } from "@/lib/utils";

/**
 * AI Elements' Response, rebuilt on base-lyra. Renders (streaming) markdown via streamdown — handles
 * incomplete markdown mid-stream, code blocks, lists, etc.
 */

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      {...props}
    />
  ),
  (prev, next) => prev.children === next.children,
);
Response.displayName = "Response";
