import { cookies, headers } from "next/headers";

import { Container } from "@/components/marketing";
import { getRoadmap, roadmapConfigured, voterHash } from "@/lib/roadmap";

import { RoadmapBoard } from "./roadmap-board";

export const metadata = {
  title: "Roadmap",
  description:
    "What's next for Airwave — upvote the features you want most. No login required; the top-voted items get built first.",
};

// Per-visitor (cookie + IP → hasVoted) and always-fresh vote counts, so never statically rendered.
export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const rmvId = (await cookies()).get("rmv_id")?.value ?? "";
  const ip = ((await headers()).get("x-forwarded-for")?.split(",")[0] ?? "").trim();
  const hash = rmvId ? voterHash(rmvId, ip) : null;

  const items = (await getRoadmap(hash)).sort((a, b) => b.voteCount - a.voteCount);

  return (
    <main className="flex-1">
      <Container className="py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-fd-primary">Roadmap</p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            You vote, we build
          </h1>
          <p className="mt-4 text-pretty text-base text-fd-muted-foreground sm:text-lg">
            What&rsquo;s coming to Airwave, ranked by the features people want most. Upvote what matters to you
            &mdash; no login required &mdash; and it moves up the list.
          </p>
        </div>

        <RoadmapBoard items={items} configured={roadmapConfigured()} />
      </Container>
    </main>
  );
}
