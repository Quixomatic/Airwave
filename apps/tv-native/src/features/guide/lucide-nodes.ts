import * as LucideIcons from "lucide-react-native";

import { lucideIconExport, lucideIconName } from "./icon-id";

/**
 * The lucide icons the native rows draw, as data. The rail's circle and the favorite heart are lucide icons in the React
 * Native rows; the native painter draws the same shapes from their `iconNode` (the list of `[tag, attributes]` pairs lucide
 * keeps for each icon), so a native icon is exactly the icon the other rows render.
 *
 * `lucide-react-native` doesn't export those nodes. `createLucideIcon(name, iconNode)` closes over them and returns a
 * forwardRef component that hands `iconNode` to its `Icon`, so `Component.render({}, null).props.iconNode` yields it. That
 * relies on the library's internals (verified for lucide-react-native 1.25), so lucide-nodes.test.ts checks the extraction
 * for every icon the app can name; a release that moves it fails there, and any icon that can't be read draws as Radio.
 *
 * Which icon a channel shows follows the React Native rows' `channelIcon()`, and the two read an id with one rule (`lucideIconName`, in
 * icon-id.ts): a `lucide:<Name>` id that names a lucide icon is that icon, and everything else (no id, an unknown name, an export
 * that is not an icon, every `phosphor:*` id) is Radio. Only this native path needs the icon's drawing instructions; `channelIcon()` does not.
 */
export type IconNode = [tag: string, attrs: Record<string, string | number>][];

export const GLYPH_FALLBACK = "lucide:Radio";
export const GLYPH_HEART = "lucide:Heart";
/** The rating star in the featured panel. */
export const GLYPH_STAR = "lucide:Star";

type ForwardRefIcon = { displayName?: unknown; render?: (props: object, ref: unknown) => { props?: { iconNode?: unknown } } | null };

const nodes = new Map<string, IconNode | null>();

/** The icon node of the lucide icon called `name` (`Radio`), or null when there is no such icon or it can't be read. */
function nodeOf(name: string): IconNode | null {
  if (nodes.has(name)) return nodes.get(name)!;
  let node: IconNode | null = null;
  try {
    // What is an icon is `isLucideIcon`'s question (the classic rows ask it too); the library's generic `Icon` isn't one and uses hooks.
    const icon = lucideIconExport(LucideIcons, name) as ForwardRefIcon | undefined;
    if (icon && typeof icon.render === "function") {
      const found = icon.render({}, null)?.props?.iconNode;
      if (Array.isArray(found) && found.length > 0) node = found as IconNode;
    }
  } catch {
    node = null;
  }
  nodes.set(name, node);
  return node;
}

/** The id of the icon a channel's stored icon id draws as in the native rows: itself when it names a lucide icon whose drawing can be read, else `lucide:Radio`. */
export function resolveIconId(id?: string | null): string {
  const name = lucideIconName(id);
  if (name && nodeOf(name)) return id!;
  return GLYPH_FALLBACK;
}

/** The node to send the native painter for an icon-set id (`lucide:Radio`), or null if the id names no readable icon. */
export function iconNodeOf(id: string): IconNode | null {
  const name = lucideIconName(id);
  return name ? nodeOf(name) : null;
}
