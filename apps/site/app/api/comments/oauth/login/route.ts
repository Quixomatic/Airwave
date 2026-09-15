import { commentsOAuth } from "@/lib/comments";

/** GET /api/comments/oauth/login?return=<url> → start GitHub OAuth (from the comments package). */
export const GET = commentsOAuth().login;
