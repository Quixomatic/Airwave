import { Button } from "@airwave/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { HeaderRight } from "@/context/header-provider";
import {
  ChannelForm,
  type BumperMode,
  type ChannelFormValues,
  type ChannelPreviewInput,
  type MediaType,
  type Ordering,
} from "@/features/channels/channel-form";
import { ChannelPreviewPanel } from "@/features/channels/channel-preview-panel";
import type { FilterGroup } from "@/features/channels/filter-builder";
import type { ChannelStrategy } from "@/features/channels/strategy-editor";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/channels/new")({
  staticData: { breadcrumb: "New" },
  // `?from=<channelId>` clones that channel: the create form is pre-filled with its config.
  validateSearch: (search): { from?: string } => ({
    from: typeof search.from === "string" ? search.from : undefined,
  }),
  component: NewChannel,
});

const FORM_ID = "new-channel-form";

function NewChannel() {
  const { from } = Route.useSearch();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  // Live filter/source/sort from the form — drives the pre-save preview (#12).
  const [previewInput, setPreviewInput] = useState<ChannelPreviewInput | null>(null);

  // Clone: load the source channel so its config can pre-fill the form. Identity fields (number +
  // callsign) are deliberately left blank so the clone gets its own; the name gets a " (Clone)" suffix.
  const cloning = Boolean(from);
  const source = useQuery(trpc.channels.get.queryOptions({ id: from ?? "" }, { enabled: cloning }));

  // ChannelForm reads `initial` only on first mount, so wait for the source before rendering the form.
  if (cloning && !source.data) {
    return <div className="text-muted-foreground mx-auto max-w-2xl text-sm">Loading…</div>;
  }

  const initial: Partial<ChannelFormValues> | undefined =
    cloning && source.data
      ? {
          name: `${source.data.name} (Clone)`,
          callsign: "",
          number: "",
          mediaTypes: source.data.mediaTypes as MediaType[],
          filter: (source.data.filter as FilterGroup | null) ?? undefined,
          ordering: source.data.ordering as Ordering,
          strategy: (source.data.strategy as ChannelStrategy | null) ?? null,
          sortField: source.data.sortField,
          sortDir: source.data.sortDir as "asc" | "desc",
          packageId: source.data.packageId,
          icon: source.data.icon,
          tint: source.data.tint,
          description: source.data.description,
          enabled: source.data.enabled,
          bumperMode: source.data.bumperMode as BumperMode,
        }
      : undefined;

  return (
    <div className="space-y-6 pb-32">
      <HeaderRight>
        <Button type="submit" form={FORM_ID} size="sm" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {cloning ? "Create clone" : "Create channel"}
        </Button>
      </HeaderRight>

      {cloning && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This clone hasn&apos;t been created yet. Review the details below, give it a number and callsign,
            and press <span className="font-medium">Create clone</span> to save it as a new channel.
          </p>
        </div>
      )}

      <ChannelForm
        formId={FORM_ID}
        title={cloning ? "Clone channel" : "New channel"}
        subtitle={
          cloning
            ? "A copy of the source channel's setup — give it a number and callsign."
            : "What this channel plays, how it's ordered, and how it looks."
        }
        initial={initial}
        onPreviewInputChange={setPreviewInput}
        onSubmit={async (v) => {
              setSubmitting(true);
              try {
                const res = await trpcClient.channels.create.mutate({
                  name: v.name,
                  callsign: v.callsign || null,
                  number: v.number ? Number(v.number) : undefined,
                  mediaSourceId: v.mediaSourceId,
                  mediaTypes: v.mediaTypes,
                  filter: v.filter,
                  ordering: v.ordering,
                  strategy: v.strategy,
                  sortField: v.sortField,
                  sortDir: v.sortDir,
                  packageId: v.packageId,
                  icon: v.icon,
                  tint: v.tint,
                  description: v.description,
                  enabled: v.enabled,
                  bumperMode: v.bumperMode,
                });
                toast.success(cloning ? "Channel cloned." : "Channel created.");
                navigate({ to: "/channels/$channelId", params: { channelId: res.id } });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to create channel");
              } finally {
                setSubmitting(false);
              }
            }}
          />

      {/* Pre-save preview (#12): see what the filter catches before creating the channel. */}
      <ChannelPreviewPanel input={previewInput} />
    </div>
  );
}
