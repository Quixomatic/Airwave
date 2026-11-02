/**
 * How an icon id is read, for both renderers. A channel's icon is stored as an icon-set id (`lucide:Radio`); this is the one rule that
 * says which lucide icon NAME an id points at. What each renderer does with the name differs: the React Native rows look the icon up
 * as a component (layout.ts `channelIcon`), the native rows need its drawing instructions (lucide-nodes.ts, which reads them out of the
 * library's internals and so is only ever on the native path). Keeping the rule here, free of both, is what lets the classic rows on
 * every platform draw the icon without depending on that extraction.
 *
 * It also says which of the library's exports are icons at all (`isLucideIcon`), so the two renderers accept exactly the same ids.
 *
 * No react-native imports, so `bun test` can load it.
 */
const PREFIX = "lucide:";

/** The lucide icon name `id` points at (`lucide:Radio` is `Radio`), or null for anything else: no id, another icon set (`phosphor:*`), a bare `lucide:`. */
export function lucideIconName(id?: string | null): string | null {
  if (!id || !id.startsWith(PREFIX)) return null;
  const name = id.slice(PREFIX.length);
  return name === "" ? null : name;
}

/**
 * Whether `x` is one of the library's icons, as opposed to its other exports (`Icon`, the generic base icon, `createLucideIcon`, `LucideProvider`,
 * `useLucideContext` and whatever a release adds). `createLucideIcon` gives every icon it makes a `displayName`, and nothing else the library exports
 * has one; an icon is also a component: a function, or a forwardRef component (an object with a `$$typeof`). Both renderers ask this one question, so
 * an id they cannot both draw (`lucide:Icon`, which the classic rows would have crashed on) is the fallback in both.
 */
export function isLucideIcon(x: unknown): boolean {
  const component = typeof x === "function" || (typeof x === "object" && x !== null && "$$typeof" in x);
  return component && typeof (x as { displayName?: unknown }).displayName === "string";
}

/** The export of the lucide library (`exports`, its namespace) called `name`, when it is an icon: undefined for no such export, an inherited property (`constructor`) or anything that is not an icon. */
export function lucideIconExport(exports: object, name: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(exports, name)) return undefined;
  const x = (exports as Record<string, unknown>)[name];
  return isLucideIcon(x) ? x : undefined;
}

/** The icon of `exports` an icon-set id (`lucide:Radio`) points at, or undefined: no such icon, not a lucide id, or an export that is not an icon. */
export function lucideIconFrom<T>(exports: object, id?: string | null): T | undefined {
  const name = lucideIconName(id);
  return name === null ? undefined : (lucideIconExport(exports, name) as T | undefined);
}
