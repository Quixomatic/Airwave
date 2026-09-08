"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Dev-only hero switcher. Renders whichever hero variant is selected and, ONLY in development, shows a small
 * fixed toggle so James can flip between the current hero (v1) and the GuideEngine-style hero (v2) on his dev
 * run. The choice persists in localStorage. In production `dev` is false, so it renders V3 (the chosen hero,
 * which itself falls back to V2's layout below xl) with no visible chrome — the switcher is dev-only scaffolding.
 */
type Variant = "v1" | "v2" | "v3";

export function HeroToggle({
  dev,
  v1,
  v2,
  v3,
}: {
  dev: boolean;
  v1: ReactNode;
  v2: ReactNode;
  v3: ReactNode;
}) {
  const [variant, setVariant] = useState<Variant>("v3");

  useEffect(() => {
    if (!dev) return;
    const saved = window.localStorage.getItem("airwave-hero-variant");
    if (saved === "v1" || saved === "v2" || saved === "v3") setVariant(saved);
  }, [dev]);

  const pick = (v: Variant) => {
    setVariant(v);
    if (dev) window.localStorage.setItem("airwave-hero-variant", v);
  };

  // Production shows V3 (the chosen hero; it falls back to V2's layout below xl). In dev, the toggle picks and
  // persists the variant — V1/V2 are kept for switching back.
  const active = dev ? variant : "v3";
  const nodes: Record<Variant, ReactNode> = { v1, v2, v3 };

  return (
    <>
      {nodes[active]}
      {dev && (
        <div className="fixed right-4 bottom-4 z-50 flex items-center gap-1 rounded-full border border-white/20 bg-black/80 p-1 text-xs font-medium text-white shadow-xl backdrop-blur">
          <span className="pr-1 pl-2 text-white/50">Hero</span>
          {(["v1", "v2", "v3"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => pick(v)}
              className={
                "rounded-full px-3 py-1 transition-colors " +
                (active === v ? "bg-white text-black" : "text-white/70 hover:text-white")
              }
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
