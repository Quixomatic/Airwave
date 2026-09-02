import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { AlertCircle, Check, ChevronRight, LayoutGrid, Loader2, Server, Tv, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@airwave/ui/components/collapsible";
import { cn } from "@airwave/ui/lib/utils";

import { trpc } from "@/utils/trpc";

type Step = { key: string; label: string; icon: LucideIcon; href: string };

const STEPS: Step[] = [
  { key: "source", label: "Connect a source", icon: Server, href: "/sources" },
  { key: "sync", label: "Sync media metadata", icon: Tv, href: "/sources" },
  { key: "channel", label: "Create your first channel", icon: Tv, href: "/channels" },
  { key: "package", label: "Create your first package", icon: LayoutGrid, href: "/packages" },
  { key: "users", label: "Import Plex users", icon: Users, href: "/users" },
];

type RowState = "done" | "syncing" | "failed" | "todo";

const COLLAPSE_KEY = "airwave.onboarding.collapsed";
const DISMISS_KEY = "airwave.onboarding.dismissed";

/** Circular "N/5" progress dial — two SVG circles, foreground animated via stroke-dashoffset. */
function Donut({ done, total }: { done: number; total: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <span className="relative inline-flex size-8 items-center justify-center">
      <svg viewBox="0 0 24 24" className="size-8 -rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2.5" className="stroke-muted" />
        <motion.circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="stroke-primary"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute text-[10px] font-semibold tabular-nums text-foreground">{done}</span>
    </span>
  );
}

/** The per-row status marker: filled check (done), spinner (syncing), alert (failed), empty ring (todo). */
function Marker({ state }: { state: RowState }) {
  if (state === "done") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === "syncing") {
    return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />;
  }
  if (state === "failed") {
    return <AlertCircle className="size-4 shrink-0 text-destructive" />;
  }
  return <span className="size-4 shrink-0 rounded-full border-[1.5px] border-border" />;
}

export function OnboardingChecklist() {
  const status = useQuery({
    ...trpc.onboarding.status.queryOptions(),
    // Poll fast while there's still setup to do (the sync spinner + step ticks update live, and nothing else
    // invalidates this query). Once every step is done, drop to a lazy cadence — from here the state only
    // changes on a deliberate user action, so a tight poll is pure noise.
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && d.doneCount >= d.total ? 30_000 : 5_000;
    },
  });
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);
  const [dismissed, setDismissed] = useState<boolean>(() => localStorage.getItem(DISMISS_KEY) === "1");
  useEffect(() => {
    localStorage.setItem(DISMISS_KEY, dismissed ? "1" : "0");
  }, [dismissed]);

  const s = status.data;
  // Show the checklist ALWAYS — even at 5/5 — until the user explicitly hides it via the footer button
  // (persisted to localStorage). So progress stays visible after completion until they choose to dismiss it.
  if (!s || dismissed) return null;

  const rowState = (key: string): RowState => {
    switch (key) {
      case "source":
        return s.hasSource ? "done" : "todo";
      case "sync":
        return s.sync === "synced" ? "done" : s.sync === "syncing" ? "syncing" : s.sync === "failed" ? "failed" : "todo";
      case "channel":
        return s.hasChannel ? "done" : "todo";
      case "package":
        return s.hasPackage ? "done" : "todo";
      case "users":
        return s.hasImportedUsers ? "done" : "todo";
      default:
        return "todo";
    }
  };

  return (
    // Hidden when the sidebar is collapsed to icons (matches the nav group behaviour).
    <div className="mt-3 px-2 pb-2 group-data-[collapsible=icon]:hidden">
      <div className="rounded-xl border border-border bg-card/60 p-3 shadow-sm">
        <Collapsible open={!collapsed} onOpenChange={(o) => setCollapsed(!o)}>
          <CollapsibleTrigger
            render={
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left"
                aria-label="Toggle setup checklist"
              />
            }
          >
            <Donut done={s.doneCount} total={s.total} />
            <span className="flex-1">
              <span className="block text-sm font-semibold leading-tight text-foreground">
                {s.doneCount >= s.total ? "You're all set!" : "Get set up"}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {s.doneCount} of {s.total} done
              </span>
            </span>
            <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", !collapsed && "rotate-90")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 space-y-0.5">
              {STEPS.map((step) => {
                const st = rowState(step.key);
                return (
                  <li key={step.key}>
                    <Link
                      to={step.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[13px] transition-colors hover:bg-accent",
                        st === "done" && "text-muted-foreground",
                      )}
                    >
                      <Marker state={st} />
                      <span className={cn("flex-1 leading-tight", st === "done" && "line-through decoration-muted-foreground/40")}>
                        {step.label}
                      </span>
                      {st === "syncing" && <span className="text-[10px] text-primary">Syncing…</span>}
                      {st === "failed" && <span className="text-[10px] text-destructive">Failed</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-1.5 flex justify-center border-t border-border/50 pt-1.5">
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Hide checklist
              </button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
