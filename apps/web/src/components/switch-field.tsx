import { Switch } from "@airwave/ui/components/switch";
import type { ReactNode } from "react";

/**
 * A labeled switch row: the switch sits in a left gutter, with the label and a width-limited description
 * aligned in a column beside it (the description lines up under the label, not the switch). The whole row is
 * a `<label>`, so clicking anywhere toggles. For settings toggles with an explanatory blurb.
 */
export function SwitchField({
  checked,
  onCheckedChange,
  label,
  description,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <Switch className="mt-0.5 shrink-0" checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
      <span className="space-y-1">
        <span className="block font-medium">{label}</span>
        {description && <span className="text-muted-foreground block max-w-prose text-xs">{description}</span>}
      </span>
    </label>
  );
}
