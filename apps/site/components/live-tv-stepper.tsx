"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type StepperStep = { title: string; description: string };

/**
 * A vertical "title" stepper (reui-style) that mocks running THROUGH the steps: the current step shows a
 * spinner, then flips to a check and the next step starts, filling the connector as it goes. After the last
 * step completes it holds briefly, then resets and loops. Honors prefers-reduced-motion by showing every step
 * completed and static. Self-contained (plain React + Tailwind) so it works inside the fumadocs site.
 */
export function LiveTvStepper({ steps }: { steps: StepperStep[] }) {
  // `active` = index currently loading; === steps.length means "all done, holding before the loop restarts".
  const [active, setActive] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>(() => steps.map(() => false));
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) {
      setActive(steps.length);
      setCompleted(steps.map(() => true));
      return;
    }
    const STEP_MS = 1500;
    const HOLD_MS = 1900;
    let timer: ReturnType<typeof setTimeout>;
    if (active < steps.length) {
      timer = setTimeout(() => {
        setCompleted((c) => c.map((v, i) => (i === active ? true : v)));
        setActive((a) => a + 1);
      }, STEP_MS);
    } else {
      timer = setTimeout(() => {
        setCompleted(steps.map(() => false));
        setActive(0);
      }, HOLD_MS);
    }
    return () => clearTimeout(timer);
  }, [active, reduced, steps.length]);

  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const isDone = completed[i];
        const isActive = i === active && !isDone;
        const isLast = i === steps.length - 1;
        return (
          <li key={step.title} className="flex gap-4">
            {/* Indicator column: circle on top, connector line filling the gap to the next step. */}
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium transition-colors duration-300",
                  isDone && "border-emerald-500 bg-emerald-500 text-white",
                  isActive && "border-brand bg-brand/10 text-brand",
                  !isDone && !isActive && "border-fd-border bg-fd-card text-fd-muted-foreground",
                )}
              >
                {isDone ? (
                  <Check className="size-4" />
                ) : isActive ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  i + 1
                )}
              </span>
              {!isLast && (
                <span
                  aria-hidden
                  className={cn(
                    "my-1.5 w-0.5 flex-1 rounded-full transition-colors duration-500",
                    isDone ? "bg-emerald-500" : "bg-fd-border",
                  )}
                />
              )}
            </div>
            {/* Title + description. */}
            <div className={cn("pt-0.5", isLast ? "pb-0" : "pb-6")}>
              <h4
                className={cn(
                  "font-medium transition-colors",
                  isDone || isActive ? "text-landing-foreground" : "text-fd-muted-foreground",
                )}
              >
                {step.title}
              </h4>
              <p className="mt-1 text-sm text-fd-muted-foreground">{step.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
