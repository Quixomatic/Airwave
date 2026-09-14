import { commentsConfig } from "./config";
import { createDiscussion, findDiscussion, type GDiscussion } from "./github";
import { readUserToken } from "./session";

/**
 * Ties config + session + GitHub together so the route handlers stay thin (business logic lives here,
 * per the repo's thin-endpoints convention).
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://getairwave.tv";

/** The canonical Discussion title for a blog page — one discussion per post, keyed by its slug. */
export function pageTerm(page: string): string {
  return page;
}

export function pageUrl(page: string): string {
  return `${SITE_URL.replace(/\/$/, "")}/blog/${page}`;
}

/** Token for reads: the signed-in reader's (accurate viewer flags), else the server read token. */
export async function readToken(): Promise<string | null> {
  return (await readUserToken()) ?? commentsConfig.readToken ?? null;
}

/**
 * Find the post's discussion, creating it on first write (reads never create). The container is
 * created with the server/maintainer token when available — so a category that restricts who may
 * OPEN a thread still works (any signed-in user can COMMENT on an existing one) — falling back to the
 * commenter's own token if the server token can't (e.g. lacks discussion-write scope).
 */
export async function findOrCreateDiscussion(page: string, userToken: string): Promise<GDiscussion> {
  const term = pageTerm(page);
  const { discussion } = await findDiscussion(term, userToken);
  if (discussion) return discussion;

  const url = pageUrl(page);
  const createToken = commentsConfig.readToken || userToken;
  try {
    return await createDiscussion(term, url, createToken);
  } catch (err) {
    if (createToken === userToken) throw err;
    console.warn("[comments] server-token discussion create failed, retrying as user:", err);
    return createDiscussion(term, url, userToken);
  }
}
