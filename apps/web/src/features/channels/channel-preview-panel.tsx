import { Button } from "@airwave/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { ListFilter, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { trpc } from "@/utils/trpc";

import type { ChannelPreviewInput } from "./channel-form";
import { ChannelPreviewTiles, type ChannelPreviewData } from "./channel-preview";

const DEBOUNCE_MS = 800;

/** Stable content key for an input — changes only when something that affects the resolved pool changes. */
function inputKey(i: ChannelPreviewInput | null): string {
  if (!i) return "";
  return JSON.stringify({ m: i.mediaSourceId, t: i.mediaTypes, f: i.filter, sf: i.sortField, sd: i.sortDir });
}

/** True if the filter tree has at least one COMPLETE condition — a field with a non-empty value. A freshly
 * added condition starts blank (`value: ""`), which the resolver turns into a no-op (buildParam → null) after
 * still doing wasteful work (tag-value lookups hit Plex). So we don't auto-resolve until a condition is actually
 * filled in; the manual "Update preview" button can still force any filter. */
function filterHasPredicate(g: ChannelPreviewInput["filter"]): boolean {
  const walk = (nodes: ChannelPreviewInput["filter"]["children"]): boolean =>
    nodes.some((n) => (n.type === "condition" ? n.value.trim() !== "" : walk(n.children)));
  return walk(g.children);
}

/**
 * The channel Preview area (GitHub #12): resolves the UNSAVED filter the form currently holds, so you see what
 * your conditions catch without saving first. On the edit page `initialData` (the saved preview) shows on load
 * unchanged; then editing the filter triggers a DEBOUNCED live re-resolve (and a manual "Update preview"
 * button). Because each resolve changes the query key, the tRPC client aborts any in-flight request when the
 * filter changes again — no stacked fetches / runaway spinner. Works on the create page too (no channel yet),
 * proxying artwork by media source.
 */
export function ChannelPreviewPanel({
  input,
  channelId,
  initialData,
  initialLoading,
}: {
  input: ChannelPreviewInput | null;
  /** Present on the edit page (art via /img/:channelId); absent on create (art via /img/source/:sourceId). */
  channelId?: string;
  /** The saved-filter preview to show until the user edits — keeps the edit page's initial load unchanged. */
  initialData?: ChannelPreviewData;
  /** True while the initial saved preview is still loading (edit page) — shows the resolving spinner, not the hint. */
  initialLoading?: boolean;
}) {
  // The input we're actually resolving (drives the query key). null until the user edits or clicks Update.
  const [resolveInput, setResolveInput] = useState<ChannelPreviewInput | null>(null);
  // The last content key we DECIDED to resolve — seeded with the initial/saved key so its async re-echoes
  // (e.g. the source list finishing loading) don't auto-fetch the state we already display.
  const lastKey = useRef<string | null>(null);
  const initialCaptured = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = inputKey(input);

  // Capture the initial key ONCE the source is known, so we don't auto-resolve the saved/empty starting state.
  if (!initialCaptured.current && input?.mediaSourceId) {
    initialCaptured.current = true;
    lastKey.current = key;
  }

  // Debounced auto-resolve: when the filter content changes away from what we last resolved, resolve after a
  // short pause. Rapid edits reset the timer; committing a new resolveInput changes the query key, which aborts
  // any in-flight resolve.
  useEffect(() => {
    if (!input?.mediaSourceId) return;
    if (key === lastKey.current) return;
    // Don't auto-resolve a predicate-less filter — it'd pull the whole library. Manual "Update preview" still can.
    if (!filterHasPredicate(input.filter)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lastKey.current = key;
      setResolveInput(input);
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, input]);

  const preview = useQuery(
    trpc.channels.previewFilter.queryOptions(
      resolveInput
        ? {
            mediaSourceId: resolveInput.mediaSourceId,
            mediaTypes: resolveInput.mediaTypes,
            filter: resolveInput.filter,
            sortField: resolveInput.sortField,
            sortDir: resolveInput.sortDir,
          }
        : skipToken,
      // Keep the last resolved pool visible (as `data`) while the next resolve runs, so the skeleton count can
      // match the results currently on screen across repeated edits — not just the first reload.
      { placeholderData: keepPreviousData, trpc: { context: { skipBatch: true } } },
    ),
  );

  const updateNow = () => {
    if (!input?.mediaSourceId) return;
    if (timer.current) clearTimeout(timer.current);
    lastKey.current = inputKey(input);
    setResolveInput({ ...input });
  };

  // Live result once we've resolved anything; until then, the saved preview (edit page) or nothing (create).
  const data = preview.data ?? initialData;
  const busy = preview.isFetching || (!data && !!initialLoading);

  return (
    <Frame>
      <FrameHeader className="flex-row items-center justify-between">
        <div>
          <FrameTitle>Preview</FrameTitle>
          <FrameDescription>
            What this channel's filter resolves to — updates as you edit, before you save.
          </FrameDescription>
        </div>
        <Button variant="outline" size="sm" onClick={updateNow} disabled={busy || !input?.mediaSourceId}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update preview"}
        </Button>
      </FrameHeader>
      <FramePanel>
        {!data && !busy ? (
          <EmptyState
            icon={ListFilter}
            title="Nothing to preview yet"
            description="Add a filter condition to preview what it catches, or click Update preview."
          />
        ) : (
          <ChannelPreviewTiles
            channelId={channelId}
            sourceId={input?.mediaSourceId}
            data={data}
            loading={busy}
          />
        )}
      </FramePanel>
    </Frame>
  );
}
