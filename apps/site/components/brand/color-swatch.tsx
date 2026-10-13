"use client";

import { useState } from "react";

/**
 * A single brand color: a preview chip plus the hex, click-to-copy (matches the arcade.software/brand
 * "Copy code" affordance). Client-only for the clipboard write.
 */
export function ColorSwatch({ name, hex, usage }: { name: string; hex: string; usage?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="group flex flex-col overflow-hidden rounded-xl border border-fd-border text-left transition-colors hover:border-fd-primary/50"
    >
      <span className="h-20 w-full" style={{ backgroundColor: hex }} aria-hidden />
      <span className="flex flex-col gap-0.5 p-3">
        <span className="text-sm font-medium text-fd-foreground">{name}</span>
        <span className="font-mono text-xs uppercase text-fd-muted-foreground">{copied ? "Copied!" : hex}</span>
        {usage ? <span className="mt-1 text-xs text-fd-muted-foreground">{usage}</span> : null}
      </span>
    </button>
  );
}
