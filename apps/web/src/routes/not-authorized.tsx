import { Button } from "@airwave/ui/components/button";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { LogOut, ShieldAlert, Tv } from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/logo";
import { authClient } from "@/lib/auth-client";

/**
 * Where a signed-in NON-admin lands (the admin UI is admins-only, §7.13). Deliberately OUTSIDE `_auth` so
 * there's no redirect loop with its admin gate, and it doesn't bounce a logged-in user to /guide the way
 * /login does. If you're not signed in → /login; if you're an admin → /guide (you belong in the app).
 */
export const Route = createFileRoute("/not-authorized")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    const user = session?.data?.user as { role?: string | null } | undefined;
    if (!user) throw redirect({ to: "/login" });
    if ((user.role ?? null) === "admin") throw redirect({ to: "/guide" });
  },
  component: NotAuthorized,
});

function NotAuthorized() {
  const navigate = useNavigate();
  const [out, setOut] = useState(false);

  const handleSignOut = async () => {
    setOut(true);
    try {
      await authClient.signOut();
      await navigate({ to: "/login" });
    } finally {
      setOut(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <Logo wordmark markWidth={80} />
        <div className="bg-muted ring-border flex size-14 items-center justify-center rounded-2xl ring-1">
          <ShieldAlert className="text-amber-500 size-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Admin access only</h1>
          <p className="text-muted-foreground text-sm">
            This is the Airwave admin panel — it's for administrators. Your account isn't an admin, so you
            can't sign in here. You can still use the Airwave TV apps to watch.
          </p>
        </div>

        {/* Primary path for a non-admin here: approving a TV / streaming-device sign-in. Make it obvious
            so nobody (App reviewers included) is stranded on this page wondering where the code goes. */}
        <div className="border-border bg-muted/40 flex w-full flex-col items-center gap-3 rounded-xl border p-5">
          <p className="text-sm font-medium">Signing in a TV or streaming device?</p>
          <p className="text-muted-foreground text-sm">
            Enter the code shown on your device to approve it and finish signing in.
          </p>
          <Button className="w-full" onClick={() => navigate({ to: "/device" })}>
            <Tv className="mr-2 size-4" /> Approve a device code
          </Button>
        </div>

        <Button variant="outline" onClick={handleSignOut} disabled={out}>
          <LogOut className="mr-2 size-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}
