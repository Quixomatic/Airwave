import { Button } from "@ChannelGuide/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ChannelGuide/ui/components/card";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { HeaderRight } from "@/context/header-provider";
import { ChannelForm } from "@/features/channels/channel-form";
import { trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/channels/new")({
  staticData: { breadcrumb: "New" },
  component: NewChannel,
});

const FORM_ID = "new-channel-form";

function NewChannel() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="mx-auto max-w-2xl">
      <HeaderRight>
        <Button type="submit" form={FORM_ID} size="sm" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create channel
        </Button>
      </HeaderRight>

      <Link
        to="/channels"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Channels
      </Link>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>New channel</CardTitle>
        </CardHeader>
        <CardContent>
          <ChannelForm
            formId={FORM_ID}
            onSubmit={async (v) => {
              setSubmitting(true);
              try {
                const res = await trpcClient.channels.create.mutate({
                  name: v.name,
                  number: v.number ? Number(v.number) : undefined,
                  mediaSourceId: v.mediaSourceId,
                  mediaTypes: v.mediaTypes,
                  filter: v.filter,
                  ordering: v.ordering,
                  packageId: v.packageId,
                  icon: v.icon,
                  tint: v.tint,
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
        </CardContent>
      </Card>
    </div>
  );
}
