import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import { roadmapConfigured, toggleVote, voterHash } from "@/lib/roadmap";

/**
 * POST /api/roadmap/vote  { itemId }  → toggles the requester's vote on one roadmap draft item.
 * Identity = the `rmv_id` cookie (set by `proxy.ts`) + client IP + VOTE_SALT, hashed server-side.
 * Rate-limited per IP to blunt spam bursts. Returns `{ voteCount, hasVoted }`.
 */

// Best-effort per-IP rate limit. In-memory ⇒ per serverless instance only (accepted; rough abuse guard).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  if (!roadmapConfigured()) {
    return NextResponse.json({ error: "Roadmap not configured" }, { status: 503 });
  }

  const ip = ((await headers()).get("x-forwarded-for")?.split(",")[0] ?? "").trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many votes, slow down" }, { status: 429 });
  }

  let itemId: unknown;
  try {
    ({ itemId } = (await request.json()) as { itemId?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof itemId !== "string" || !itemId) {
    return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
  }

  const rmvId = (await cookies()).get("rmv_id")?.value;
  if (!rmvId) {
    // proxy.ts should have set this; if it's genuinely absent we can't identify the voter.
    return NextResponse.json({ error: "No voter id" }, { status: 400 });
  }

  try {
    const result = await toggleVote(itemId, voterHash(rmvId, ip));
    return NextResponse.json(result);
  } catch (err) {
    console.error("[roadmap] vote failed:", err);
    return NextResponse.json({ error: "Vote failed" }, { status: 502 });
  }
}
