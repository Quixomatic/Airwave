import { Button } from "@airwave/ui/components/button";
import { Card } from "@airwave/ui/components/card";
import { OTPField, OTPFieldInput } from "@airwave/ui/components/otp-field";
import { createFileRoute } from "@tanstack/react-router";
import { Tv } from "lucide-react";
import { useState } from "react";

// The TV user code is 4 chars of better-auth's unambiguous charset (see the deviceAuthorization plugin).
const CODE_LENGTH = 4;
// Large slots, held at this size across breakpoints (the base component shrinks on `sm:` — override it).
const SLOT_CLASS =
  "size-16 rounded-xl text-3xl leading-[4rem] sm:size-16 sm:text-3xl sm:leading-[4rem]";

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
  const [code, setCode] = useState((user_code ?? "").toUpperCase());
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
        <Card className="flex w-full flex-col items-center gap-5 p-8">
          <OTPField
            size="lg"
            length={CODE_LENGTH}
            value={code}
            onValueChange={(value) => setCode(value)}
            validationType="alphanumeric"
            normalizeValue={(value) => value.toUpperCase()}
            className="justify-center gap-3 font-mono"
          >
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              // Base UI derives each input's index from render order — no index prop. aria-invalid on the
              // input (not the root) is what turns the slot red via the component's own styling.
              <OTPFieldInput
                key={i}
                className={SLOT_CLASS}
                autoFocus={i === 0}
                aria-invalid={status === "error"}
              />
            ))}
          </OTPField>
          {message && <p className="text-sm text-red-500">{message}</p>}
          <div className="flex w-full gap-3">
            <Button
              onClick={() => submit("approve")}
              disabled={status === "working" || code.length < CODE_LENGTH}
              className="flex-1"
            >
              {status === "working" ? "Approving…" : "Approve"}
            </Button>
            <Button
              onClick={() => submit("deny")}
              disabled={status === "working" || code.length < CODE_LENGTH}
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
