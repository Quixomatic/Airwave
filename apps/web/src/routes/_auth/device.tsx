import { Button } from "@airwave/ui/components/button";
import { Card } from "@airwave/ui/components/card";
import { Input } from "@airwave/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import { Tv } from "lucide-react";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth/device")({
  staticData: { breadcrumb: "Approve device", breadcrumbIcon: Tv, breadcrumbTint: "cyan" },
  validateSearch: (search: Record<string, unknown>): { user_code?: string } => ({
    user_code: typeof search.user_code === "string" ? search.user_code : undefined,
  }),
  component: DevicePage,
});

type Status = "idle" | "working" | "approved" | "denied" | "error";

/**
 * Device-approval page for the TV device-code login. A logged-in user lands here
 * (usually by scanning the QR the TV shows, which pre-fills `?user_code=`),
 * confirms the code, and approves — which links the pending TV device to their
 * account so the TV's token poll succeeds. See the `deviceAuthorization` plugin.
 */
function DevicePage() {
  const { user_code } = Route.useSearch();
  const [code, setCode] = useState(user_code ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (action: "approve" | "deny") => {
    const userCode = code.trim().toUpperCase();
    if (!userCode) return;
    setStatus("working");
    setMessage(null);

    // better-auth requires the signed-in session to first "claim" the code via
    // GET /device?user_code=… before approve/deny will accept it.
    const verify = await authClient.$fetch("/device", { query: { user_code: userCode } });
    if (verify.error) {
      setStatus("error");
      setMessage("That code is invalid or has expired.");
      return;
    }

    const fn = action === "approve" ? authClient.device.approve : authClient.device.deny;
    const { error } = await fn({ userCode });
    if (error) {
      setStatus("error");
      setMessage(error.error_description ?? "That code is invalid or has expired.");
      return;
    }
    setStatus(action === "approve" ? "approved" : "denied");
  };

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-16 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Approve your TV</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Confirm the code shown on your television to sign it in to your account.
        </p>
      </div>

      {status === "approved" ? (
        <Card className="w-full p-8">
          <p className="text-lg font-medium">✓ Your TV is signed in.</p>
          <p className="text-muted-foreground mt-1 text-sm">You can close this page.</p>
        </Card>
      ) : status === "denied" ? (
        <Card className="w-full p-8">
          <p className="text-lg font-medium">Request denied.</p>
        </Card>
      ) : (
        <Card className="flex w-full flex-col gap-4 p-6">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Enter the code"
            className="text-center font-mono text-2xl tracking-[0.3em]"
            autoFocus
          />
          {message && <p className="text-sm text-red-500">{message}</p>}
          <div className="flex gap-3">
            <Button
              onClick={() => submit("approve")}
              disabled={status === "working" || !code.trim()}
              className="flex-1"
            >
              {status === "working" ? "Approving…" : "Approve"}
            </Button>
            <Button
              onClick={() => submit("deny")}
              disabled={status === "working" || !code.trim()}
              variant="outline"
            >
              Deny
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
