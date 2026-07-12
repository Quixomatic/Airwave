import { Button } from "@ChannelGuide/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ChannelGuide/ui/components/card";
import { Input } from "@ChannelGuide/ui/components/input";
import { Label } from "@ChannelGuide/ui/components/label";
import { Textarea } from "@ChannelGuide/ui/components/textarea";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { HeaderRight } from "@/context/header-provider";
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
    <div className="mx-auto max-w-2xl">
      <HeaderRight>
        <Button type="submit" form={FORM_ID} size="sm" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create package
        </Button>
      </HeaderRight>

      <Link
        to="/packages"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Packages
      </Link>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>New package</CardTitle>
        </CardHeader>
        <CardContent>
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
