/// <reference types="bun" />
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, mock, test } from "bun:test";

// lucide-react-native imports react-native-svg, which needs React Native. Reading an icon's node never renders it, so an
// empty stand-in is enough for the import to resolve.
mock.module("react-native-svg", () => ({}));

const LucideIcons = (await import("lucide-react-native")) as unknown as Record<string, unknown>;
const { GLYPH_FALLBACK, GLYPH_HEART, iconNodeOf, resolveIconId } = await import("./lucide-nodes");
const { lucideIconFrom } = await import("./icon-id");

describe("iconNodeOf", () => {
  test("reads the node lucide-react-native draws an icon from", () => {
    expect(iconNodeOf("lucide:Radio")).toEqual([
      ["path", { d: "M16.247 7.761a6 6 0 0 1 0 8.478", key: "1fwjs5" }],
      ["path", { d: "M19.075 4.933a10 10 0 0 1 0 14.134", key: "ehdyv1" }],
      ["path", { d: "M4.925 19.067a10 10 0 0 1 0-14.134", key: "1q22gi" }],
      ["path", { d: "M7.753 16.239a6 6 0 0 1 0-8.478", key: "r2q7qm" }],
      ["circle", { cx: "12", cy: "12", r: "2", key: "1c9p78" }],
    ]);
    expect(iconNodeOf(GLYPH_HEART)?.[0]?.[0]).toBe("path");
  });

  test("covers icons with circle and rect primitives", () => {
    const tags = (id: string) => iconNodeOf(id)?.map(([t]) => t);
    expect(tags("lucide:Tv")).toContain("rect");
    expect(tags("lucide:Tv")).toContain("path");
    expect(tags("lucide:Clock")).toContain("circle");
    expect(tags("lucide:MonitorPlay")).toContain("rect");
    expect(tags("lucide:Settings2")).toContain("circle");
  });

  test("is null for anything that is not a readable lucide icon", () => {
    expect(iconNodeOf("lucide:NotAnIcon")).toBeNull();
    expect(iconNodeOf("lucide:icons")).toBeNull(); // an export that is not an icon component
    expect(iconNodeOf("lucide:createLucideIcon")).toBeNull();
    expect(iconNodeOf("phosphor:Television")).toBeNull();
    expect(iconNodeOf("")).toBeNull();
  });

  test("reads every icon the admin icon picker offers", () => {
    // The picker lists every PascalCase export of lucide except the `*Icon` aliases and a few non-icons.
    const deny = new Set(["Icon", "LucideIcon", "createLucideIcon", "icons", "IconContext", "IconBase", "SSRBase", "LucideProvider"]);
    const names = Object.keys(LucideIcons).filter((k) => /^[A-Z][A-Za-z0-9]*$/.test(k) && !deny.has(k) && !k.endsWith("Icon"));
    expect(names.length).toBeGreaterThan(1000);
    const unreadable = names.filter((n) => iconNodeOf(`lucide:${n}`) === null);
    expect(unreadable).toEqual([]);
  });

  test("every node is built only from shapes the painter draws", () => {
    const known = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]);
    const odd = new Set<string>();
    for (const k of Object.keys(LucideIcons)) {
      const node = /^[A-Z]/.test(k) ? iconNodeOf(`lucide:${k}`) : null;
      for (const [tag] of node ?? []) if (!known.has(tag)) odd.add(`${k}:${tag}`);
    }
    expect([...odd]).toEqual([]);
  });
});

describe("resolveIconId", () => {
  test("an id that names a lucide icon is that icon", () => {
    expect(resolveIconId("lucide:Tv")).toBe("lucide:Tv");
    expect(resolveIconId("lucide:Radio")).toBe("lucide:Radio");
    expect(resolveIconId("lucide:TvIcon")).toBe("lucide:TvIcon"); // an alias is the same icon
  });

  test("no id, an unknown name and every non-lucide id draw Radio, as the classic rows do", () => {
    expect(GLYPH_FALLBACK).toBe("lucide:Radio");
    for (const id of [undefined, null, "", "lucide:", "lucide:NotAnIcon", "lucide:icons", "phosphor:Television", "phosphor:Radio", "Tv", "emoji:tv"]) {
      expect(resolveIconId(id)).toBe(GLYPH_FALLBACK);
    }
  });

  test("every icon the server's generator and the AI lineup planner name resolves to itself", () => {
    const root = join(import.meta.dir, "../../../../..");
    const files = ["packages/api/src/services/generator/presets.ts", "packages/api/src/services/agent/lineup-plan.ts", "packages/api/src/services/agent/agent-tools.ts"];
    const ids = new Set<string>();
    for (const f of files) for (const m of readFileSync(join(root, f), "utf8").matchAll(/lucide:([A-Z][A-Za-z0-9]*)/g)) ids.add(m[0]);
    ids.delete("lucide:Name"); // the placeholder in the planner's instructions
    expect(ids.size).toBeGreaterThan(20);
    expect([...ids].filter((id) => resolveIconId(id) !== id)).toEqual([]);
  });
});

describe("the classic and the native rows read the same icons", () => {
  // The classic rows look an id up with `lucideIconFrom` (layout.ts `channelIcon` and `pkgIconCmp`, which fall back to Radio and Folder where it
  // finds nothing); the native rows with `resolveIconId` (Radio where it finds nothing readable). An id one draws and the other does not is a
  // channel that shows two different icons, or that crashes one of them.
  const NOT_ICONS = ["Icon", "createLucideIcon", "icons", "IconContext", "LucideProvider", "useLucideContext", "LucideIcon", "IconBase", "SSRBase", "NotAnIcon", "constructor", "toString", "__proto__", "hasOwnProperty", "default"];

  test("lucide:Icon, lucide:createLucideIcon and lucide:icons are no icon in either: the classic lookup finds nothing and the native one is Radio", () => {
    for (const name of NOT_ICONS) {
      expect(lucideIconFrom<unknown>(LucideIcons, `lucide:${name}`), name).toBeUndefined();
      expect(resolveIconId(`lucide:${name}`), name).toBe(GLYPH_FALLBACK);
    }
  });

  test("every export of the library is an icon to both or to neither", () => {
    for (const name of [...Object.keys(LucideIcons), ...NOT_ICONS]) {
      const id = `lucide:${name}`;
      const classic = lucideIconFrom<unknown>(LucideIcons, id) !== undefined;
      const native = resolveIconId(id) === id; // Radio is the fallback and is itself an icon: both then say yes
      expect(classic, name).toBe(native);
    }
  });

  test("an icon and its aliases are icons to both", () => {
    for (const id of ["lucide:Radio", "lucide:Tv", "lucide:TvIcon", "lucide:LucideTv", "lucide:Folder"]) {
      expect(lucideIconFrom<unknown>(LucideIcons, id), id).toBeDefined();
      expect(resolveIconId(id), id).toBe(id);
    }
  });
});
