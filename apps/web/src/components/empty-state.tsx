import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Centered empty-state for list/panel views — a tinted icon disc, a title, an optional line of
 * guidance, and an optional call-to-action. Drop it inside a `FramePanel` (in place of the list) so
 * an empty channels/packages/sources/users view reads as intentional rather than broken.
 *
 * `variant="compact"` lays it out horizontally — a smaller icon disc in a left gutter with the text
 * left-aligned beside it, the whole group still centered — and trims the vertical padding, for a
 * secondary empty slot that shouldn't claim a full panel's height (e.g. a sub-section below a list).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "default",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: "default" | "compact";
}) {
  if (variant === "compact") {
    return (
      <div className="flex items-center justify-center px-6 py-8">
        <div className="flex items-center gap-3 text-left">
          <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
            <Icon className="size-5" strokeWidth={1.5} />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">{title}</p>
            {description && <p className="text-muted-foreground max-w-sm text-xs">{description}</p>}
            {action && <div className="mt-1.5">{action}</div>}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
        <Icon className="size-6" strokeWidth={1.5} />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="text-muted-foreground mx-auto max-w-sm text-sm">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
