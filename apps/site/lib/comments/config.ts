/**
 * Blog-comments config — SERVER ONLY. Comments are stored as GitHub **Discussions** on the public
 * Airwave repo (readers sign in with GitHub to post), presented through the fuma-comment UI. This
 * module reads every secret/id from the environment and reports whether the feature is wired.
 *
 * Env (set in Vercel + local `.env`, never committed):
 *   GITHUB_COMMENTS_CLIENT_ID / GITHUB_COMMENTS_CLIENT_SECRET  — the "Airwave - Discussions" OAuth App
 *   GITHUB_COMMENTS_TOKEN_SECRET   — 32+ random chars; encrypts the OAuth state + the token cookie
 *   GITHUB_COMMENTS_REPO           — "Quixomatic/Airwave"
 *   GITHUB_COMMENTS_REPO_ID        — repository node id (R_...) for createDiscussion
 *   GITHUB_COMMENTS_CATEGORY       — the Discussions category NAME used for blog threads
 *   GITHUB_COMMENTS_CATEGORY_ID    — that category's node id (DIC_...) for createDiscussion
 *   GITHUB_COMMENTS_OWNER_LOGIN    — the maintainer login that may moderate (delete any comment)
 *   GITHUB_COMMENTS_READ_TOKEN     — server PAT for anonymous reads (falls back to GITHUB_PROJECT_TOKEN)
 */

export const GITHUB_GRAPHQL = "https://api.github.com/graphql";

export const commentsConfig = {
  clientId: process.env.GITHUB_COMMENTS_CLIENT_ID ?? "",
  clientSecret: process.env.GITHUB_COMMENTS_CLIENT_SECRET ?? "",
  tokenSecret: process.env.GITHUB_COMMENTS_TOKEN_SECRET ?? "",
  repo: process.env.GITHUB_COMMENTS_REPO ?? "",
  repoId: process.env.GITHUB_COMMENTS_REPO_ID ?? "",
  category: process.env.GITHUB_COMMENTS_CATEGORY ?? "",
  categoryId: process.env.GITHUB_COMMENTS_CATEGORY_ID ?? "",
  ownerLogin: process.env.GITHUB_COMMENTS_OWNER_LOGIN ?? "",
  readToken: process.env.GITHUB_COMMENTS_READ_TOKEN ?? process.env.GITHUB_PROJECT_TOKEN ?? "",
} as const;

/** Everything needed for readers to sign in and post. */
export function commentsConfigured(): boolean {
  const c = commentsConfig;
  return Boolean(
    c.clientId && c.clientSecret && c.tokenSecret && c.repo && c.repoId && c.categoryId,
  );
}

/** Reads (listing existing comments) only need a way to talk to GitHub, not the OAuth App. */
export function commentsReadable(): boolean {
  return Boolean(commentsConfig.repo && (commentsConfig.readToken || commentsConfig.clientId));
}

/** The cookie the encrypted GitHub user token lives in (httpOnly, so client JS never sees it). */
export const TOKEN_COOKIE = "awc_gh";
