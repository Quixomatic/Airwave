/// <reference types="bun" />
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { isLucideIcon, lucideIconExport, lucideIconFrom, lucideIconName } from "./icon-id";

describe("lucideIconName", () => {
  test("an id of the lucide set is the icon's name", () => {
    expect(lucideIconName("lucide:Radio")).toBe("Radio");
    expect(lucideIconName("lucide:TvIcon")).toBe("TvIcon");
  });

  test("anything else points at no lucide icon", () => {
    for (const id of [undefined, null, "", "lucide:", "phosphor:Television", "Radio", "emoji:tv", "LUCIDE:Radio"]) expect(lucideIconName(id), String(id)).toBeNull();
  });
});

describe("isLucideIcon", () => {
  // What createLucideIcon makes: a forwardRef component (an object with a $$typeof) that has a displayName.
  const forwardRefIcon = () => ({ $$typeof: Symbol.for("react.forward_ref"), displayName: "Radio", render: () => null });

  test("a component with a displayName is an icon, whether a forwardRef object or a function", () => {
    expect(isLucideIcon(forwardRefIcon())).toBe(true);
    expect(isLucideIcon(Object.assign(() => null, { displayName: "Radio" }))).toBe(true);
  });

  test("the library's other exports are not: the generic Icon, the factory, the provider, a hook, a context", () => {
    expect(isLucideIcon({ $$typeof: Symbol.for("react.forward_ref"), render: () => null })).toBe(false); // `Icon`: a forwardRef with no displayName
    expect(isLucideIcon(function createLucideIcon() {})).toBe(false);
    expect(isLucideIcon(() => null)).toBe(false);
    expect(isLucideIcon({ $$typeof: Symbol.for("react.context"), Provider: {}, Consumer: {} })).toBe(false); // an IconContext
    expect(isLucideIcon({ Radio: forwardRefIcon() })).toBe(false); // a map of icons (`icons`)
    expect(isLucideIcon({ $$typeof: Symbol.for("react.forward_ref"), displayName: 3 })).toBe(false);
  });

  test("nothing else is", () => {
    for (const x of [undefined, null, "Radio", 3, true, {}, []]) expect(isLucideIcon(x), String(x)).toBe(false);
  });
});

describe("lucideIconFrom", () => {
  const icon = { $$typeof: Symbol.for("react.forward_ref"), displayName: "Radio", render: () => null };
  const lib = { Radio: icon, Icon: { $$typeof: Symbol.for("react.forward_ref"), render: () => null }, createLucideIcon: () => null, icons: { Radio: icon } };

  test("is the icon an id of the set points at", () => {
    expect(lucideIconFrom<unknown>(lib, "lucide:Radio")).toBe(icon);
    expect(lucideIconExport(lib, "Radio")).toBe(icon);
  });

  test("is nothing for an export that is not an icon, an inherited name, another set or no id", () => {
    for (const id of ["lucide:Icon", "lucide:createLucideIcon", "lucide:icons", "lucide:NotThere", "lucide:constructor", "lucide:toString", "lucide:__proto__", "lucide:hasOwnProperty", "phosphor:Radio", "lucide:", "", null, undefined]) {
      expect(lucideIconFrom<unknown>(lib, id), String(id)).toBeUndefined();
    }
  });
});

describe("the classic rows' icon lookup", () => {
  const src = readFileSync(join(import.meta.dir, "layout.ts"), "utf8");

  test("takes the rule from icon-id for channels and packages alike, and does not depend on the native path's extraction of lucide's internals", () => {
    expect(src).toContain('import { lucideIconFrom } from "./icon-id"');
    expect(src).not.toMatch(/from "\.\/lucide-nodes"/);
    expect(src).toMatch(/export function channelIcon[\s\S]*?lucideIconFrom<IconCmp>\(LUCIDE, id\) \?\? LucideIcons\.Radio/);
    expect(src).toMatch(/export function pkgIconCmp[\s\S]*?lucideIconFrom<IconCmp>\(LUCIDE, id\) \?\? LucideIcons\.Folder/);
  });
});
