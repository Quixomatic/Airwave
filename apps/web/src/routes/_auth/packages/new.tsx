import { Button } from "@ChannelGuide/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@ChannelGuide/ui/components/frame";
import { Input } from "@ChannelGuide/ui/components/input";
import { Label } from "@ChannelGuide/ui/components/label";
import { Textarea } from "@ChannelGuide/ui/components/textarea";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { HeaderRight } from "@/context/header-provider";
import { IconTintField } from "@/features/icons/icon-tint-field";
import { trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/packages/new")({
  staticData: { breadcrumb: "New" },
  component: NewPackage,
});

const FORM_ID = "new-package-form";

function NewPackage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [tint, setTint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await trpcClient.packages.create.mutate({
        name,
        description: description.trim() || undefined,
        icon,
        tint,
      });
      toast.success("Package created.");
      navigate({ to: "/packages/$packageId", params: { packageId: res.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create package");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <HeaderRight>
        <Button type="submit" form={FORM_ID} size="sm" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create package
        </Button>
      </HeaderRight>

      <Frame>
        <FrameHeader>
          <FrameTitle>New package</FrameTitle>
          <FrameDescription>Name, description, and how this package looks in the guide.</FrameDescription>
        </FrameHeader>
        <FramePanel>
          <form id={FORM_ID} onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pname">Name</Label>
              <Input
                id="pname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kids & Family"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pdesc">Description</Label>
              <Textarea
                id="pdesc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional — what this lineup is about."
              />
            </div>
            <div className="space-y-2">
              <Label>Appearance</Label>
              <IconTintField
                icon={icon}
                tint={tint}
                onIconChange={setIcon}
                onTintChange={setTint}
                defaultIcon={LayoutGrid}
              />
              <p className="text-muted-foreground text-xs">
                Channels in this package inherit its tint unless they set their own.
              </p>
            </div>
          </form>
        </FramePanel>
      </Frame>
    </div>
  );
}
