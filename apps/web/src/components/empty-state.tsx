import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Centered empty-state for list/panel views — a tinted icon disc, a title, an optional line of
 * guidance, and an optional call-to-action. Drop it inside a `FramePanel` (in place of the list) so
 * an empty channels/packages/sources/users view reads as intentional rather than broken.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
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
