import { type ComponentType, createElement } from "react";
import * as LucideIcons from "lucide-react";
import * as PhosphorIcons from "@phosphor-icons/react";

export type IconComponent = ComponentType<{ className?: string }>;

export type IconPickerItem = {
  /** Stable id stored in the DB — `lucide:Sparkles` / `phosphor:Television`. */
  id: string;
  label: string;
  subLabel: string;
  keywords: string[];
  Icon: IconComponent;
};

type PhosphorComponent = ComponentType<{ className?: string; weight?: string }>;

const LUCIDE = LucideIcons as unknown as Record<string, IconComponent>;
const PHOSPHOR = PhosphorIcons as unknown as Record<string, PhosphorComponent>;

// Non-icon exports to skip in each namespace.
const DENY = new Set([
  "Icon",
  "LucideIcon",
  "createLucideIcon",
  "icons",
  "IconContext",
  "IconBase",
  "SSRBase",
]);

const isComponentValue = (v: unknown): v is IconComponent =>
  typeof v === "function" || (typeof v === "object" && v !== null);

const isIconName = (k: string) => /^[A-Z][A-Za-z0-9]*$/.test(k) && !DENY.has(k);

/** Split PascalCase → space-separated words, for search ("TvMinimalPlay" → "tv minimal play"). */
const camelWords = (k: string) => k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

/** Wrap a phosphor icon so it always renders solid (fill weight). Cached per key. */
const phosphorFilledCache: Record<string, IconComponent> = {};
function phosphorFilled(key: string): IconComponent | null {
  const raw = PHOSPHOR[key];
  if (!raw) return null;
  if (!phosphorFilledCache[key]) {
    const Filled: IconComponent = (props) => createElement(raw, { weight: "fill", ...props });
    Filled.displayName = `Filled(${key})`;
    phosphorFilledCache[key] = Filled;
  }
  return phosphorFilledCache[key];
}

const lucideItems: IconPickerItem[] = [];
for (const [key, value] of Object.entries(LUCIDE)) {
  if (!isIconName(key) || key.endsWith("Icon")) continue; // lucide ships `Tv` AND `TvIcon` aliases
  if (!isComponentValue(value)) continue;
  lucideItems.push({
    id: `lucide:${key}`,
    label: key,
    subLabel: "lucide",
    keywords: [camelWords(key)],
    Icon: value,
  });
}

const phosphorItems: IconPickerItem[] = [];
for (const [key, value] of Object.entries(PHOSPHOR)) {
  if (!isIconName(key)) continue;
  if (!isComponentValue(value)) continue;
  const Icon = phosphorFilled(key);
  if (!Icon) continue;
  phosphorItems.push({
    id: `phosphor:${key}`,
    label: key,
    subLabel: "phosphor",
    keywords: [camelWords(key)],
    Icon,
  });
}

/** The full icon catalog (lucide outline + phosphor solid). Built once at module load. */
export const ICON_SET: IconPickerItem[] = [...lucideItems, ...phosphorItems];

/** Resolve a stored `lib:ExportName` id back to its component (phosphor rendered solid). */
export function resolveIcon(name?: string | null): IconComponent | null {
  if (!name) return null;
  const idx = name.indexOf(":");
  if (idx < 0) return null;
  const lib = name.slice(0, idx);
  const key = name.slice(idx + 1);
  if (lib === "lucide") return LUCIDE[key] ?? null;
  if (lib === "phosphor") return phosphorFilled(key);
  return null;
}
