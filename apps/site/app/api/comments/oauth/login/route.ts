import { NextResponse } from "next/server";

import { commentsConfig, commentsConfigured } from "@/lib/comments/config";
import { encodeState } from "@/lib/comments/crypto";

/**
 * GET /api/comments/oauth/login?return=<url> → kick off GitHub OAuth. We stash the return URL in an
 * encrypted, expiring `state`, then bounce to GitHub's authorize page. Scope `public_repo` is what
 * lets the user create/comment on discussions in our public repo as themselves.
 */
const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";

function origin(request: Request): string {
  const h = request.headers;
  const proto = h.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(request.url).host;
  return `${proto}://${host}`;
}

export function GET(request: Request) {
  if (!commentsConfigured()) {
    return NextResponse.json({ message: "Comments are not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const self = origin(request);
  const requested = url.searchParams.get("return") ?? `${self}/blog`;

  // Only ever return the browser to our own origin (no open redirect).
  let returnUrl = `${self}/blog`;
  try {
    const parsed = new URL(requested, self);
    if (parsed.origin === self) returnUrl = parsed.href;
  } catch {
    /* keep default */
  }

  const state = encodeState(returnUrl, commentsConfig.tokenSecret);
  const params = new URLSearchParams({
    client_id: commentsConfig.clientId,
    redirect_uri: `${self}/api/comments/oauth/callback`,
    scope: "public_repo",
    state,
  });
  return NextResponse.redirect(`${GITHUB_AUTHORIZE}?${params.toString()}`);
}
