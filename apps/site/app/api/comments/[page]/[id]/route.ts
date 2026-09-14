import { NextResponse } from "next/server";

import { docToMarkdown, validateContent } from "@/lib/comments/content";
import { deleteComment, updateComment } from "@/lib/comments/github";
import { readUserToken } from "@/lib/comments/session";
import type { JSONContent } from "@/lib/comments/types";

/**
 * PATCH  /api/comments/:page/:id  { content } → edit a comment (author only, enforced by GitHub)
 * DELETE /api/comments/:page/:id                → delete a comment (author or maintainer)
 */

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await readUserToken();
  if (!token) return NextResponse.json({ message: "Sign in to edit" }, { status: 401 });

  let content: unknown;
  try {
    ({ content } = (await request.json()) as { content?: unknown });
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }

  const invalid = validateContent(content);
  if (invalid) return NextResponse.json({ message: invalid }, { status: 400 });

  try {
    await updateComment(id, docToMarkdown(content as JSONContent), token);
    // JSON body (not an empty 204): the fuma-comment fetcher always parses the response as JSON.
    return NextResponse.json({});
  } catch (err) {
    console.error("[comments] edit failed:", err);
    return NextResponse.json({ message: "Could not edit comment" }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await readUserToken();
  if (!token) return NextResponse.json({ message: "Sign in to delete" }, { status: 401 });

  try {
    await deleteComment(id, token);
    return NextResponse.json({});
  } catch (err) {
    console.error("[comments] delete failed:", err);
    return NextResponse.json({ message: "Could not delete comment" }, { status: 502 });
  }
}
