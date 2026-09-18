import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A minimal alert banner for MDX. Just a tinted background block with padded text: no border, no accent bar
 * on the side, no icon. `type` picks the tint; `title` (optional) renders a bold lead line above the body.
 * Use in any doc or blog MDX, e.g. `<Alert type="warn" title="Heads up">Body with **markdown** and `code`.</Alert>`.
 */
type AlertType = "default" | "info" | "warn" | "danger" | "success";

const TINT: Record<AlertType, string> = {
  default: "bg-fd-muted",
  info: "bg-sky-500/10",
  warn: "bg-amber-500/10",
  danger: "bg-red-500/10",
  success: "bg-emerald-500/10",
};

export function Alert({
  type = "default",
  title,
  children,
}: {
  type?: AlertType;
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={cn("not-prose my-5 rounded-lg px-4 py-3.5 text-sm leading-relaxed text-fd-foreground", TINT[type])}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="[&_a]:font-medium [&_a]:text-fd-primary [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 dark:[&_code]:bg-white/10 [&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}
