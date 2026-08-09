import { ArrowLeft, Mail, Tv } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@airwave/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@airwave/ui/components/card";
import { Input } from "@airwave/ui/components/input";

import { GithubIcon } from "@/components/icons/github-icon";
import { GoogleIcon } from "@/components/icons/google-icon";
import { Logo } from "@/components/logo";
import { signIn } from "@/lib/auth-client";

type Mode = "password" | "magic";

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const callbackURL = `${window.location.origin}/post-login`;

  const handlePlex = async () => {
    try {
      await signIn.oauth2({
        providerId: "plex",
        callbackURL, // absolute web URL — better-auth redirects here after the callback
        errorCallbackURL: `${window.location.origin}/login`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Plex sign-in failed");
    }
  };

  const handleSocial = async (provider: "google" | "github") => {
    try {
      await signIn.social({ provider, callbackURL });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to sign in with ${provider}`);
    }
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await signIn.email({ email, password });
      if (response?.error) {
        toast.error(response.error.message || "Invalid email or password");
        return;
      }
      navigate({ to: "/post-login" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign in";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await signIn.magicLink({ email, callbackURL });
      if (response?.error) {
        toast.error(response.error.message || "Failed to send sign-in link");
        return;
      }
      setMagicLinkSent(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send sign-in link";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // ── "check your email" screen after a magic link was sent ─────────
  if (magicLinkSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
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
                setMode("password");
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

  // ── Default: Plex / social + email sign-in ────────────────────────
  return (
    <div className="text-foreground flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-4">
      <Logo markWidth={72} wordmark animate />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">Sign In</CardTitle>
          <CardDescription className="text-base">
            Sign in with Plex, or with your email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-col gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={handlePlex}
              disabled={loading}
              className="w-full justify-start"
            >
              <Tv className="mr-2 h-5 w-5" />
              Continue with Plex
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleSocial("google")}
              disabled={loading}
              className="w-full justify-start"
            >
              <GoogleIcon className="mr-2 h-5 w-5" />
              Continue with Google
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleSocial("github")}
              disabled={loading}
              className="w-full justify-start"
            >
              <GithubIcon className="mr-2 h-5 w-5" />
              Continue with GitHub
            </Button>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card text-muted-foreground px-2">OR</span>
            </div>
          </div>

          {mode === "magic" ? (
            <form className="space-y-4" onSubmit={handleMagicLink}>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email…"
                disabled={loading}
                className="h-12 text-base"
              />
              <Button type="submit" size="lg" disabled={loading} className="w-full">
                {loading ? "Sending…" : "Continue"}
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handlePassword}>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email…"
                disabled={loading}
                className="h-12 text-base"
              />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Password"
                disabled={loading}
                className="h-12 text-base"
              />
              <Button type="submit" size="lg" disabled={loading} className="w-full">
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          )}

          <p className="text-muted-foreground mt-6 text-center text-sm">
            {mode === "magic"
              ? "We'll email you a magic link to sign in."
              : "Use the email and password your admin issued you."}
          </p>

          <div className="mt-4 text-center text-sm">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setMode(mode === "magic" ? "password" : "magic")}
            >
              {mode === "magic" ? "Use email & password" : "Email me a magic link instead"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
