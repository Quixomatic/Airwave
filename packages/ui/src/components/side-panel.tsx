import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@ChannelGuide/ui/lib/utils";
import { Button } from "@ChannelGuide/ui/components/button";

/**
 * Reusable side-panel primitives — composable header / body / footer for any slide-in surface.
 * Ported from BasicTimeTracker (which took the header layout from Twenty's record side panel: close
 * on the LEFT, title next to it, meta on the right).
 *
 *   <SidePanelHeader>
 *     <SidePanelClose onClick={…} />
 *     <SidePanelHeaderTitle>Acme Corp</SidePanelHeaderTitle>
 *     <SidePanelHeaderMeta>Created 30 days ago</SidePanelHeaderMeta>
 *   </SidePanelHeader>
 *   <SidePanelBody>…</SidePanelBody>
 *   <SidePanelFooter><Button>Open</Button></SidePanelFooter>
 */

export function SidePanelHeader({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="side-panel-header"
      className={cn("border-border flex h-10 shrink-0 items-center gap-2 border-b px-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidePanelHeaderTitle({ children, className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="side-panel-header-title"
      className={cn("flex min-w-0 items-center truncate text-sm font-semibold", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidePanelHeaderMeta({ children, className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="side-panel-header-meta"
      className={cn("text-muted-foreground flex shrink-0 items-center text-xs", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidePanelHeaderActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="side-panel-header-actions" className={cn("flex shrink-0 items-center gap-1", className)} {...props} />;
}

export function SidePanelClose({ onClick, className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="Close panel"
      className={cn("size-7 shrink-0", className)}
      {...props}
    >
      <X className="h-4 w-4" />
    </Button>
  );
}

export function SidePanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="side-panel-body" className={cn("flex flex-1 flex-col gap-4 overflow-y-auto p-3", className)} {...props} />;
}

export function SidePanelFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="side-panel-footer"
      className={cn("border-border bg-muted/30 flex shrink-0 items-center justify-end gap-2 border-t px-3 py-2", className)}
      {...props}
    />
  );
}
