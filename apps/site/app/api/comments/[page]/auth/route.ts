import { NextResponse } from "next/server";

import { commentsConfig } from "@/lib/comments/config";
import { getViewerLogin } from "@/lib/comments/github";
import { readUserToken } from "@/lib/comments/session";
import type { AuthInfoWithRole } from "@/lib/comments/types";

/**
 * GET /api/comments/:page/auth → the signed-in reader's identity + role, or 401 when signed out
 * (fuma-comment reads a non-200 here as "not logged in" and shows the sign-in button).
 */
export async function GET() {
  const token = await readUserToken();
  if (!token) return NextResponse.json({ message: "Not signed in" }, { status: 401 });

  try {
    const login = await getViewerLogin(token);
    if (!login) return NextResponse.json({ message: "Not signed in" }, { status: 401 });

    const isOwner =
      commentsConfig.ownerLogin && login.toLowerCase() === commentsConfig.ownerLogin.toLowerCase();
    const body: AuthInfoWithRole = {
      id: login,
      // Everyone can edit/delete their own (matched by id); only the maintainer can delete others'.
      role: isOwner ? { name: "maintainer", canDelete: true } : null,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[comments] auth failed:", err);
    return NextResponse.json({ message: "Not signed in" }, { status: 401 });
  }
}
