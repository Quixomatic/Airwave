"use client";

import { ChevronUp } from "lucide-react";
import { useState } from "react";

import type { RoadmapItem } from "@/lib/roadmap";

/**
 * The roadmap list — one ranked row per item (highest-voted first), each with a vertical upvote
 * button + a Status badge. Optimistic: a click flips the button + count instantly, POSTs the toggle,
 * then reconciles to the server's `{ voteCount, hasVoted }` (or reverts on error). Order is fixed for
 * the session so a vote doesn't make rows jump; a reload re-ranks.
 */

type Row = RoadmapItem & { pending: boolean };

/** Map a Project Status option → a badge style. Unknown/blank statuses render no badge. */
function statusBadge(status: string): { label: string; className: string } | null {
  const key = status.trim().toLowerCase();
  if (!key) return null;
  // In-progress → filled primary; shipped → emerald; exploring/considering → secondary; planned/other → outline.
  if (key.includes("progress") || key.includes("building")) {
    return { label: status, className: "border-transparent bg-fd-primary/10 text-fd-primary" };
  }
  if (key.includes("ship") || key.includes("done") || key.includes("released") || key.includes("live")) {
    return { label: status, className: "border-transparent bg-emerald-500/10 text-emerald-500" };
  }
  if (key.includes("explor") || key.includes("consider") || key.includes("idea")) {
    return { label: status, className: "border-transparent bg-fd-secondary text-fd-secondary-foreground" };
  }
  return { label: status, className: "border-fd-border text-fd-foreground" };
}

function Badge({ status }: { status: string }) {
  const b = statusBadge(status);
  if (!b) return null;
  return (
    <span
      className={`inline-flex h-5 w-fit shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${b.className}`}
    >
      {b.label}
    </span>
  );
}

function VoteButton({ item, onVote }: { item: Row; onVote: (item: Row) => void }) {
  return (
    <button
      type="button"
      onClick={() => onVote(item)}
      disabled={item.pending}
      aria-pressed={item.hasVoted}
      aria-label={`Vote for ${item.title}`}
      className={`flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 transition-colors disabled:opacity-60 ${
        item.hasVoted
          ? "border-fd-primary bg-fd-primary/5 text-fd-primary"
          : "border-fd-border bg-fd-card text-fd-foreground hover:border-fd-primary hover:text-fd-primary"
      }`}
    >
      <ChevronUp className="size-4" />
      <span className="text-sm font-semibold tabular-nums">{item.voteCount}</span>
    </button>
  );
}

export function RoadmapBoard({ items, configured }: { items: RoadmapItem[]; configured: boolean }) {
  const [rows, setRows] = useState<Row[]>(items.map((i) => ({ ...i, pending: false })));

  async function onVote(item: Row) {
    if (item.pending) return;
    const optimisticVoted = !item.hasVoted;

    // Optimistic flip.
    setRows((prev) =>
      prev.map((r) =>
        r.id === item.id
          ? { ...r, pending: true, hasVoted: optimisticVoted, voteCount: r.voteCount + (optimisticVoted ? 1 : -1) }
          : r,
      ),
    );

    try {
      const res = await fetch("/api/roadmap/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { voteCount: number; hasVoted: boolean };
      // Reconcile to the server's truth.
      setRows((prev) =>
        prev.map((r) =>
          r.id === item.id ? { ...r, pending: false, voteCount: data.voteCount, hasVoted: data.hasVoted } : r,
        ),
      );
    } catch {
      // Revert on failure.
      setRows((prev) =>
        prev.map((r) =>
          r.id === item.id
            ? {
                ...r,
                pending: false,
                hasVoted: item.hasVoted,
                voteCount: item.voteCount,
              }
            : r,
        ),
      );
    }
  }

  if (!configured || rows.length === 0) {
    return (
      <div className="mt-12 rounded-xl border border-fd-border bg-fd-card/40 p-10 text-center md:mt-14">
        <p className="text-fd-muted-foreground">
          {configured
            ? "No roadmap items yet — check back soon."
            : "The roadmap is being set up. Check back soon."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-12 divide-y divide-fd-border/60 border-y border-fd-border/60 md:mt-14">
      {rows.map((item) => (
        <div key={item.id} className="flex items-start gap-5 py-5">
          <VoteButton item={item} onVote={onVote} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h3 className="text-pretty text-base font-semibold text-fd-foreground">{item.title}</h3>
              <Badge status={item.status} />
            </div>
            {item.description ? (
              <p className="mt-1 text-pretty text-sm text-fd-muted-foreground">{item.description}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
