import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy (Next 16's renamed Middleware). Ensures a stable, first-party `rmv_id` cookie exists for the
 * roadmap's login-less voting — a per-browser identity so a reload shows "you've upvoted this" and the
 * same browser can't stack votes. Set on the forwarded request (so the same render/handler reads it) AND
 * on the response (so the browser persists it). Scoped to the roadmap surfaces only via `matcher`.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("rmv_id")) {
    return NextResponse.next();
  }

  const id = crypto.randomUUID();
  request.cookies.set("rmv_id", id);
  const res = NextResponse.next({ request });
  res.cookies.set("rmv_id", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // ~1 year
  });
  return res;
}

export const config = {
  matcher: ["/roadmap", "/api/roadmap/:path*"],
};
