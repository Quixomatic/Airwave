import { NextResponse } from "next/server";

import { commentsConfig, commentsConfigured } from "@/lib/comments/config";
import { decodeState, encrypt } from "@/lib/comments/crypto";
import { TOKEN_MAX_AGE, tokenCookie } from "@/lib/comments/session";

/**
 * GET /api/comments/oauth/callback?code&state → GitHub redirects here after the user authorizes.
 * We exchange the code for a user access token, store it encrypted in an httpOnly cookie, and bounce
 * the browser back to the post it came from.
 */
const GITHUB_ACCESS_TOKEN = "https://github.com/login/oauth/access_token";

function origin(request: Request): string {
  const h = request.headers;
  const proto = h.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(request.url).host;
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  if (!commentsConfigured()) {
    return NextResponse.json({ message: "Comments are not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const self = origin(request);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  let returnUrl = `${self}/blog`;
  if (state) {
    try {
      returnUrl = decodeState(state, commentsConfig.tokenSecret);
    } catch {
      return NextResponse.json({ message: "Invalid or expired sign-in state" }, { status: 400 });
    }
  }

  // User declined, or GitHub returned an error — just send them back, still signed out.
  if (error || !code) return NextResponse.redirect(returnUrl);

  let accessToken: string;
  try {
    const res = await fetch(GITHUB_ACCESS_TOKEN, {
      method: "POST",
      headers: { Accept: "application/json", "User-Agent": "airwave-comments" },
      body: new URLSearchParams({
        client_id: commentsConfig.clientId,
        client_secret: commentsConfig.clientSecret,
        code,
      }),
    });
    if (!res.ok) throw new Error(`token exchange status ${res.status}`);
    const data = (await res.json()) as { access_token?: string; error?: string };
    if (!data.access_token) throw new Error(data.error ?? "no access_token");
    accessToken = data.access_token;
  } catch (err) {
    console.error("[comments] oauth exchange failed:", err);
    return NextResponse.json({ message: "GitHub sign-in failed" }, { status: 502 });
  }

  const response = NextResponse.redirect(returnUrl);
  response.cookies.set(tokenCookie(encrypt(accessToken, commentsConfig.tokenSecret), TOKEN_MAX_AGE));
  return response;
}
