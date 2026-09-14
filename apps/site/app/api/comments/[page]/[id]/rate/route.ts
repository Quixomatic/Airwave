import { NextResponse } from "next/server";

import { getViewerReactions, setReaction } from "@/lib/comments/github";
import { readUserToken } from "@/lib/comments/session";

/**
 * POST   /api/comments/:page/:id/rate  { like } → like (👍) or dislike (👎) via GitHub reactions
 * DELETE /api/comments/:page/:id/rate            → clear the viewer's rating
 * A like/dislike is exclusive, so setting one removes the other. We read the viewer's current state
 * first and only make real transitions (removing a reaction the viewer lacks errors on GitHub).
 * Responses carry a JSON body ({}) because the fuma-comment fetcher always parses the response as JSON.
 */

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await readUserToken();
  if (!token) return NextResponse.json({ message: "Sign in to react" }, { status: 401 });

  let like: boolean;
  try {
    ({ like } = (await request.json()) as { like: boolean });
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }

  try {
    const state = await getViewerReactions(id, token);
    if (like) {
      if (!state.up) await setReaction(id, "THUMBS_UP", "add", token);
      if (state.down) await setReaction(id, "THUMBS_DOWN", "remove", token);
    } else {
      if (!state.down) await setReaction(id, "THUMBS_DOWN", "add", token);
      if (state.up) await setReaction(id, "THUMBS_UP", "remove", token);
    }
    return NextResponse.json({});
  } catch (err) {
    console.error("[comments] rate failed:", err);
    return NextResponse.json({ message: "Could not react" }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await readUserToken();
  if (!token) return NextResponse.json({ message: "Sign in to react" }, { status: 401 });

  try {
    const state = await getViewerReactions(id, token);
    if (state.up) await setReaction(id, "THUMBS_UP", "remove", token);
    if (state.down) await setReaction(id, "THUMBS_DOWN", "remove", token);
    return NextResponse.json({});
  } catch (err) {
    console.error("[comments] clear rate failed:", err);
    return NextResponse.json({ message: "Could not react" }, { status: 502 });
  }
}
