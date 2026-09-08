import { Button } from "@airwave/ui/components/button";
import { Textarea } from "@airwave/ui/components/textarea";
import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/modal";
import type { MediaType } from "./channel-form";
import { FilterBuilder, type FilterGroup } from "./filter-builder";
import { parseFilterEnvelope } from "./filter-clipboard";

const TYPE_LABEL: Record<MediaType, string> = { movie: "Movies", show: "TV Shows" };

/**
 * Paste a copied filter, review a faithful read-only preview of it (and the content types it will apply), then
 * confirm before it overwrites the channel's current filter. On open it best-effort prefills from the clipboard
 * (Chrome/https/localhost); where the browser blocks clipboard reads, the user pastes into the textarea.
 */
export function ImportFilterDialog({
  open,
  onClose,
  onApply,
  mediaSourceId,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (mediaTypes: MediaType[], filter: FilterGroup) => void;
  mediaSourceId: string;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!open) return;
    setText("");
    navigator.clipboard?.readText?.().then(
      (t) => {
        if (t) setText(t);
      },
      () => {
        // Clipboard read blocked (e.g. Firefox) — the user pastes manually.
      },
    );
  }, [open]);

  const parsed = useMemo(() => parseFilterEnvelope(text), [text]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Import filter</h2>
          <p className="text-muted-foreground text-sm">
            Paste a copied filter, review it below, then apply it to this channel.
          </p>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"type":"airwave/filter","v":1, ...}'
          className="h-24 font-mono text-xs"
          spellCheck={false}
        />

        {text.trim() && !parsed.ok && <p className="text-destructive text-sm">{parsed.error}</p>}

        {parsed.ok && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              Applies to:{" "}
              <span className="text-foreground font-medium">
                {parsed.mediaTypes.map((t) => TYPE_LABEL[t]).join(", ")}
              </span>
            </p>
            <div className="max-h-[40vh] overflow-auto">
              <FilterBuilder
                value={parsed.filter}
                onChange={() => {}}
                mediaSourceId={mediaSourceId}
                mediaTypes={parsed.mediaTypes}
                readOnly
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!parsed.ok}
            onClick={() => {
              if (parsed.ok) {
                onApply(parsed.mediaTypes, parsed.filter);
                onClose();
              }
            }}
          >
            Apply filter
          </Button>
        </div>
      </div>
    </Modal>
  );
}
