import { Button } from "@airwave/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { Input } from "@airwave/ui/components/input";
import { Label } from "@airwave/ui/components/label";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { HeaderRight } from "@/context/header-provider";
import { trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/users/new")({
  staticData: { breadcrumb: "New" },
  component: NewUser,
});

const FORM_ID = "new-user-form";

function NewUser() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim()) {
      toast.error("Email and name are required.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await trpcClient.users.create.mutate({
        email: email.trim(),
        name: name.trim(),
        password,
      });
      toast.success("User created.");
      navigate({ to: "/users/$id", params: { id: res.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <HeaderRight>
        <Button type="submit" form={FORM_ID} size="sm" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create user
        </Button>
      </HeaderRight>

      <Frame>
        <FrameHeader>
          <FrameTitle>New user</FrameTitle>
          <FrameDescription>
            Create a Viewer account with an email and password. They sign in on the TV apps or the
            browser player — the admin panel stays admin-only.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <form id={FORM_ID} onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="uemail">Email</Label>
              <Input
                id="uemail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="viewer@example.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uname">Name</Label>
              <Input
                id="uname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Living Room"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upass">Password</Label>
              <Input
                id="upass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              <p className="text-muted-foreground text-xs">
                The viewer signs in with this email + password. New users start with access to
                everything — narrow it afterward on their access page.
              </p>
            </div>
          </form>
        </FramePanel>
      </Frame>
    </div>
  );
}
