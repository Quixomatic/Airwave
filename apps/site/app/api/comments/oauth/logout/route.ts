import { commentsOAuth } from "@/lib/comments";

/** GET /api/comments/oauth/logout?return=<url> → clear the token cookie and redirect back. */
export const GET = commentsOAuth().logout;
