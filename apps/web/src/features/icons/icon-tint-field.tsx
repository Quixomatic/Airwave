import { AccentIconTile } from "@airwave/ui/components/accent-icon-tile";
import { ACCENT_PALETTE } from "@airwave/ui/lib/accent-palette";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

import { type IconComponent } from "./icon-set";
import { IconPicker } from "./icon-picker";
import { resolveTile } from "./app-icon";

/**
 * Icon + accent control for a channel/package. The preview tile opens the icon picker; the swatch
 * row sets the accent (stored as a palette KEY). When `inherited*` is provided (a channel's
 * package), leaving these unset shows the inherited look, and "Reset" clears the override so it
 * keeps following the package.
 */
export function IconTintField({
  icon,
  tint,
  onIconChange,
  onTintChange,
  inheritedIcon,
  inheritedTint,
  defaultIcon,
}: {
  icon: string | null;
  tint: string | null;
  onIconChange: (icon: string | null) => void;
  onTintChange: (tint: string | null) => void;
  inheritedIcon?: string | null;
  inheritedTint?: string | null;
  defaultIcon: IconComponent;
}) {
  const preview = resolveTile({ icon, tint, inheritedIcon, inheritedTint, defaultIcon });
  const overridden = icon !== null || tint !== null;

  return (
    <div className="flex items-center gap-4">
      <IconPicker
        value={icon ?? undefined}
        onChange={onIconChange}
        trigger={
          <button
            type="button"
            className="hover:bg-accent focus-visible:ring-ring flex items-center gap-1 rounded-lg p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            title="Choose icon"
          >
            <AccentIconTile icon={preview.Icon} tint={preview.tint} size="xl" />
            <ChevronDown className="text-muted-foreground size-4 shrink-0" />
          </button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {ACCENT_PALETTE.map((s) => (
          <AccentSwatch
            key={s.key}
            vivid={s.vivid}
            name={s.name}
            selected={tint === s.key}
            onClick={() => onTintChange(s.key)}
          />
        ))}
      </div>

      {overridden && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground text-xs"
          onClick={() => {
            onIconChange(null);
            onTintChange(null);
          }}
        >
          Reset
        </button>
      )}
    </div>
  );
}

/** A vivid rounded-square swatch for the accent picker (small surface → the saturated value). */
function AccentSwatch({
  vivid,
  name,
  selected,
  onClick,
}: {
  vivid: string;
  name: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={name}
      className={cn(
        "size-6 rounded-md ring-offset-2 ring-offset-background transition-shadow",
        selected && "ring-foreground ring-2",
      )}
      style={{ background: vivid }}
    />
  );
}
