import {
  TINT_TOKENS,
  TintedIconTile,
  type TintedIconTileTint,
} from "@ChannelGuide/ui/components/tinted-icon-tile";
import { Circle } from "lucide-react";

import { cn } from "@/lib/utils";

import { type IconComponent } from "./icon-set";
import { IconPicker } from "./icon-picker";
import { resolveTile } from "./app-icon";

/**
 * Icon + tint control for a channel/package. The preview tile opens the icon
 * picker; the swatch row sets the tint. When `inherited*` is provided (a channel's
 * package), leaving these unset shows the inherited look, and "Reset" clears the
 * override so it keeps following the package.
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
            className="hover:bg-accent focus-visible:ring-ring rounded-md p-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            title="Choose icon"
          >
            <TintedIconTile icon={preview.Icon} tint={preview.tint} size="lg" />
          </button>
        }
      />

      <div className="flex flex-wrap gap-1">
        {TINT_TOKENS.map((t) => (
          <TintSwatch key={t} tint={t} selected={tint === t} onClick={() => onTintChange(t)} />
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

function TintSwatch({
  tint,
  selected,
  onClick,
}: {
  tint: TintedIconTileTint;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tint}
      className={cn(
        "rounded-[5px] ring-offset-1 transition-shadow",
        selected && "ring-foreground ring-2",
      )}
    >
      <TintedIconTile icon={Circle} tint={tint} size="md" />
    </button>
  );
}
