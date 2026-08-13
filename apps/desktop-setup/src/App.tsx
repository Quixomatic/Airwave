import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Sparkles, Tv, Wifi } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@airwave/ui/components/button";
import { Input } from "@airwave/ui/components/input";
import { Label } from "@airwave/ui/components/label";
import { Switch } from "@airwave/ui/components/switch";

import { Logo } from "./logo";

type Cfg = {
  configured: boolean;
  expose: boolean;
  tvwebEnabled: boolean;
  workflowEnabled: boolean;
  adminEmail: string;
  serverLan?: string;
};

type Step = "welcome" | "account" | "options" | "provisioning" | "done";

// Ordered provisioning phases the supervisor reports via /status. Some are skipped on later runs (already
// built) — the bar just advances to whatever phase is current.
const PHASES: { key: string; label: string }[] = [
  { key: "building-server", label: "Building the server" },
  { key: "building-admin", label: "Building the admin interface" },
  { key: "building-tvweb", label: "Building the TV player" },
  { key: "database", label: "Starting the database" },
  { key: "migrating", label: "Preparing the database" },
  { key: "server", label: "Starting Airwave" },
  { key: "ready", label: "Ready" },
];

function phaseIndex(phase: string): number {
  const i = PHASES.findIndex((p) => p.key === phase);
  return i < 0 ? 0 : i;
}

