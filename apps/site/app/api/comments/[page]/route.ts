import { NextResponse } from "next/server";

import { commentsConfigured, commentsReadable } from "@/lib/comments/config";
import { docToMarkdown, validateContent } from "@/lib/comments/content";
import { addComment, findDiscussion } from "@/lib/comments/github";
import { buildList, mapComment } from "@/lib/comments/mapping";
import { findOrCreateDiscussion, pageTerm, readToken } from "@/lib/comments/service";
import { readUserToken } from "@/lib/comments/session";
import type { JSONContent } from "@/lib/comments/types";

/**
 * GET  /api/comments/:page                 → list comments (top-level, or a thread's replies)
 * POST /api/comments/:page  { thread?, content } → add a comment/reply (requires GitHub sign-in)
 * These implement the fuma-comment fetcher contract, backed by GitHub Discussions.
 */

function num(v: string | null): number | undefined {
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: raw } = await params;
  const page = decodeURIComponent(raw);
  if (!commentsReadable()) return NextResponse.json([]);

  const token = await readToken();
  if (!token) return NextResponse.json([]);

  const url = new URL(request.url);
  const sortParam = url.searchParams.get("sort");
  try {
    const { discussion } = await findDiscussion(pageTerm(page), token);
    const list = buildList(discussion, page, {
      thread: url.searchParams.get("thread") ?? undefined,
      sort: sortParam === "oldest" ? "oldest" : "newest",
      before: num(url.searchParams.get("before")),
      after: num(url.searchParams.get("after")),
      limit: num(url.searchParams.get("limit")),
    });
    return NextResponse.json(list);
  } catch (err) {
    console.error("[comments] list failed:", err);
    return NextResponse.json([]);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: raw } = await params;
  const page = decodeURIComponent(raw);
  if (!commentsConfigured()) {
    return NextResponse.json({ message: "Comments are not configured" }, { status: 503 });
  }

  const token = await readUserToken();
  if (!token) return NextResponse.json({ message: "Sign in to comment" }, { status: 401 });

  let content: unknown;
  let thread: string | undefined;
  try {
    const body = (await request.json()) as { content?: unknown; thread?: unknown };
    content = body.content;
    thread = typeof body.thread === "string" ? body.thread : undefined;
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }

  const invalid = validateContent(content);
  if (invalid) return NextResponse.json({ message: invalid }, { status: 400 });

  try {
    const markdown = docToMarkdown(content as JSONContent);
    const discussion = await findOrCreateDiscussion(page, token);
    const comment = await addComment(discussion.id, markdown, token, thread);
    return NextResponse.json(mapComment(comment, page, thread));
  } catch (err) {
    console.error("[comments] post failed:", err);
    return NextResponse.json({ message: "Could not post comment" }, { status: 502 });
  }
}
