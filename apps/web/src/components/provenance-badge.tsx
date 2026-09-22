import { Blocks, Sparkles } from "lucide-react";

/**
 * Provenance badge for a channel or package: PRESET (sky, bricks) for the built-in preset generator, AI
 * (violet, sparkles) for AI-generated. Renders nothing for manual/hand-built. Shared by the channels list
 * and the packages list so the two stay in sync. AI wins if both flags are set (shouldn't happen).
 */
export function ProvenanceBadge({
  generated,
  aiGenerated,
}: {
  generated?: boolean | null;
  aiGenerated?: boolean | null;
}) {
  const cls =
    "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] uppercase leading-none";
  if (aiGenerated)
    return (
      <span className={`${cls} border-violet-500/30 text-violet-600 dark:text-violet-400`}>
        <Sparkles className="size-3" />
        AI
      </span>
    );
  if (generated)
    return (
      <span className={`${cls} border-sky-500/30 text-sky-600 dark:text-sky-400`}>
        <Blocks className="size-3" />
        Preset
      </span>
    );
  return null;
}