export function App() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [step, setStep] = useState<Step>("welcome");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [expose, setExpose] = useState(false);
  const [tvweb, setTvweb] = useState(true);
  const [workflow, setWorkflow] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("idle");

  const firstRun = !cfg?.configured;

  // Load current config on mount → decide onboarding vs settings, prefill toggles.
  useEffect(() => {
    fetch("/config")
      .then((r) => r.json())
      .then((c: Cfg) => {
        setCfg(c);
        setEmail(c.adminEmail ?? "");
        setExpose(c.expose);
        setTvweb(c.tvwebEnabled);
        setWorkflow(c.workflowEnabled);
        setStep(c.configured ? "options" : "welcome");
      })
      .catch(() => setCfg({ configured: false, expose: false, tvwebEnabled: true, workflowEnabled: false, adminEmail: "" }));
  }, []);

  function pollStatus() {
    fetch("/status")
      .then((r) => r.json())
      .then((j: { phase?: string; up?: boolean }) => {
        if (j.phase) setPhase(j.phase);
        if (j.up) {
          setPhase("ready");
          setStep("done");
          return;
        }
        setTimeout(pollStatus, 1200);
      })
      .catch(() => setTimeout(pollStatus, 1500));
  }

  async function submit() {
    setError("");
    try {
      const res = await fetch("/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adminEmail: firstRun ? email.trim() : undefined,
          adminPassword: firstRun ? password : undefined,
          expose,
          tvwebEnabled: tvweb,
          workflowEnabled: workflow,
        }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (!j.ok) {
        setError(j.error ?? "Something went wrong.");
        return;
      }
      setPhase("idle");
      setStep("provisioning");
      pollStatus();
    } catch {
      setError("Couldn't reach the Airwave service. Is it still running?");
    }
  }

  function continueFromAccount() {
    setError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setStep("options");
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-[460px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === "welcome" && (
              <Card>
                <div className="flex flex-col items-center py-6 text-center">
                  <Logo markWidth={92} wordmark animate />
                  <h1 className="mt-8 text-xl font-semibold">Welcome to Airwave</h1>
                  <p className="mt-2 max-w-[340px] text-sm text-muted-foreground">
                    Let's get your personal live-TV server set up. It runs right here on this machine, next to
                    Plex — takes about a minute.
                  </p>
                  <Button className="mt-8 w-full" onClick={() => setStep("account")}>
                    Get started
                    <ArrowRight className="ml-1 size-4" />
                  </Button>
                </div>
              </Card>
            )}

            {step === "account" && (
              <Card>
                <Header title="Create your admin account" subtitle="You'll sign in to the admin with this." />
                <div className="mt-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="at least 8 characters"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
                <Footer>
                  <Button variant="ghost" onClick={() => setStep("welcome")}>
                    Back
                  </Button>
                  <Button onClick={continueFromAccount}>
                    Continue
                    <ArrowRight className="ml-1 size-4" />
                  </Button>
                </Footer>
              </Card>
            )}

            {step === "options" && (
              <Card>
                <Header
                  title="Options"
                  subtitle={firstRun ? "You can change any of these later." : "Update your settings, then save to restart."}
                />
                <div className="mt-6 space-y-1">
                  <Toggle
                    icon={Wifi}
                    label="Expose on my network"
                    hint="Let TVs and other devices on your LAN connect to this server."
                    checked={expose}
                    onChange={setExpose}
                  />
                  <Toggle
                    icon={Tv}
                    label="TV web player"
                    hint="Serve the 10-foot TV player in the browser."
                    checked={tvweb}
                    onChange={setTvweb}
                  />
                  <Toggle
                    icon={Sparkles}
                    label="AI lineup workflows"
                    hint="Enable the durable AI channel-builder engine."
                    checked={workflow}
                    onChange={setWorkflow}
                  />
                </div>
                {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
                <Footer>
                  {firstRun ? (
                    <Button variant="ghost" onClick={() => setStep("account")}>
                      Back
                    </Button>
                  ) : (
                    <span />
                  )}
                  <Button onClick={submit}>{firstRun ? "Create & start Airwave" : "Save & restart"}</Button>
                </Footer>
              </Card>
            )}

            {step === "provisioning" && (
              <Card>
                <Header title="Setting up Airwave" subtitle="Hang tight — the first run can take a few minutes." />
                <Progress phase={phase} />
                <ul className="mt-6 space-y-2.5">
                  {PHASES.filter((p) => p.key !== "ready").map((p) => {
                    const cur = phaseIndex(phase);
                    const idx = phaseIndex(p.key);
                    const done = cur > idx || phase === "ready";
                    const active = cur === idx && phase !== "ready";
                    return (
                      <li key={p.key} className="flex items-center gap-3 text-sm">
                        <StatusDot done={done} active={active} />
                        <span className={done ? "text-muted-foreground" : active ? "text-foreground" : "text-muted-foreground/60"}>
                          {p.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            {step === "done" && (
              <Card>
                <div className="flex flex-col items-center py-6 text-center">
                  <motion.span
                    className="mb-5 flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  >
                    <Check className="size-8" strokeWidth={3} />
                  </motion.span>
                  <h1 className="text-xl font-semibold">Airwave is ready</h1>
                  <p className="mt-2 max-w-[340px] text-sm text-muted-foreground">
                    Your server is up and running. Open the admin to connect Plex and start building channels.
                  </p>
                  <Button className="mt-7 w-full" onClick={() => void fetch("/open-admin", { method: "POST" })}>
                    Open Airwave
                    <ArrowRight className="ml-1 size-4" />
                  </Button>
                  <p className="mt-5 text-xs text-muted-foreground">
                    You can close this window whenever — Airwave keeps running in your system tray.
                  </p>
                  {cfg?.serverLan && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      TVs on your network can connect at{" "}
                      <span className="font-mono text-foreground">{cfg.serverLan}</span>
                    </p>
                  )}
                </div>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-7 shadow-xl">{children}</div>;
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <div className="mb-5 flex items-center gap-2.5">
        <Logo markWidth={26} />
        <span className="text-sm font-semibold">Airwave</span>
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="mt-8 flex items-center justify-between gap-3">{children}</div>;
}

function Toggle({
  icon: Icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg px-1 py-3">
      <span className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          <span className="block text-sm font-medium">{label}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
        </span>
      </span>
      <Switch checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} />
    </label>
  );
}

function Progress({ phase }: { phase: string }) {
  const pct = phase === "ready" ? 100 : Math.round((phaseIndex(phase) / (PHASES.length - 1)) * 100);
  return (
    <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-muted">
      <motion.div
        className="h-full rounded-full bg-primary"
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(6, pct)}%` }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

function StatusDot({ done, active }: { done: boolean; active: boolean }) {
  if (done) {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (active) {
    return <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />;
  }
  return <span className="size-5 rounded-full border-2 border-border" />;
}
