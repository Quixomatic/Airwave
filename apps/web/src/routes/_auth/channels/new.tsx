import { Button } from "@airwave/ui/components/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { HeaderRight } from "@/context/header-provider";
import { ChannelForm, type ChannelPreviewInput } from "@/features/channels/channel-form";
import { ChannelPreviewPanel } from "@/features/channels/channel-preview-panel";
import { trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/channels/new")({
  staticData: { breadcrumb: "New" },
  component: NewChannel,
});

const FORM_ID = "new-channel-form";

function NewChannel() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  // Live filter/source/sort from the form — drives the pre-save preview (#12).
  const [previewInput, setPreviewInput] = useState<ChannelPreviewInput | null>(null);

  return (
    <div className="space-y-6 pb-32">
      <HeaderRight>
        <Button type="submit" form={FORM_ID} size="sm" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create channel
        </Button>
      </HeaderRight>

      <ChannelForm
        formId={FORM_ID}
        title="New channel"
        subtitle="What this channel plays, how it's ordered, and how it looks."
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
                toast.success("Channel created.");
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
