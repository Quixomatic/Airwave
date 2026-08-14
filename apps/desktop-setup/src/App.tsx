import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ChevronDown, Globe, Sparkles, Tv, Wifi } from "lucide-react";
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
  serverAddress?: string;
  webAddress?: string;
  extraCorsOrigins?: string;
};

type Step = "welcome" | "account" | "options" | "provisioning" | "done";

type Media = {
  state: "idle" | "downloading" | "extracting" | "ready" | "failed" | "skipped";
  downloaded: number;
  total: number;
  error?: string;
};
const mb = (n: number) => `${(n / 1e6).toFixed(0)} MB`;
const mpct = (m: Media) => (m.total ? Math.min(100, Math.round((m.downloaded / m.total) * 100)) : 0);

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
  const [serverAddress, setServerAddress] = useState("");
  const [webAddress, setWebAddress] = useState("");
  const [extraCorsOrigins, setExtraCorsOrigins] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("idle");
  const [media, setMedia] = useState<Media | null>(null);

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
        setServerAddress(c.serverAddress ?? "");
        setWebAddress(c.webAddress ?? "");
        setExtraCorsOrigins(c.extraCorsOrigins ?? "");
        setShowAdvanced(Boolean(c.serverAddress || c.webAddress || c.extraCorsOrigins));
        setStep(c.configured ? "options" : "welcome");
      })
      .catch(() => setCfg({ configured: false, expose: false, tvwebEnabled: true, workflowEnabled: false, adminEmail: "" }));
  }, []);

  function pollStatus() {
    fetch("/status")
      .then((r) => r.json())
      .then((j: { phase?: string; up?: boolean; media?: Media }) => {
        if (j.phase) setPhase(j.phase);
        if (j.media) setMedia(j.media);
        // Wait for BOTH the stack to be up AND the capability-media step to reach a terminal state, so the user
        // sees the download finish (it runs in parallel with the stack boot).
        const mediaDone = !j.media || ["ready", "skipped", "failed"].includes(j.media.state);
        if (j.up && mediaDone) {
          setPhase("ready");
          setStep("done");
          return;
        }
        setTimeout(pollStatus, 1000);
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
          serverAddress,
          webAddress,
          extraCorsOrigins,
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
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Globe className="size-4" />
                    Remote access &amp; tunnels
                    <ChevronDown className={`ml-auto size-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                  </button>
                  {showAdvanced && (
                    <div className="mt-2 space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        Leave blank for local use. Set these to reach Airwave over a domain / HTTPS tunnel (e.g.
                        Cloudflare) — mirrors self-host <span className="font-mono">SERVER_PUBLIC_URL</span> /{" "}
                        <span className="font-mono">WEB_PUBLIC_URL</span> /{" "}
                        <span className="font-mono">EXTRA_CORS_ORIGINS</span>.
                      </p>
                      <Adv
                        label="Server address"
                        placeholder="https://tv.example.com"
                        value={serverAddress}
                        onChange={setServerAddress}
                        hint="Where the admin + TVs reach the API. Blank = localhost (admin) / your LAN IP (TVs)."
                      />
                      <Adv
                        label="Admin address"
                        placeholder="https://tv-admin.example.com"
                        value={webAddress}
                        onChange={setWebAddress}
                        hint="Where you open the admin. Blank = the local admin URL."
                      />
                      <Adv
                        label="Additional allowed origins"
                        placeholder="http://192.168.1.156:36021, https://…"
                        value={extraCorsOrigins}
                        onChange={setExtraCorsOrigins}
                        hint="Comma-separated extra origins allowed to sign in (CORS)."
                      />
                    </div>
                  )}
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
                {media && media.state !== "skipped" && media.state !== "idle" && (
                  <div className="mt-4 rounded-lg border border-border/60 bg-muted/30 p-3">
                    <div className="flex items-center gap-3 text-sm">
                      <StatusDot done={media.state === "ready"} active={media.state === "downloading" || media.state === "extracting"} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">TV capability media</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {media.state === "downloading" && `Downloading… ${mb(media.downloaded)} / ${mb(media.total)} (${mpct(media)}%)`}
                          {media.state === "extracting" && "Extracting…"}
                          {media.state === "ready" && "Ready — codec-probe clips installed"}
                          {media.state === "failed" && "Couldn't download (optional — Airwave still works; retries next launch)"}
                        </span>
                      </span>
                    </div>
                    {media.state === "downloading" && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(3, mpct(media))}%` }} />
                      </div>
                    )}
                  </div>
                )}
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

function Adv({
  label,
  placeholder,
  value,
  onChange,
  hint,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="none"
      />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
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
