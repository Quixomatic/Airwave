import { ArrowLeft, Mail, Tv } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@ChannelGuide/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ChannelGuide/ui/components/card";
import { Input } from "@ChannelGuide/ui/components/input";
import { Label } from "@ChannelGuide/ui/components/label";

import { signIn, signUp } from "@/lib/auth-client";

type Mode = "signin" | "signup" | "magic";

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const callbackURL = `${window.location.origin}/dashboard`;

  const handlePlex = () => {
    // TODO(plex): kick off the Plex PIN flow once the custom provider is wired
    // (v0.0.5). For now this is a visible-but-inert primary CTA.
    toast.info("Sign in with Plex is coming soon.");
  };

  const handleEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res =
        mode === "signup"
          ? await signUp.email({ email, password, name: name || email })
          : await signIn.email({ email, password });
      if (res?.error) {
        toast.error(res.error.message || "Something went wrong");
        return;
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn.magicLink({ email, callbackURL });
      if (res?.error) {
        toast.error(res.error.message || "Failed to send sign-in link");
        return;
      }
      setMagicLinkSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send sign-in link");
    } finally {
      setLoading(false);
    }
  };

  if (magicLinkSent) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
              <Mail className="text-primary h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>
              We sent a sign-in link to <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-center text-sm">
              Click the link in the email to sign in. It expires in 5 minutes.
            </p>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setMagicLinkSent(false);
                setMode("signin");
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">ChannelGuide</CardTitle>
          <CardDescription className="text-base">
            {mode === "signup" ? "Create your account" : "Sign in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="lg"
            className="mb-6 w-full justify-center"
            onClick={handlePlex}
            disabled={loading}
          >
            <Tv className="mr-2 h-5 w-5" />
            Sign in with Plex
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card text-muted-foreground px-2">or</span>
            </div>
          </div>

          {mode === "magic" ? (
            <form className="space-y-4" onSubmit={handleMagicLink}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? "Sending…" : "Email me a magic link"}
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleEmailPassword}>
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    disabled={loading}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign In"}
              </Button>
            </form>
          )}

          <div className="mt-6 flex flex-col items-center gap-2 text-sm">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setMode(mode === "magic" ? "signin" : "magic")}
            >
              {mode === "magic" ? "Use email & password" : "Email me a magic link instead"}
            </button>
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            >
              {mode === "signup"
                ? "Already have an account? Sign in"
                : "Need an account? Create one"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
