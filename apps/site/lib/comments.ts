import { githubDiscussions } from "fuma-comment-github-discussions";
import { createOAuthRoutes } from "fuma-comment-github-discussions/next";

/**
 * Blog comments config — SERVER ONLY. Airwave stores blog comments in GitHub Discussions via the
 * `fuma-comment-github-discussions` package (which we extracted from this very integration and now
 * dogfood). This module reads the `GITHUB_COMMENTS_*` env and builds the storage/auth adapter + the
 * OAuth routes; the route handlers stay one line each.
 *
 * Env: GITHUB_COMMENTS_CLIENT_ID / CLIENT_SECRET (OAuth app), TOKEN_SECRET (cookie + state),
 * REPO / REPO_ID / CATEGORY / CATEGORY_ID, OWNER_LOGIN (moderator), READ_TOKEN (optional; falls back
 * to GITHUB_PROJECT_TOKEN). Cookie name `awc_gh` is kept for continuity with existing sign-ins.
 */

const COOKIE_NAME = "awc_gh";

function tokenSecret(): string {
  return process.env.GITHUB_COMMENTS_TOKEN_SECRET ?? "";
}

/** True when everything needed for readers to sign in and post is present (build-time env gate). */
export function commentsEnabled(): boolean {
  return Boolean(
    process.env.GITHUB_COMMENTS_CLIENT_ID &&
      process.env.GITHUB_COMMENTS_CLIENT_SECRET &&
      tokenSecret() &&
      process.env.GITHUB_COMMENTS_REPO &&
      process.env.GITHUB_COMMENTS_REPO_ID &&
      process.env.GITHUB_COMMENTS_CATEGORY_ID,
  );
}

/** The fuma-comment storage + auth adapter, backed by GitHub Discussions. */
export function commentsAdapter() {
  return githubDiscussions({
    repo: process.env.GITHUB_COMMENTS_REPO!,
    repoId: process.env.GITHUB_COMMENTS_REPO_ID!,
    categoryId: process.env.GITHUB_COMMENTS_CATEGORY_ID!,
    category: process.env.GITHUB_COMMENTS_CATEGORY,
    ownerLogins: process.env.GITHUB_COMMENTS_OWNER_LOGIN
      ? [process.env.GITHUB_COMMENTS_OWNER_LOGIN]
      : [],
    readToken: process.env.GITHUB_COMMENTS_READ_TOKEN || process.env.GITHUB_PROJECT_TOKEN,
    tokenSecret: tokenSecret(),
    cookieName: COOKIE_NAME,
    pageToUrl: (page) => `https://getairwave.tv/blog/${page}`,
  });
}

/** Reference GitHub OAuth login/callback/logout handlers (sign-in flow), sharing the cookie + secret. */
export function commentsOAuth() {
  return createOAuthRoutes({
    clientId: process.env.GITHUB_COMMENTS_CLIENT_ID!,
    clientSecret: process.env.GITHUB_COMMENTS_CLIENT_SECRET!,
    tokenSecret: tokenSecret(),
    cookieName: COOKIE_NAME,
    callbackPath: "/api/comments/oauth/callback",
    defaultReturnPath: "/blog",
  });
}
