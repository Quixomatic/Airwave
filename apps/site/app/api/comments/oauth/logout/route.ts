import { NextResponse } from "next/server";

import { tokenCookie } from "@/lib/comments/session";

/**
 * GET /api/comments/oauth/logout?return=<url> → clear the token cookie and send the reader back.
 * (We don't revoke the token at GitHub; the user can do that from their GitHub settings.)
 */
function origin(request: Request): string {
  const h = request.headers;
  const proto = h.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(request.url).host;
  return `${proto}://${host}`;
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const self = origin(request);
  let returnUrl = `${self}/blog`;
  try {
    const parsed = new URL(url.searchParams.get("return") ?? returnUrl, self);
    if (parsed.origin === self) returnUrl = parsed.href;
  } catch {
    /* keep default */
  }

  const response = NextResponse.redirect(returnUrl);
  response.cookies.set(tokenCookie("", 0));
  return response;
}
